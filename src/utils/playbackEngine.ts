import { InkEngine } from "./inkEngine";
import type { RecordingSession, BrushStroke, InkDropStroke, WaterDropStroke } from "./strokeRecorder";
import type { PaperType } from "./paperTexture";

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  strokeIndex: number;
}

interface PlaybackCallbacks {
  onTimeUpdate?: (time: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onComplete?: () => void;
  onStrokeStart?: (index: number) => void;
}

export class PlaybackEngine {
  private engine: InkEngine;
  private session: RecordingSession | null = null;
  private state: PlaybackState;
  private callbacks: PlaybackCallbacks;
  private rafId: number | null = null;
  private lastFrameTime: number = 0;

  constructor(engine: InkEngine, callbacks: PlaybackCallbacks = {}) {
    this.engine = engine;
    this.callbacks = callbacks;
    this.engine.setHistoryEnabled(false);
    this.state = {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playbackSpeed: 1,
      strokeIndex: 0,
    };
  }

  loadSession(session: RecordingSession) {
    this.session = session;
    this.state.duration = session.endTime - session.startTime;
    this.state.currentTime = 0;
    this.state.strokeIndex = 0;
    this.engine.clear();
    this.callbacks.onTimeUpdate?.(0);
  }

  getState(): Readonly<PlaybackState> {
    return { ...this.state };
  }

  setPlaybackSpeed(speed: number) {
    this.state.playbackSpeed = Math.max(0.1, Math.min(10, speed));
  }

  play() {
    if (this.state.isPlaying || !this.session) return;
    if (this.state.currentTime >= this.state.duration) {
      this.seekTo(0);
    }
    this.state.isPlaying = true;
    this.lastFrameTime = performance.now();
    this.callbacks.onPlayStateChange?.(true);
    this.animationLoop();
  }

  pause() {
    if (!this.state.isPlaying) return;
    this.state.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.callbacks.onPlayStateChange?.(false);
  }

  togglePlay() {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seekTo(time: number) {
    if (!this.session) return;

    const wasPlaying = this.state.isPlaying;
    if (wasPlaying) {
      this.pause();
    }

    const targetTime = Math.max(0, Math.min(this.state.duration, time));
    this.renderToTime(targetTime);
    this.state.currentTime = targetTime;
    this.callbacks.onTimeUpdate?.(targetTime);

    if (wasPlaying) {
      this.play();
    }
  }

  reset() {
    this.pause();
    this.seekTo(0);
  }

  private renderToTime(targetTime: number) {
    if (!this.session) return;

    this.engine.clear();
    const targetAbsoluteTime = this.session.startTime + targetTime;
    let strokeIdx = 0;

    for (let i = 0; i < this.session.strokes.length; i++) {
      const stroke = this.session.strokes[i];

      if (stroke.endTime <= targetAbsoluteTime) {
        this.renderFullStroke(stroke);
        strokeIdx = i + 1;
      } else if (stroke.startTime <= targetAbsoluteTime) {
        this.renderPartialStroke(stroke, targetAbsoluteTime);
        strokeIdx = i;
        break;
      } else {
        break;
      }
    }

    this.state.strokeIndex = strokeIdx;
  }

  private renderFullStroke(stroke: BrushStroke | InkDropStroke | WaterDropStroke) {
    if (stroke.tool === "brush" || stroke.tool === "water") {
      this.renderFullBrushStroke(stroke as BrushStroke);
    } else if (stroke.tool === "inkDrop") {
      this.engine.addInkDrop(stroke.x, stroke.y, stroke.inkDensity, stroke.brushSize);
    }
  }

  private renderFullBrushStroke(stroke: BrushStroke) {
    const points = stroke.points;
    if (points.length < 2) {
      if (points.length === 1) {
        const p = points[0];
        if (stroke.tool === "brush") {
          (this.engine as any).drawBrushStamp(p.x, p.y, p.pressure, 0, stroke.inkDensity, stroke.brushSize);
        }
      }
      return;
    }

    this.engine.startStroke(points[0].x, points[0].y, points[0].pressure, points[0].time);

    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const prevP = points[i - 1];

      const dx = p.x - prevP.x;
      const dy = p.y - prevP.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = p.time - prevP.time;
      const speed = dt > 0 ? dist / dt : 0;

      const steps = Math.max(1, Math.floor(dist / 2));

      for (let j = 0; j < steps; j++) {
        const t = j / steps;
        const px = prevP.x + dx * t;
        const py = prevP.y + dy * t;
        const pPressure = prevP.pressure + (p.pressure - prevP.pressure) * t;

        if (stroke.tool === "brush") {
          (this.engine as any).drawBrushStamp(px, py, pPressure, speed, stroke.inkDensity, stroke.brushSize);
        } else {
          (this.engine as any).drawWaterStamp(px, py, stroke.brushSize);
        }
      }
    }

    for (const dwell of stroke.dwellEvents) {
      const dwellDuration = dwell.endTime - dwell.startTime;
      const frames = Math.max(1, Math.floor(dwellDuration / 30));

      for (let i = 0; i < frames; i++) {
        if (stroke.tool === "brush") {
          (this.engine as any).drawBrushStamp(
            dwell.x,
            dwell.y,
            dwell.pressure,
            0,
            stroke.inkDensity,
            stroke.brushSize,
          );
        }
      }
    }

    this.engine.endStroke();
  }

  private renderPartialStroke(
    stroke: BrushStroke | InkDropStroke | WaterDropStroke,
    targetAbsoluteTime: number,
  ) {
    if (stroke.tool === "brush" || stroke.tool === "water") {
      this.renderPartialBrushStroke(stroke as BrushStroke, targetAbsoluteTime);
    } else if (stroke.tool === "inkDrop") {
      this.engine.addInkDrop(stroke.x, stroke.y, stroke.inkDensity, stroke.brushSize);
    }
  }

  private renderPartialBrushStroke(stroke: BrushStroke, targetAbsoluteTime: number) {
    const points = stroke.points;
    if (points.length === 0) return;

    if (points.length === 1 || targetAbsoluteTime <= points[0].time) {
      const p = points[0];
      if (stroke.tool === "brush") {
        (this.engine as any).drawBrushStamp(p.x, p.y, p.pressure, 0, stroke.inkDensity, stroke.brushSize);
      }
      return;
    }

    this.engine.startStroke(points[0].x, points[0].y, points[0].pressure, points[0].time);

    let lastIdx = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].time > targetAbsoluteTime) {
        const prevP = points[i - 1];
        const nextP = points[i];
        const t = (targetAbsoluteTime - prevP.time) / (nextP.time - prevP.time);

        if (t > 0 && t < 1) {
          const px = prevP.x + (nextP.x - prevP.x) * t;
          const py = prevP.y + (nextP.y - prevP.y) * t;
          const pPressure = prevP.pressure + (nextP.pressure - prevP.pressure) * t;

          const dx = px - prevP.x;
          const dy = py - prevP.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const dt = targetAbsoluteTime - prevP.time;
          const speed = dt > 0 ? dist / dt : 0;

          const steps = Math.max(1, Math.floor(dist / 2));
          for (let j = 0; j < steps; j++) {
            const tt = j / steps;
            const ppx = prevP.x + dx * tt;
            const ppy = prevP.y + dy * tt;
            const ppPressure = prevP.pressure + (pPressure - prevP.pressure) * tt;

            if (stroke.tool === "brush") {
              (this.engine as any).drawBrushStamp(ppx, ppy, ppPressure, speed, stroke.inkDensity, stroke.brushSize);
            } else {
              (this.engine as any).drawWaterStamp(ppx, ppy, stroke.brushSize);
            }
          }
        }
        lastIdx = i - 1;
        break;
      }

      const prevP = points[i - 1];
      const p = points[i];
      const dx = p.x - prevP.x;
      const dy = p.y - prevP.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = p.time - prevP.time;
      const speed = dt > 0 ? dist / dt : 0;

      const steps = Math.max(1, Math.floor(dist / 2));
      for (let j = 0; j < steps; j++) {
        const t = j / steps;
        const px = prevP.x + dx * t;
        const py = prevP.y + dy * t;
        const pPressure = prevP.pressure + (p.pressure - prevP.pressure) * t;

        if (stroke.tool === "brush") {
          (this.engine as any).drawBrushStamp(px, py, pPressure, speed, stroke.inkDensity, stroke.brushSize);
        } else {
          (this.engine as any).drawWaterStamp(px, py, stroke.brushSize);
        }
      }

      lastIdx = i;
    }

    if (lastIdx >= points.length - 1) {
      for (const dwell of stroke.dwellEvents) {
        if (dwell.startTime > targetAbsoluteTime) break;

        if (dwell.endTime <= targetAbsoluteTime) {
          const dwellDuration = dwell.endTime - dwell.startTime;
          const frames = Math.max(1, Math.floor(dwellDuration / 30));
          for (let i = 0; i < frames; i++) {
            if (stroke.tool === "brush") {
              (this.engine as any).drawBrushStamp(
                dwell.x,
                dwell.y,
                dwell.pressure,
                0,
                stroke.inkDensity,
                stroke.brushSize,
              );
            }
          }
        } else {
          const partialDuration = targetAbsoluteTime - dwell.startTime;
          const frames = Math.max(1, Math.floor(partialDuration / 30));
          for (let i = 0; i < frames; i++) {
            if (stroke.tool === "brush") {
              (this.engine as any).drawBrushStamp(
                dwell.x,
                dwell.y,
                dwell.pressure,
                0,
                stroke.inkDensity,
                stroke.brushSize,
              );
            }
          }
        }
      }
    }

    this.engine.endStroke();
  }

  private animationLoop() {
    if (!this.state.isPlaying || !this.session) return;

    const now = performance.now();
    const delta = (now - this.lastFrameTime) * this.state.playbackSpeed;
    this.lastFrameTime = now;

    const newTime = this.state.currentTime + delta;

    if (newTime >= this.state.duration) {
      this.state.currentTime = this.state.duration;
      this.renderToTime(this.state.duration);
      this.callbacks.onTimeUpdate?.(this.state.duration);
      this.pause();
      this.callbacks.onComplete?.();
      return;
    }

    const prevStrokeIdx = this.state.strokeIndex;
    this.state.currentTime = newTime;
    this.renderToTime(newTime);
    this.callbacks.onTimeUpdate?.(newTime);

    if (this.state.strokeIndex > prevStrokeIdx) {
      this.callbacks.onStrokeStart?.(this.state.strokeIndex);
    }

    this.rafId = requestAnimationFrame(() => this.animationLoop());
  }

  destroy() {
    this.pause();
    this.engine.setHistoryEnabled(true);
  }

  getCanvas(): HTMLCanvasElement {
    return (this.engine as any).getCanvas();
  }

  getPaperType(): PaperType | null {
    return this.session ? (this.session.paperType as PaperType) : null;
  }
}
