export interface EngineFrame {
  timestamp: number;
  earScore: number;       // Eye Aspect Ratio (0.15 - 0.4)
  mouthAperture: number;  // Distance between lips
  avgGreen: number;       // Average Green Channel intensity for rPPG
}

export interface TrustReport {
  score: number;
  reasons: string[];
}

export class MirrorBreakerLogic {
  // Configuration Thresholds
  private readonly BLINK_THRESHOLD = 0.2;
  private readonly MAX_BLINK_INTERVAL_MS = 15000; // 15 seconds
  private readonly MAX_BLINKS_PER_SECOND = 10;
  private readonly RPPG_BUFFER_SIZE = 90; // 90 frames (~3s at 30fps)
  
  // State Tracking
  private recentBlinks: number[] = []; 
  private lastBlinkTimestamp: number = Date.now();
  
  // Rolling buffer for rPPG
  private greenChannelBuffer: number[] = [];
  
  // Lip Sync Tracking
  private prevMouthAperture: number = 0;
  private mouthMovementBuffer: number[] = [];
  private currentSystemAudioLevel: number = 0; 
  
  /**
   * Updates the current audio level from the Web Audio API.
   * Call this continuously alongside processFrame.
   * @param level Audio volume level (e.g., 0.0 to 1.0)
   */
  public updateAudioLevel(level: number) {
    this.currentSystemAudioLevel = level;
  }

  /**
   * Consumes a single frame of data from the ML engine.
   * @param frame The raw data frame
   */
  public processFrame(frame: EngineFrame) {
    this.processBlinkLogic(frame);
    this.processPulseLogic(frame);
    this.processLipSyncLogic(frame);
  }

  private processBlinkLogic(frame: EngineFrame) {
    // Detect blink when EAR drops below threshold
    if (frame.earScore < this.BLINK_THRESHOLD) {
      // Debounce: Ensure we don't count the same blink multiple times (150ms cooldown)
      if (this.recentBlinks.length === 0 || (frame.timestamp - this.recentBlinks[this.recentBlinks.length - 1] > 150)) {
        this.recentBlinks.push(frame.timestamp);
        this.lastBlinkTimestamp = frame.timestamp;
      }
    }
    
    // Prune blinks older than 1 second to track "blinks per second"
    const oneSecondAgo = frame.timestamp - 1000;
    this.recentBlinks = this.recentBlinks.filter(timestamp => timestamp >= oneSecondAgo);
  }

  private processPulseLogic(frame: EngineFrame) {
    // Add to rolling buffer
    this.greenChannelBuffer.push(frame.avgGreen);
    
    // Maintain maximum buffer size
    if (this.greenChannelBuffer.length > this.RPPG_BUFFER_SIZE) {
      this.greenChannelBuffer.shift(); // Remove the oldest value
    }
  }

  private processLipSyncLogic(frame: EngineFrame) {
    // Calculate rate of change in mouth aperture
    const mouthDelta = Math.abs(frame.mouthAperture - this.prevMouthAperture);
    this.mouthMovementBuffer.push(mouthDelta);
    
    // Keep a small smoothing window (e.g., 10 frames)
    if (this.mouthMovementBuffer.length > 10) {
      this.mouthMovementBuffer.shift();
    }
    this.prevMouthAperture = frame.mouthAperture;
  }

  /**
   * Calculates the current real-time Trust Score based on recent data.
   * @param currentTime Optional override for current time, defaults to Date.now()
   * @returns TrustReport containing the score and reasons for deduction
   */
  public getTrustScore(currentTime: number = Date.now()): TrustReport {
    let score = 0;
    const reasons: string[] = [];

    // 1. Evaluate Blinking (+30 pts)
    const timeSinceLastBlink = currentTime - this.lastBlinkTimestamp;
    if (timeSinceLastBlink > this.MAX_BLINK_INTERVAL_MS) {
      reasons.push(`Suspicious Pattern: No blink detected for >15 seconds`);
    } else if (this.recentBlinks.length > this.MAX_BLINKS_PER_SECOND) {
      reasons.push(`Suspicious Pattern: Irregularly high blink rate (>10/sec)`);
    } else {
      score += 30; // Natural blinking
    }

    // 2. Evaluate rPPG Pulse (+40 pts)
    if (this.greenChannelBuffer.length < this.RPPG_BUFFER_SIZE) {
      // Not enough data yet, award points provisionally to prevent score jumping
      score += 40; 
    } else {
      const isPulseValid = this.analyzePulseSignal();
      if (isPulseValid) {
        score += 40;
      } else {
        reasons.push("Artificial Signal: No natural rhythmic pulse detected (Flatline or noise)");
      }
    }

    // 3. Evaluate Lip Sync (+30 pts)
    const isSyncValid = this.analyzeLipSync();
    if (isSyncValid) {
      score += 30;
    } else {
      reasons.push("Sync Drift: Discrepancy between mouth movement and audio output");
    }

    return {
      score,
      reasons
    };
  }

  /**
   * Uses peak detection on the rolling buffer to verify a 60-100 BPM rhythmic pulse.
   */
  private analyzePulseSignal(): boolean {
    const sum = this.greenChannelBuffer.reduce((a, b) => a + b, 0);
    const mean = sum / this.greenChannelBuffer.length;
    
    // Calculate variance
    const variance = this.greenChannelBuffer.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / this.greenChannelBuffer.length;
    
    // Flat line check
    if (variance < 0.001) { 
      return false; // Signal is too perfect/flat
    }
    
    // Basic Peak Detection (Finding local maxima)
    let peakCount = 0;
    for (let i = 1; i < this.greenChannelBuffer.length - 1; i++) {
      if (this.greenChannelBuffer[i] > this.greenChannelBuffer[i-1] && 
          this.greenChannelBuffer[i] > this.greenChannelBuffer[i+1]) {
        
        // Filter out tiny noise peaks by ensuring it's above the mean + some threshold
        if (this.greenChannelBuffer[i] > mean + Math.sqrt(variance) * 0.5) {
          peakCount++;
        }
      }
    }
    
    // At 30fps, 90 frames = 3 seconds.
    // 60 BPM = 1 beat/sec = 3 beats in 3s.
    // 100 BPM = ~1.6 beats/sec = ~5 beats in 3s.
    // We allow a margin (e.g., 2 to 7 peaks is roughly 40-140 BPM).
    if (peakCount < 2 || peakCount > 7) {
      return false;
    }

    return true;
  }

  /**
   * Checks if audio activity matches mouth movement activity.
   */
  private analyzeLipSync(): boolean {
    if (this.mouthMovementBuffer.length === 0) return true;

    const avgMouthMovement = this.mouthMovementBuffer.reduce((a, b) => a + b, 0) / this.mouthMovementBuffer.length;
    
    // Thresholds require tuning in the real environment
    const isMouthMoving = avgMouthMovement > 0.02; 
    const isAudioPlaying = this.currentSystemAudioLevel > 0.05; 

    if (isMouthMoving && !isAudioPlaying) {
      return false; // Speaking but no sound
    }
    
    // Note: Assuming a 1-on-1 video where if audio plays, the person on screen should be moving their mouth.
    if (!isMouthMoving && isAudioPlaying) {
      return false; // Sound but no speaking
    }

    return true;
  }
}
