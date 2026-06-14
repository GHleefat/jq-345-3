import { InkEngine } from "./inkEngine";
import type { RecordingSession, BrushStroke, InkDropStroke, WaterDropStroke, DwellEvent } from "./strokeRecorder";
import type { PaperType } from "./paperTexture";

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  strokeIndex: number;
  pointIndex: number;
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
  private renderedStrokes: Set<string> = new Set();
  private currentBrushStroke: {
    stroke: BrushStroke;
    lastPointIndex: number;
    lastDwellIndex: number;
    dwellRafId: number | null;
    isDwelling: boolean;
    currentDwell: DwellEvent | null;
  } | null = null;

  constructor(engine: InkEngine, callbacks: PlaybackCallbacks = {}) {
    this.engine = engine;
    this.callbacks = callbacks;
    this.state = {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playbackSpeed: 1,
      strokeIndex: 0,
      pointIndex: 0,
    };
  }

  loadSession(session: RecordingSession) {
    this.session = session;
    this.state.duration = session.endTime - session.startTime;
    this.state.currentTime = 0;
    this.state.strokeIndex = 0;
    this.state.pointIndex = 0;
    this.renderedStrokes.clear();
    this.stopCurrentDwell();
    this.currentBrushStroke = null;
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
    this.stopCurrentDwell();
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

    this.pause();

    const targetTime = Math.max(0, Math.min(this.state.duration, time));
    const targetAbsoluteTime = this.session.startTime + targetTime;

    this.stopCurrentDwell();
    this.currentBrushStroke = null;
    this.renderedStrokes.clear();
    this.engine.clear();

    this.state.strokeIndex = 0;
    this.state.pointIndex = 0;

    for (let i = 0; i < this.session.strokes.length; i++) {
      const stroke = this.session.strokes[i];
      if (stroke.endTime <= targetAbsoluteTime) {
        this.renderStroke(stroke);
        this.renderedStrokes.add(stroke.id);
        this.state.strokeIndex = i + 1;
      } else if (stroke.startTime <= targetAbsoluteTime) {
        this.renderStrokeUpTo(stroke, targetAbsoluteTime);
        this.state.strokeIndex = i;
        break;
      } else {
        break;
      }
    }

    this.state.currentTime = targetTime;
    this.callbacks.onTimeUpdate?.(targetTime);
  }

  reset() {
    this.pause();
    this.seekTo(0);
  }

  private renderStroke(stroke: BrushStroke | InkDropStroke | WaterDropStroke) {
    if (stroke.tool === "brush" || stroke.tool === "water") {
      this.renderBrushStroke(stroke);
    } else if (stroke.tool === "inkDrop") {
      this.engine.addInkDrop(stroke.x, stroke.y, stroke.inkDensity, stroke.brushSize);
    }
  }

  private renderBrushStroke(stroke: BrushStroke) {
    const points = stroke.points;
    if (points.length < 2) return;

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

    this.renderDwellEvents(stroke);
    this.engine.endStroke();
  }

  private renderDwellEvents(stroke: BrushStroke) {
    for (const dwell of stroke.dwellEvents) {
      const dwellDuration = dwell.endTime - dwell.startTime;
      const frames = Math.floor(dwellDuration / 16);

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

  private renderStrokeUpTo(
    stroke: BrushStroke | InkDropStroke | WaterDropStroke,
    targetTime: number,
  ) {
    if (stroke.tool === "brush" || stroke.tool === "water") {
      const points = stroke.points;
      if (points.length === 0) return;

      const startTime = points[0].time;
      const relativeTarget = targetTime - startTime;

      this.engine.startStroke(points[0].x, points[0].y, points[0].pressure, points[0].time);

      let lastPointIdx = 0;

      for (let i = 1; i < points.length; i++) {
        const p = points[i];
        if (p.time > targetTime) {
          const prevP = points[i - 1];
          const t = (targetTime - prevP.time) / (p.time - prevP.time);
          if (t > 0 && t < 1) {
            const px = prevP.x + (p.x - prevP.x) * t;
            const py = prevP.y + (p.y - prevP.y) * t;
            const pPressure = prevP.pressure + (p.pressure - prevP.pressure) * t;

            const dx = px - prevP.x;
            const dy = py - prevP.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const dt = targetTime - prevP.time;
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
          lastPointIdx = i - 1;
          break;
        }

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

        lastPointIdx = i;
      }

      this.state.pointIndex = lastPointIdx;

      for (const dwell of stroke.dwellEvents) {
        if (dwell.endTime <= targetTime) {
          const dwellDuration = dwell.endTime - dwell.startTime;
          const frames = Math.floor(dwellDuration / 16);
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
        } else if (dwell.startTime <= targetTime) {
          const partialDuration = targetTime - dwell.startTime;
          const frames = Math.floor(partialDuration / 16);
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
  }

  private animationLoop() {
    if (!this.state.isPlaying || !this.session) return;

    const now = performance.now();
    const delta = (now - this.lastFrameTime) * this.state.playbackSpeed;
    this.lastFrameTime = now;

    const newTime = this.state.currentTime + delta;

    if (newTime >= this.state.duration) {
      this.state.currentTime = this.state.duration;
      this.renderUpTo(this.state.duration);
      this.callbacks.onTimeUpdate?.(this.state.duration);
      this.pause();
      this.callbacks.onComplete?.();
      return;
    }

    this.state.currentTime = newTime;
    this.renderUpTo(newTime);
    this.callbacks.onTimeUpdate?.(newTime);

    this.rafId = requestAnimationFrame(() => this.animationLoop());
  }

  private renderUpTo(time: number) {
    if (!this.session) return;

    const absoluteTime = this.session.startTime + time;

    while (this.state.strokeIndex < this.session.strokes.length) {
      const stroke = this.session.strokes[this.state.strokeIndex];

      if (this.renderedStrokes.has(stroke.id)) {
        this.state.strokeIndex++;
        continue;
      }

      if (stroke.startTime > absoluteTime) {
        break;
      }

      if (stroke.tool === "inkDrop") {
        if (stroke.startTime <= absoluteTime) {
          this.engine.addInkDrop(stroke.x, stroke.y, stroke.inkDensity, stroke.brushSize);
          this.renderedStrokes.add(stroke.id);
          this.state.strokeIndex++;
          this.callbacks.onStrokeStart?.(this.state.strokeIndex - 1);
        }
        continue;
      }

      if (stroke.tool === "brush" || stroke.tool === "water") {
        if (!this.currentBrushStroke || this.currentBrushStroke.stroke.id !== stroke.id) {
          const points = stroke.points;
          if (points.length > 0) {
            this.engine.startStroke(points[0].x, points[0].y, points[0].pressure, points[0].time);
            this.currentBrushStroke = {
              stroke,
              lastPointIndex: 0,
              lastDwellIndex: -1,
              dwellRafId: null,
              isDwelling: false,
              currentDwell: null,
            };
            this.state.pointIndex = 0;
            this.callbacks.onStrokeStart?.(this.state.strokeIndex);
          }
        }

        if (this.currentBrushStroke) {
          const rendered = this.renderBrushStrokeUpTo(this.currentBrushStroke, absoluteTime);
          if (rendered.completed) {
            this.renderedStrokes.add(stroke.id);
            this.stopCurrentDwell();
            this.currentBrushStroke = null;
            this.state.strokeIndex++;
          } else if (rendered.isDwelling) {
            break;
          } else {
            break;
          }
        }
      }
    }
  }

  private renderBrushStrokeUpTo(
    brushState: NonNullable<PlaybackEngine["currentBrushStroke"]>,
    targetTime: number,
  ): { completed: boolean; isDwelling: boolean } {
    const stroke = brushState.stroke;
    const points = stroke.points;

    let currentIdx = brushState.lastPointIndex + 1;
    while (currentIdx < points.length && points[currentIdx].time <= targetTime) {
      const p = points[currentIdx];
      const prevP = points[currentIdx - 1];

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

      brushState.lastPointIndex = currentIdx;
      this.state.pointIndex = currentIdx;
      currentIdx++;
    }

    if (currentIdx < points.length) {
      const nextP = points[currentIdx];
      if (nextP.time > targetTime) {
        const prevP = points[currentIdx - 1];
        const t = (targetTime - prevP.time) / (nextP.time - prevP.time);
        if (t > 0 && t < 1) {
          const px = prevP.x + (nextP.x - prevP.x) * t;
          const py = prevP.y + (nextP.y - prevP.y) * t;
          const pPressure = prevP.pressure + (nextP.pressure - prevP.pressure) * t;

          const dx = px - prevP.x;
          const dy = py - prevP.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const dt = targetTime - prevP.time;
          const speed = dt > 0 ? dist / dt : 0;

          if (stroke.tool === "brush") {
            (this.engine as any).drawBrushStamp(px, py, pPressure, speed, stroke.inkDensity, stroke.brushSize);
          } else {
            (this.engine as any).drawWaterStamp(px, py, stroke.brushSize);
          }
        }
      }
    }

    for (let i = brushState.lastDwellIndex + 1; i < stroke.dwellEvents.length; i++) {
      const dwell = stroke.dwellEvents[i];
      if (dwell.startTime > targetTime) break;

      if (dwell.endTime <= targetTime) {
        const dwellDuration = dwell.endTime - dwell.startTime;
        const frames = Math.floor(dwellDuration / 16);
        for (let f = 0; f < frames; f++) {
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
        brushState.lastDwellIndex = i;
      } else {
        if (!brushState.isDwelling || brushState.currentDwell !== dwell) {
          brushState.isDwelling = true;
          brushState.currentDwell = dwell;
          brushState.dwellRafId = requestAnimationFrame(() =>
            this.dwellLoop(brushState, dwell, stroke, targetTime),
          );
        }
        return { completed: false, isDwelling: true };
      }
    }

    if (brushState.lastPointIndex >= points.length - 1) {
      this.engine.endStroke();
      return { completed: true, isDwelling: false };
    }

    return { completed: false, isDwelling: false };
  }

  private dwellLoop(
    brushState: NonNullable<PlaybackEngine["currentBrushStroke"]>,
    dwell: DwellEvent,
    stroke: BrushStroke,
    targetTime: number,
  ) {
    if (!brushState.isDwelling || brushState.currentDwell !== dwell) return;

    const now = performance.now();
    const absoluteStartTime = this.session ? this.session.startTime + this.state.currentTime : targetTime;

    if (dwell.endTime <= absoluteStartTime) {
      brushState.isDwelling = false;
      brushState.currentDwell = null;
      brushState.lastDwellIndex++;
      brushState.dwellRafId = null;
      return;
    }

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

    brushState.dwellRafId = requestAnimationFrame(() =>
      this.dwellLoop(brushState, dwell, stroke, targetTime),
    );
  }

  private stopCurrentDwell() {
    if (this.currentBrushStroke?.dwellRafId !== null) {
      cancelAnimationFrame(this.currentBrushStroke.dwellRafId);
    }
    this.currentBrushStroke = null;
  }

  destroy() {
    this.pause();
    this.stopCurrentDwell();
  }

  getCanvas(): HTMLCanvasElement {
    return (this.engine as any).getCanvas();
  }

  getPaperType(): PaperType | null {
    return this.session ? (this.session.paperType as PaperType) : null;
  }
}
