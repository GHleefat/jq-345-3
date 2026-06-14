import {
  Undo2,
  Trash2,
  Download,
  Layers,
  Play,
  Square,
  Circle,
} from "lucide-react";
import { useInkStore } from "@/store/inkStore";
import { useRef, useCallback } from "react";

interface ActionBarProps {
  onUndo: () => void;
  onClear: () => void;
  onExport: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onEnterPlayback: () => void;
  onExitPlayback: () => void;
}

export default function ActionBar({
  onUndo,
  onClear,
  onExport,
  onStartRecording,
  onStopRecording,
  onEnterPlayback,
  onExitPlayback,
}: ActionBarProps) {
  const {
    showPaperSelector,
    setShowPaperSelector,
    playbackMode,
    currentSession,
    strokeCount,
  } = useInkStore();
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const recordBtnRef = useRef<HTMLButtonElement>(null);

  const handleExport = useCallback(() => {
    onExport();
    const btn = exportBtnRef.current;
    if (btn) {
      btn.classList.add("stamp-animate");
      setTimeout(() => btn.classList.remove("stamp-animate"), 500);
    }
  }, [onExport]);

  const handleRecordClick = useCallback(() => {
    if (playbackMode === "recording") {
      onStopRecording();
    } else if (playbackMode === "idle") {
      onStartRecording();
      const btn = recordBtnRef.current;
      if (btn) {
        btn.classList.add("pulse-recording");
      }
    }
  }, [playbackMode, onStartRecording, onStopRecording]);

  const handlePlaybackClick = useCallback(() => {
    if (playbackMode === "playing" || playbackMode === "paused") {
      onExitPlayback();
    } else if (currentSession && strokeCount > 0) {
      onEnterPlayback();
    }
  }, [
    playbackMode,
    currentSession,
    strokeCount,
    onEnterPlayback,
    onExitPlayback,
  ]);

  const canPlayback = currentSession && strokeCount > 0;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onUndo}
        className="w-9 h-9 flex items-center justify-center rounded-lg text-[#5a5040]/60 hover:text-[#3a3020] hover:bg-[#3a3020]/8 transition-all"
        title="撤销"
        disabled={playbackMode === "playing" || playbackMode === "recording"}
      >
        <Undo2 size={18} />
      </button>
      <button
        onClick={onClear}
        className="w-9 h-9 flex items-center justify-center rounded-lg text-[#5a5040]/60 hover:text-[#3a3020] hover:bg-[#3a3020]/8 transition-all"
        title="清空"
        disabled={playbackMode === "playing" || playbackMode === "recording"}
      >
        <Trash2 size={18} />
      </button>
      <button
        onClick={() => setShowPaperSelector(!showPaperSelector)}
        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${
          showPaperSelector
            ? "text-[#c23b22] bg-[#c23b22]/10"
            : "text-[#5a5040]/60 hover:text-[#3a3020] hover:bg-[#3a3020]/8"
        }`}
        title="宣纸纹理"
        disabled={playbackMode === "playing" || playbackMode === "recording"}
      >
        <Layers size={18} />
      </button>

      <div className="w-px h-5 bg-[#3a3020]/10 mx-1" />

      <button
        ref={recordBtnRef}
        onClick={handleRecordClick}
        disabled={playbackMode === "playing" || playbackMode === "paused"}
        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all relative ${
          playbackMode === "recording"
            ? "text-red-500 bg-red-500/10"
            : playbackMode === "playing" || playbackMode === "paused"
              ? "text-[#5a5040]/30 cursor-not-allowed"
              : "text-[#5a5040]/60 hover:text-[#3a3020] hover:bg-[#3a3020]/8"
        }`}
        title={playbackMode === "recording" ? "停止录制" : "开始录制"}
      >
        {playbackMode === "recording" ? (
          <Square size={16} fill="currentColor" />
        ) : (
          <Circle size={16} />
        )}
        {playbackMode === "recording" && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>

      <button
        onClick={handlePlaybackClick}
        disabled={!canPlayback || playbackMode === "recording"}
        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${
          playbackMode === "playing" || playbackMode === "paused"
            ? "text-[#4a7c8a] bg-[#4a7c8a]/10"
            : !canPlayback || playbackMode === "recording"
              ? "text-[#5a5040]/30 cursor-not-allowed"
              : "text-[#5a5040]/60 hover:text-[#3a3020] hover:bg-[#3a3020]/8"
        }`}
        title={
          playbackMode === "playing" || playbackMode === "paused"
            ? "退出回放"
            : "回放创作过程"
        }
      >
        {playbackMode === "playing" || playbackMode === "paused" ? (
          <Square size={16} fill="currentColor" />
        ) : (
          <Play size={16} />
        )}
      </button>

      <div className="w-px h-5 bg-[#3a3020]/10 mx-1" />

      <button
        ref={exportBtnRef}
        onClick={handleExport}
        className="px-4 h-9 flex items-center gap-1.5 rounded-lg bg-[#c23b22]/10 text-[#c23b22] hover:bg-[#c23b22]/20 transition-all text-sm font-serif"
        title="导出作品"
      >
        <Download size={16} />
        <span className="text-xs tracking-wider">导出</span>
      </button>

      {strokeCount > 0 && playbackMode === "idle" && (
        <div className="ml-2 px-2 py-1 bg-[#4a7c8a]/10 rounded-lg">
          <span className="text-[10px] text-[#4a7c8a] font-mono">
            {strokeCount} 笔
          </span>
        </div>
      )}

      <style>{`
        .pulse-recording {
          animation: pulseRed 1.5s ease-in-out infinite;
        }
        @keyframes pulseRed {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
          }
        }
      `}</style>
    </div>
  );
}
