import type { Tool } from "@/store/inkStore";

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

export interface BaseStroke {
  id: string;
  startTime: number;
  endTime: number;
  tool: Tool;
  inkDensity: number;
  brushSize: number;
  paperType: string;
}

export interface BrushStroke extends BaseStroke {
  tool: "brush" | "water";
  points: StrokePoint[];
  dwellEvents: DwellEvent[];
}

export interface InkDropStroke extends BaseStroke {
  tool: "inkDrop";
  x: number;
  y: number;
}

export interface WaterDropStroke extends BaseStroke {
  tool: "water";
  x: number;
  y: number;
}

export interface DwellEvent {
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  pressure: number;
}

export type Stroke = BrushStroke | InkDropStroke | WaterDropStroke;

export interface RecordingSession {
  id: string;
  startTime: number;
  endTime: number;
  strokes: Stroke[];
  canvasWidth: number;
  canvasHeight: number;
  paperType: string;
}

export class StrokeRecorder {
  private currentStroke: BrushStroke | null = null;
  private strokes: Stroke[] = [];
  private sessionStartTime: number = 0;
  private sessionEndTime: number = 0;
  private isRecording: boolean = false;
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;
  private paperType: string = "raw";

  startRecording(width: number, height: number, paperType: string) {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.paperType = paperType;
    this.strokes = [];
    this.sessionStartTime = Date.now();
    this.isRecording = true;
  }

  stopRecording(): RecordingSession | null {
    if (!this.isRecording) return null;
    this.isRecording = false;
    this.sessionEndTime = Date.now();
    return this.getSession();
  }

  getSession(): RecordingSession | null {
    if (this.strokes.length === 0) return null;
    return {
      id: `session_${Date.now()}`,
      startTime: this.sessionStartTime,
      endTime: this.sessionEndTime,
      strokes: [...this.strokes],
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      paperType: this.paperType,
    };
  }

  loadSession(session: RecordingSession) {
    this.strokes = session.strokes;
    this.sessionStartTime = session.startTime;
    this.sessionEndTime = session.endTime;
    this.canvasWidth = session.canvasWidth;
    this.canvasHeight = session.canvasHeight;
    this.paperType = session.paperType;
  }

  getStrokes(): Stroke[] {
    return [...this.strokes];
  }

  getDuration(): number {
    if (this.strokes.length === 0) return 0;
    const lastStroke = this.strokes[this.strokes.length - 1];
    return lastStroke.endTime - this.sessionStartTime;
  }

  startBrushStroke(
    x: number,
    y: number,
    pressure: number,
    time: number,
    tool: "brush" | "water",
    inkDensity: number,
    brushSize: number,
  ) {
    if (!this.isRecording) return;
    this.currentStroke = {
      id: `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: time,
      endTime: time,
      tool,
      inkDensity,
      brushSize,
      paperType: this.paperType,
      points: [{ x, y, pressure, time }],
      dwellEvents: [],
    };
  }

  addStrokePoint(
    x: number,
    y: number,
    pressure: number,
    time: number,
  ) {
    if (!this.isRecording || !this.currentStroke) return;
    this.currentStroke.points.push({ x, y, pressure, time });
    this.currentStroke.endTime = time;
  }

  startDwell(
    x: number,
    y: number,
    pressure: number,
    time: number,
  ) {
    if (!this.isRecording || !this.currentStroke) return;
    const dwellEvent: DwellEvent = {
      startTime: time,
      endTime: time,
      x,
      y,
      pressure,
    };
    this.currentStroke.dwellEvents.push(dwellEvent);
  }

  updateDwell(time: number) {
    if (!this.isRecording || !this.currentStroke) return;
    const lastDwell = this.currentStroke.dwellEvents[this.currentStroke.dwellEvents.length - 1];
    if (lastDwell) {
      lastDwell.endTime = time;
    }
  }

  endBrushStroke(time: number) {
    if (!this.isRecording || !this.currentStroke) return;
    this.currentStroke.endTime = time;
    this.strokes.push(this.currentStroke);
    this.currentStroke = null;
  }

  addInkDrop(
    x: number,
    y: number,
    time: number,
    inkDensity: number,
    brushSize: number,
  ) {
    if (!this.isRecording) return;
    const stroke: InkDropStroke = {
      id: `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: time,
      endTime: time,
      tool: "inkDrop",
      inkDensity,
      brushSize,
      paperType: this.paperType,
      x,
      y,
    };
    this.strokes.push(stroke);
  }

  addWaterDrop(
    x: number,
    y: number,
    time: number,
    brushSize: number,
  ) {
    if (!this.isRecording) return;
    const stroke: WaterDropStroke = {
      id: `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: time,
      endTime: time,
      tool: "water",
      inkDensity: 1,
      brushSize,
      paperType: this.paperType,
      x,
      y,
    };
    this.strokes.push(stroke);
  }

  clear() {
    this.strokes = [];
    this.currentStroke = null;
  }

  exportSession(): string {
    const session = this.getSession();
    return session ? JSON.stringify(session, null, 2) : "";
  }

  importSession(json: string): RecordingSession | null {
    try {
      const session = JSON.parse(json) as RecordingSession;
      this.loadSession(session);
      return session;
    } catch {
      return null;
    }
  }
}
