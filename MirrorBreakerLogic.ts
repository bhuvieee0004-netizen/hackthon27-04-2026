/**
 * MirrorBreaker Logic Engine
 * Role: Senior Embedded ML Engineer & DSP Specialist
 * Focus: Physiological markers, scoring, and math logic.
 */

// --- Constants & Thresholds ---
export const THRESHOLDS = {
    EAR_THRESHOLD: 0.22,           // Below this is a blink
    BLINK_MIN_MS: 100,            // Natural blink duration min
    BLINK_MAX_MS: 400,            // Natural blink duration max
    BLINK_FREQ_LOW: 8,            // Min blinks per minute (natural)
    BLINK_FREQ_HIGH: 25,          // Max blinks per minute (natural)
    AV_SYNC_TOLERANCE_MS: 100,    // Max drift before penalty
    RPPG_STABILITY_THRESHOLD: 0.15, // Variance in pulse signal
    WEIGHTS: {
        BLINK: 0.3,
        RPPG: 0.4,
        AV_SYNC: 0.3
    }
};

export interface Landmark {
    x: number;
    y: number;
    z?: number;
}

export interface FrameData {
    landmarks: Landmark[];
    audioData: {
        amplitude: number;
        phoneme?: string; // e.g., 'A', 'O', 'M', 'Closed'
        timestamp: number;
    };
    roiGreenValues: {
        forehead: number;
        cheekL: number;
        cheekR: number;
    };
    timestamp: number;
}

export interface TrustResult {
    score: number;       // 0 - 100
    level: 'High' | 'Medium' | 'Low';
    reasoning: {
        blink_anomaly: boolean;
        rppg_missing: boolean;
        av_drift_detected: boolean;
        confidence_metric: number;
    };
}

// --- Internal State (History) ---
let frameHistory: FrameData[] = [];
const HISTORY_WINDOW_MS = 3000; // 3 seconds window for DSP
let movingAverageScore = 100;

/**
 * Calculates Eye Aspect Ratio (EAR)
 * Formula: (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 */
function calculateEAR(eyeLandmarks: Landmark[]): number {
    const [p1, p2, p3, p4, p5, p6] = eyeLandmarks;
    const vertical1 = Math.hypot(p2.x - p6.x, p2.y - p6.y);
    const vertical2 = Math.hypot(p3.x - p5.x, p3.y - p5.y);
    const horizontal = Math.hypot(p1.x - p4.x, p1.y - p4.y);
    return (vertical1 + vertical2) / (2.0 * horizontal);
}

/**
 * Detects blinks and checks for robotic patterns
 * Monitors both frequency and duration of blinks.
 */
function analyzeBlinks(history: FrameData[]): { score: number; anomaly: boolean } {
    if (history.length < 10) return { score: 100, anomaly: false };

    let blinkCount = 0;
    let blinkDurationFrames = 0;
    let inBlink = false;
    
    // FaceMesh Landmark Indices for EAR
    const L_EYE = [33, 160, 158, 133, 153, 144];
    const R_EYE = [362, 385, 387, 263, 373, 380];

    history.forEach(frame => {
        const earL = calculateEAR(L_EYE.map(idx => frame.landmarks[idx]));
        const earR = calculateEAR(R_EYE.map(idx => frame.landmarks[idx]));
        const avgEAR = (earL + earR) / 2;

        if (avgEAR < THRESHOLDS.EAR_THRESHOLD) {
            if (!inBlink) {
                inBlink = true;
                blinkCount++;
            }
            blinkDurationFrames++;
        } else {
            inBlink = false;
        }
    });

    // Anomaly Detection:
    // 1. Zero blinks in the window
    // 2. "Stuck" blink (eyes closed too long, > 500ms)
    const windowSeconds = (history[history.length - 1].timestamp - history[0].timestamp) / 1000;
    const isStuck = (blinkDurationFrames > (500 / 33)); // Assuming ~30fps
    const noBlinks = (blinkCount === 0 && windowSeconds > 2);
    
    const anomaly = noBlinks || isStuck;
    const score = anomaly ? 30 : 100;
    return { score, anomaly };
}

/**
 * rPPG Logic: Green Channel Flux
 * Physics: Blood (hemoglobin) absorbs green light (approx 540-570nm). 
 * Real skin shows micro-oscillations synced with the heart.
 * Synthetic/Deepfake faces often lack this or use static textures.
 */
function analyzeRPPG(history: FrameData[]): { score: number; missing: boolean } {
    if (history.length < 30) return { score: 100, missing: false }; // Need baseline

    const greenValues = history.map(f => (f.roiGreenValues.forehead + f.roiGreenValues.cheekL + f.roiGreenValues.cheekR) / 3);
    
    // Simple DSP: Detrend and Calculate zero-crossings as a proxy for heart rate
    const mean = greenValues.reduce((a, b) => a + b, 0) / greenValues.length;
    const detrended = greenValues.map(v => v - mean);
    
    let zeroCrossings = 0;
    for (let i = 1; i < detrended.length; i++) {
        if ((detrended[i-1] >= 0 && detrended[i] < 0) || (detrended[i-1] < 0 && detrended[i] >= 0)) {
            zeroCrossings++;
        }
    }

    // Human HR: 60-120 BPM => 1-2 Hz. 
    // In 3 seconds, we expect ~6-12 zero crossings (2 per cycle).
    // Zero or extremely high crossings (noise) are suspicious.
    const isMissing = (zeroCrossings < 2 || zeroCrossings > 15); 
    const score = isMissing ? 20 : 100;
    return { score, missing: isMissing };
}

/**
 * AV-Sync: Lip-Sync Drift
 * Correlates audio phonemes with visual visemes
 */
function analyzeAVSync(history: FrameData[]): { score: number; drift: boolean } {
    const frame = history[history.length - 1];
    if (!frame.audioData.phoneme) return { score: 100, drift: false };

    // Landmark 13 (top lip) and 14 (bottom lip) for aperture
    const p13 = frame.landmarks[13];
    const p14 = frame.landmarks[14];
    const aperture = Math.hypot(p13.x - p14.x, p13.y - p14.y);

    const isTalking = frame.audioData.amplitude > 0.05;
    const mouthOpen = aperture > 0.02;

    // Logic: If loud audio but mouth closed, or vice-versa
    const drift = (isTalking && !mouthOpen && frame.audioData.phoneme !== 'M');
    const score = drift ? 40 : 100;
    return { score, drift };
}

/**
 * Main scoring function
 */
export function calculateTrustScore(input: FrameData): TrustResult {
    // 1. Maintain history window
    const now = input.timestamp;
    frameHistory.push(input);
    frameHistory = frameHistory.filter(f => now - f.timestamp < HISTORY_WINDOW_MS);

    // 2. Compute individual markers
    const blinkRes = analyzeBlinks(frameHistory);
    const rppgRes = analyzeRPPG(frameHistory);
    const avRes = analyzeAVSync(frameHistory);

    // 3. Weighted Calculation
    const instantScore = (
        blinkRes.score * THRESHOLDS.WEIGHTS.BLINK +
        rppgRes.score * THRESHOLDS.WEIGHTS.RPPG +
        avRes.score * THRESHOLDS.WEIGHTS.AV_SYNC
    );

    // 4. Weighted Moving Average to prevent jitter
    const ALPHA = 0.15; // Smoothing factor
    movingAverageScore = (ALPHA * instantScore) + (1 - ALPHA) * movingAverageScore;

    // 5. Determine Level
    let level: 'High' | 'Medium' | 'Low' = 'High';
    if (movingAverageScore < 50) level = 'Low';
    else if (movingAverageScore < 80) level = 'Medium';

    return {
        score: Math.round(movingAverageScore),
        level,
        reasoning: {
            blink_anomaly: blinkRes.anomaly,
            rppg_missing: rppgRes.missing,
            av_drift_detected: avRes.drift,
            confidence_metric: 0.95 // Placeholder for ML confidence
        }
    };
}
