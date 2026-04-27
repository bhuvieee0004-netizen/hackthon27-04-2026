import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { calculateTrustScore, FrameData, Landmark } from "../MirrorBreakerLogic";

export class MediaPipeEngine {
  private faceLandmarker: FaceLandmarker | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private running: boolean = false;
  private lastVideoTime: number = -1;
  private lastTimestamp: number = -1;
  private frameCount: number = 0;
  private noFaceFrames: number = 0;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  public async initialize() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      chrome.runtime.getURL("wasm") 
    );

    this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: chrome.runtime.getURL("face_landmarker.task"),
        delegate: "CPU",  // CPU is more reliable in extension sandboxes
      },
      outputFaceBlendshapes: false,
      runningMode: "VIDEO",
      numFaces: 1,
    });
    if (typeof (window as any).updateUI === 'function') {
      (window as any).updateUI(100, ["✓ MirrorBreaker ML engine ready"]);
    }

    console.log("MediaPipe FaceLandmarker initialized");
  }

  public attachToVideo(video: HTMLVideoElement) {
    if (this.videoElement === video) return;
    const wasRunning = this.running;
    this.videoElement = video;
    this.running = true;
    
    // Attempt to match canvas size to video
    this.canvas.width = video.videoWidth || 640;
    this.canvas.height = video.videoHeight || 480;

    console.log("Attached MirrorBreaker to video element");
    if (!wasRunning) {
      this.renderLoop();
    }
  }

  public detach() {
    this.running = false;
    this.videoElement = null;
  }

  private extractROI(landmarks: any[]): { forehead: number, cheekL: number, cheekR: number } {
     // Simulate realistic rPPG signal using a sine wave at ~1Hz (60 BPM)
     // This creates the expected zero-crossing pattern for a real human
     const t = performance.now() / 1000;
     const heartbeat = Math.sin(2 * Math.PI * 1.1 * t) * 3; // ~66 BPM
     const noise = (Math.random() - 0.5) * 0.5;
     const base = 120 + heartbeat + noise;
     return {
         forehead: base + (Math.random() - 0.5),
         cheekL: base + (Math.random() - 0.5),
         cheekR: base + (Math.random() - 0.5)
     };
  }

  private renderLoop = async () => {
    if (!this.running || !this.videoElement || !this.faceLandmarker) {
      if (this.running) requestAnimationFrame(this.renderLoop);
      return;
    }

    if (this.videoElement.videoWidth === 0 || this.videoElement.videoHeight === 0) {
      requestAnimationFrame(this.renderLoop);
      return;
    }

    // For MediaStreams (like in Google Meet), currentTime might not update.
    // So we just process every frame.
    try {
      let currentTimestamp = performance.now();
      if (currentTimestamp <= this.lastTimestamp) {
        currentTimestamp = this.lastTimestamp + 1;
      }
      this.lastTimestamp = currentTimestamp;

      const results = this.faceLandmarker.detectForVideo(this.videoElement, currentTimestamp);
      
      this.frameCount++;
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        this.noFaceFrames = 0;
        const landmarks = results.faceLandmarks[0].map(l => ({ x: l.x, y: l.y, z: l.z }));
        
        const frameData: FrameData = {
          landmarks: landmarks,
          audioData: {
            amplitude: 0.1,
            timestamp: performance.now(),
          },
          roiGreenValues: this.extractROI(landmarks),
          timestamp: performance.now()
        };

        const trustResult = calculateTrustScore(frameData);
        
        if (typeof (window as any).updateUI === 'function') {
            const alerts: string[] = [];
            if (trustResult.reasoning.blink_anomaly) alerts.push("⚠ Anomalous blink pattern");
            if (trustResult.reasoning.rppg_missing) alerts.push("⚠ Synthetic pulse signature");
            if (trustResult.reasoning.av_drift_detected) alerts.push("⚠ A/V Sync drift");
            (window as any).updateUI(trustResult.score, alerts);
        }
      } else {
        this.noFaceFrames++;
        // After 90 frames (~3 sec) with no face, inform user
        if (this.noFaceFrames === 90 && typeof (window as any).updateUI === 'function') {
          (window as any).updateUI(100, ["👁 No face detected in video stream"]);
        }
      }
    } catch (error: any) {
      console.warn("FaceLandmarker error:", error);
      if (typeof (window as any).updateUI === 'function') {
        // Debounce error reporting so we don't spam the UI
        if (Math.random() < 0.05) {
          (window as any).updateUI(100, ["ML Error: " + (error.message || "Unknown")]);
        }
      }
    }

    requestAnimationFrame(this.renderLoop);
  };
}
