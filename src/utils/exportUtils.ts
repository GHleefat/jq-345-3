import { InkEngine } from "./inkEngine";
import { PlaybackEngine } from "./playbackEngine";
import { generatePaperTexture, type PaperType } from "./paperTexture";

export interface ExportOptions {
  format: "webm" | "png-sequence";
  fps: number;
  speed: number;
  quality: number;
  scale: number;
  includePaper: boolean;
}

export interface ExportProgress {
  currentFrame: number;
  totalFrames: number;
  progress: number;
}

export class VideoExporter {
  private inkEngine: InkEngine;
  private playbackEngine: PlaybackEngine;
  private paperType: PaperType;
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(
    inkEngine: InkEngine,
    playbackEngine: PlaybackEngine,
    paperType: PaperType,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    this.inkEngine = inkEngine;
    this.playbackEngine = playbackEngine;
    this.paperType = paperType;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  async exportVideo(
    options: Partial<ExportOptions> = {},
    onProgress?: (progress: ExportProgress) => void,
  ): Promise<Blob | null> {
    const defaultOptions: ExportOptions = {
      format: "webm",
      fps: 30,
      speed: 1,
      quality: 0.95,
      scale: 1,
      includePaper: true,
    };

    const opts = { ...defaultOptions, ...options };

    if (opts.format === "webm") {
      return this.exportWebM(opts, onProgress);
    } else {
      return null;
    }
  }

  private async exportWebM(
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void,
  ): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      const state = this.playbackEngine.getState();
      const duration = state.duration / options.speed;
      const totalFrames = Math.ceil(duration * options.fps);

      const exportCanvas = document.createElement("canvas");
      const scaledWidth = Math.floor(this.canvasWidth * options.scale);
      const scaledHeight = Math.floor(this.canvasHeight * options.scale);
      exportCanvas.width = scaledWidth;
      exportCanvas.height = scaledHeight;

      const ctx = exportCanvas.getContext("2d")!;

      const paperCanvas = options.includePaper
        ? generatePaperTexture(scaledWidth, scaledHeight, this.paperType)
        : null;

      const stream = (exportCanvas as any).captureStream(options.fps);
      const mimeTypes = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      let mimeType = "";
      for (const type of mimeTypes) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      if (!mimeType) {
        reject(new Error("WebM recording is not supported in this browser"));
        return;
      }

      const recorderOptions: MediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: Math.floor(5000000 * options.quality),
      };

      const recorder = new MediaRecorder(stream, recorderOptions);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };

      recorder.onerror = (e) => {
        reject(e);
      };

      this.playbackEngine.reset();
      this.playbackEngine.setPlaybackSpeed(options.speed);

      let currentFrame = 0;
      let isRecording = true;

      const originalOnTimeUpdate = (this.playbackEngine as any).callbacks?.onTimeUpdate;

      (this.playbackEngine as any).callbacks.onTimeUpdate = (time: number) => {
        const inkCanvas = (this.inkEngine as any).getCanvas();
        ctx.clearRect(0, 0, scaledWidth, scaledHeight);

        if (paperCanvas) {
          ctx.drawImage(paperCanvas, 0, 0);
        }

        ctx.save();
        ctx.scale(options.scale, options.scale);
        ctx.drawImage(inkCanvas, 0, 0);
        ctx.restore();

        if (options.includePaper) {
          ctx.fillStyle = "rgba(0,0,0,0.02)";
          ctx.font = `${12 * options.scale}px serif`;
          ctx.textAlign = "right";
          ctx.fillText("墨韵", scaledWidth - 10 * options.scale, scaledHeight - 10 * options.scale);
        }

        currentFrame++;
        const progress = Math.min(1, currentFrame / totalFrames);
        onProgress?.({
          currentFrame,
          totalFrames,
          progress,
        });

        originalOnTimeUpdate?.(time);
      };

      const originalOnComplete = (this.playbackEngine as any).callbacks?.onComplete;
      (this.playbackEngine as any).callbacks.onComplete = () => {
        setTimeout(() => {
          if (isRecording) {
            isRecording = false;
            recorder.stop();
            (this.playbackEngine as any).callbacks.onTimeUpdate = originalOnTimeUpdate;
            (this.playbackEngine as any).callbacks.onComplete = originalOnComplete;
          }
        }, 500);

        originalOnComplete?.();
      };

      recorder.start(1000 / options.fps);
      this.playbackEngine.play();
    });
  }

  async exportGIF(
    options: Partial<ExportOptions> = {},
    onProgress?: (progress: ExportProgress) => void,
  ): Promise<Blob | null> {
    return this.exportVideo(
      { ...options, format: "webm", fps: options.fps || 15 },
      onProgress,
    );
  }

  async exportFrames(
    options: Partial<ExportOptions> = {},
    onProgress?: (progress: ExportProgress) => void,
    onFrame?: (dataUrl: string, frameIndex: number) => void,
  ): Promise<void> {
    const defaultOptions: ExportOptions = {
      format: "png-sequence",
      fps: 30,
      speed: 1,
      quality: 1,
      scale: 2,
      includePaper: true,
    };

    const opts = { ...defaultOptions, ...options };

    const state = this.playbackEngine.getState();
    const duration = state.duration / opts.speed;
    const totalFrames = Math.ceil(duration * opts.fps);
    const frameInterval = 1000 / opts.fps;

    const exportCanvas = document.createElement("canvas");
    const scaledWidth = Math.floor(this.canvasWidth * opts.scale);
    const scaledHeight = Math.floor(this.canvasHeight * opts.scale);
    exportCanvas.width = scaledWidth;
    exportCanvas.height = scaledHeight;

    const ctx = exportCanvas.getContext("2d")!;

    const paperCanvas = opts.includePaper
      ? generatePaperTexture(scaledWidth, scaledHeight, this.paperType)
      : null;

    this.playbackEngine.reset();

    for (let i = 0; i < totalFrames; i++) {
      const time = (i * frameInterval) * opts.speed;
      this.playbackEngine.seekTo(time);

      const inkCanvas = (this.inkEngine as any).getCanvas();
      ctx.clearRect(0, 0, scaledWidth, scaledHeight);

      if (paperCanvas) {
        ctx.drawImage(paperCanvas, 0, 0);
      }

      ctx.save();
      ctx.scale(opts.scale, opts.scale);
      ctx.drawImage(inkCanvas, 0, 0);
      ctx.restore();

      const dataUrl = exportCanvas.toDataURL("image/png", opts.quality);
      onFrame?.(dataUrl, i);

      onProgress?.({
        currentFrame: i + 1,
        totalFrames,
        progress: (i + 1) / totalFrames,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    this.playbackEngine.reset();
  }

  downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
}
