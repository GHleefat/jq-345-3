import { create } from "zustand";
import type { RecordingSession } from "@/utils/strokeRecorder";

export type Tool = "brush" | "water" | "inkDrop";
export type PaperType = "raw" | "cooked" | "bark";
export type PlaybackMode =
  | "idle"
  | "recording"
  | "playing"
  | "paused"
  | "exporting";

interface InkStore {
  tool: Tool;
  inkDensity: number;
  brushSize: number;
  paperType: PaperType;
  showPaperSelector: boolean;
  playbackMode: PlaybackMode;
  currentSession: RecordingSession | null;
  playbackTime: number;
  playbackSpeed: number;
  showPlaybackControls: boolean;
  showExportPanel: boolean;
  strokeCount: number;
  setTool: (tool: Tool) => void;
  setInkDensity: (density: number) => void;
  setBrushSize: (size: number) => void;
  setPaperType: (type: PaperType) => void;
  setShowPaperSelector: (show: boolean) => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  setCurrentSession: (session: RecordingSession | null) => void;
  setPlaybackTime: (time: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setShowPlaybackControls: (show: boolean) => void;
  setShowExportPanel: (show: boolean) => void;
  setStrokeCount: (count: number) => void;
}

export const useInkStore = create<InkStore>((set) => ({
  tool: "brush",
  inkDensity: 0.7,
  brushSize: 20,
  paperType: "raw",
  showPaperSelector: false,
  playbackMode: "idle",
  currentSession: null,
  playbackTime: 0,
  playbackSpeed: 1,
  showPlaybackControls: false,
  showExportPanel: false,
  strokeCount: 0,
  setTool: (tool) => set({ tool }),
  setInkDensity: (inkDensity) => set({ inkDensity }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setPaperType: (paperType) => set({ paperType }),
  setShowPaperSelector: (showPaperSelector) => set({ showPaperSelector }),
  setPlaybackMode: (playbackMode) => set({ playbackMode }),
  setCurrentSession: (currentSession) => set({ currentSession }),
  setPlaybackTime: (playbackTime) => set({ playbackTime }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setShowPlaybackControls: (showPlaybackControls) =>
    set({ showPlaybackControls }),
  setShowExportPanel: (showExportPanel) => set({ showExportPanel }),
  setStrokeCount: (strokeCount) => set({ strokeCount }),
}));
