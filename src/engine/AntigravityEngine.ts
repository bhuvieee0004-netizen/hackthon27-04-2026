  FaceLandmarkerResult,
  NormalizedLandmark
} from "@mediapipe/tasks-vision";

export interface EngineFrame {
  timestamp: number;
  earScore: number;
  mouthAperture: number;
  avgGreen: number;
  processingMs: number;
}

export type DetectionCallback = (frame: EngineFrame) => void;

class AntigravityEngine {
  private faceLandmarker: FaceLandmarker | null = null;
  private isRunning: boolean = false;
  private lastVideoTime: number = -1;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationFrameId: number | null = null;

  constructor() {
    // Hidden canvas for rPPG sampling
    this.canvas = document.createElement("canvas");
    this.canvas.width = 20;
    this.canvas.height = 20;
    const context = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Failed to create 2D context");
    this.ctx = context;
  }

  /**
   * Initializes the FaceLandmarker task
   */
  async initialize(): Promise<void> {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1
    });
  }

  /**
   * Starts the detection loop
   */
  start(video: HTMLVideoElement, callback: DetectionCallback): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastVideoTime = -1;

    const loop = () => {
      if (!this.isRunning) return;

      if (video.currentTime !== this.lastVideoTime) {
        const startTime = performance.now();
        this.lastVideoTime = video.currentTime;

        const results = this.faceLandmarker?.detectForVideo(video, startTime);
        
        if (results && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];
          const frameData = this.extractFeatures(video, landmarks, startTime);
          frameData.processingMs = performance.now() - startTime;
          callback(frameData);
        }
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stops the detection loop
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Releases all resources
   */
  async destroy(): Promise<void> {
    this.stop();
    if (this.faceLandmarker) {
      await this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
  }

  /**
   * Feature Extraction Logic
   */
  private extractFeatures(
    video: HTMLVideoElement,
    landmarks: NormalizedLandmark[],
    timestamp: number
  ): EngineFrame {
    // 1. EAR Calculation
    const leftEAR = this.calculateEAR(landmarks, [33, 160, 158, 133, 153, 144]);
    const rightEAR = this.calculateEAR(landmarks, [362, 385, 387, 263, 373, 380]);
    const earScore = (leftEAR + rightEAR) / 2;

    // 2. Mouth Aperture
    const mouthAperture = this.euclideanDistance(landmarks[13], landmarks[14]);

    // 3. rPPG Signal (Forehead)
    const avgGreen = this.sampleGreenChannel(video, landmarks[10]);

    return {
      timestamp,
      earScore,
      mouthAperture,
      avgGreen,
      processingMs: 0 // Will be set by caller
    };
  }

  private calculateEAR(landmarks: NormalizedLandmark[], indices: number[]): number {
    // EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    const p1 = landmarks[indices[0]];
    const p2 = landmarks[indices[1]];
    const p3 = landmarks[indices[2]];
    const p4 = landmarks[indices[3]];
    const p5 = landmarks[indices[4]];
    const p6 = landmarks[indices[5]];

    if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;

    const vert1 = this.euclideanDistance(p2, p6);
    const vert2 = this.euclideanDistance(p3, p5);
    const horiz = this.euclideanDistance(p1, p4);

    if (horiz === 0) return 0;
    return (vert1 + vert2) / (2.0 * horiz);
  }

  private sampleGreenChannel(video: HTMLVideoElement, foreheadLandmark: NormalizedLandmark): number {
    if (video.videoWidth === 0 || video.videoHeight === 0) return 0;

    // Convert normalized landmarks to pixel coordinates
    const x = foreheadLandmark.x * video.videoWidth;
    const y = foreheadLandmark.y * video.videoHeight;

    // Sample 20x20 patch around forehead
    const patchSize = 20;
    
    // Clamp coordinates to video bounds
    const sx = Math.max(0, Math.min(x - patchSize / 2, video.videoWidth - patchSize));
    const sy = Math.max(0, Math.min(y - patchSize / 2, video.videoHeight - patchSize));

    this.ctx.drawImage(
      video,
      sx,
      sy,
      patchSize,
      patchSize,
      0,
      0,
      patchSize,
      patchSize
    );

    const imageData = this.ctx.getImageData(0, 0, patchSize, patchSize).data;
    let greenSum = 0;

    // We only care about the green channel (index 1, 5, 9, ...)
    for (let i = 1; i < imageData.length; i += 4) {
      greenSum += imageData[i];
    }

    return greenSum / (patchSize * patchSize);
  }

  private euclideanDistance(p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }): number {
    return Math.sqrt(
      Math.pow(p1.x - p2.x, 2) + 
      Math.pow(p1.y - p2.y, 2) + 
      Math.pow(p1.z - p2.z, 2)
    );
  }
}

export const engine = new AntigravityEngine();
export default AntigravityEngine;
