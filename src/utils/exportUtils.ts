import { InkEngine } from "./inkEngine";
import { PlaybackEngine } from "./playbackEngine";
import { generatePaperTexture, type PaperType } from "./paperTexture";
import { GIFEncoder } from "./gifEncoder";

export interface ExportOptions {
  format: "webm" | "gif" | "png-sequence";
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

  private getTotalFrames(fps: number, speed: number): number {
    const state = this.playbackEngine.getState();
    const originalDuration = state.duration;
    const playbackDuration = originalDuration / speed;
    return Math.max(1, Math.ceil((playbackDuration / 1000) * fps));
  }

  private renderFrame(
    time: number,
    ctx: CanvasRenderingContext2D,
    scaledWidth: number,
    scaledHeight: number,
    scale: number,
    paperCanvas: HTMLCanvasElement | null,
    includePaper: boolean,
  ) {
    this.playbackEngine.seekTo(time);

    const inkCanvas = (this.inkEngine as any).getCanvas();
    ctx.clearRect(0, 0, scaledWidth, scaledHeight);

    if (paperCanvas && includePaper) {
      ctx.drawImage(paperCanvas, 0, 0);
    }

    ctx.save();
    ctx.scale(scale, scale);
    ctx.drawImage(inkCanvas, 0, 0);
    ctx.restore();

    if (includePaper) {
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.font = `${12 * scale}px serif`;
      ctx.textAlign = "right";
      ctx.fillText(
        "墨韵",
        scaledWidth - 10 * scale,
        scaledHeight - 10 * scale,
      );
    }
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
    return this.exportWebM(opts, onProgress);
  }

  private async exportWebM(
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void,
  ): Promise<Blob | null> {
    const totalFrames = this.getTotalFrames(options.fps, options.speed);
    const frameInterval = 1000 / options.fps;

    const scaledWidth = Math.floor(this.canvasWidth * options.scale);
    const scaledHeight = Math.floor(this.canvasHeight * options.scale);

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = scaledWidth;
    exportCanvas.height = scaledHeight;
    const ctx = exportCanvas.getContext("2d")!;

    const paperCanvas = options.includePaper
      ? generatePaperTexture(scaledWidth, scaledHeight, this.paperType)
      : null;

    const mimeTypes = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    let mimeType = "";
    for (const type of mimeTypes) {
      if (
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(type)
      ) {
        mimeType = type;
        break;
      }
    }

    if (!mimeType) {
      return this.exportGIF(options, onProgress);
    }

    return new Promise((resolve, reject) => {
      const stream = (exportCanvas as any).captureStream(options.fps);
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
        this.playbackEngine.reset();
        resolve(blob);
      };

      recorder.onerror = (e) => {
        this.playbackEngine.reset();
        reject(e);
      };

      this.playbackEngine.reset();

      let currentFrame = 0;
      let isRecording = false;

      const renderNextFrame = () => {
        if (currentFrame >= totalFrames) {
          if (isRecording) {
            isRecording = false;
            setTimeout(() => {
              if (recorder.state === "recording") {
                recorder.stop();
              }
            }, 500);
          }
          return;
        }

        const time = currentFrame * frameInterval * options.speed;
        this.renderFrame(
          time,
          ctx,
          scaledWidth,
          scaledHeight,
          options.scale,
          paperCanvas,
          options.includePaper,
        );

        currentFrame++;
        onProgress?.({
          currentFrame,
          totalFrames,
          progress: currentFrame / totalFrames,
        });

        requestAnimationFrame(renderNextFrame);
      };

      recorder.start(100);
      isRecording = true;

      requestAnimationFrame(renderNextFrame);
    });
  }

  async exportGIF(
    options: Partial<ExportOptions> = {},
    onProgress?: (progress: ExportProgress) => void,
  ): Promise<Blob | null> {
    const defaultOptions: ExportOptions = {
      format: "gif",
      fps: 15,
      speed: 1,
      quality: 0.8,
      scale: 1,
      includePaper: true,
    };

    const opts = { ...defaultOptions, ...options };

    try {
      const totalFrames = this.getTotalFrames(opts.fps, opts.speed);
      const frameInterval = 1000 / opts.fps;
      const delayPerFrame = Math.max(2, Math.round(100 / opts.fps));

      const scaledWidth = Math.floor(this.canvasWidth * opts.scale);
      const scaledHeight = Math.floor(this.canvasHeight * opts.scale);

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = scaledWidth;
      exportCanvas.height = scaledHeight;
      const ctx = exportCanvas.getContext("2d")!;

      const paperCanvas = opts.includePaper
        ? generatePaperTexture(scaledWidth, scaledHeight, this.paperType)
        : null;

      this.playbackEngine.reset();

      const gifEncoder = new GIFEncoder(scaledWidth, scaledHeight);
      gifEncoder.setRepeat(0);

      for (let i = 0; i < totalFrames; i++) {
        const time = i * frameInterval * opts.speed;
        this.renderFrame(
          time,
          ctx,
          scaledWidth,
          scaledHeight,
          opts.scale,
          paperCanvas,
          opts.includePaper,
        );

        const imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
        gifEncoder.addFrame(imageData, delayPerFrame);

        onProgress?.({
          currentFrame: i + 1,
          totalFrames,
          progress: (i + 1) / totalFrames,
        });

        if (i % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      this.playbackEngine.reset();

      const blob = gifEncoder.encode();
      return blob;
    } catch (e) {
      console.error("GIF export failed:", e);
      this.playbackEngine.reset();
      return null;
    }
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

    const totalFrames = this.getTotalFrames(opts.fps, opts.speed);
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
      const time = i * frameInterval * opts.speed;
      this.renderFrame(
        time,
        ctx,
        scaledWidth,
        scaledHeight,
        opts.scale,
        paperCanvas,
        opts.includePaper,
      );

      const dataUrl = exportCanvas.toDataURL("image/png", opts.quality);
      onFrame?.(dataUrl, i);

      onProgress?.({
        currentFrame: i + 1,
        totalFrames,
        progress: (i + 1) / totalFrames,
      });

      if (i % 5 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
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
