import { useCallback, useRef } from "react";
import { Play, Pause, SkipBack, Gauge, Video } from "lucide-react";
import { useInkStore } from "@/store/inkStore";
import { formatTime } from "@/utils/exportUtils";

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  strokeCount: number;
  currentStrokeIndex: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
  onExport: () => void;
}

const speedOptions = [0.5, 1, 2, 4, 8];

export default function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  playbackSpeed,
  strokeCount,
  currentStrokeIndex,
  onPlayPause,
  onSeek,
  onSpeedChange,
  onReset,
  onExport,
}: PlaybackControlsProps) {
  const { showExportPanel, setShowExportPanel } = useInkStore();
  const progressRef = useRef<HTMLDivElement>(null);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current || duration === 0) return;
      const rect = progressRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      onSeek(percentage * duration);
    },
    [duration, onSeek],
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/20 border border-[#3a3020]/10 px-6 py-4 z-30 min-w-[600px]"
      style={{ animation: "slideUp 0.4s ease-out" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#5a5040]/60 font-serif tracking-widest">
              笔画
            </span>
            <span className="text-sm text-[#c23b22] font-serif">
              {Math.min(currentStrokeIndex + 1, strokeCount)} / {strokeCount}
            </span>
          </div>
          <div className="w-px h-4 bg-[#3a3020]/10" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#5a5040]/60 font-serif tracking-widest">
              时长
            </span>
            <span className="text-sm text-[#3a3020] font-mono">
              {formatTime(currentTime)}
            </span>
            <span className="text-[#8a7a60]/40 text-xs">/</span>
            <span className="text-sm text-[#8a7a60]/60 font-mono">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#3a3020]/5 rounded-lg px-2 py-1">
            <Gauge size={14} className="text-[#5a5040]/60" />
            {speedOptions.map((speed) => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                  playbackSpeed === speed
                    ? "bg-[#c23b22] text-white shadow-md"
                    : "text-[#5a5040]/60 hover:text-[#3a3020] hover:bg-white/50"
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowExportPanel(!showExportPanel)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-serif transition-all ${
              showExportPanel
                ? "bg-[#4a7c8a]/15 text-[#4a7c8a]"
                : "bg-[#3a3020]/8 text-[#5a5040]/70 hover:bg-[#3a3020]/15 hover:text-[#3a3020]"
            }`}
          >
            <Video size={14} />
            <span className="tracking-wider">导出</span>
          </button>
        </div>
      </div>

      <div
        ref={progressRef}
        onClick={handleProgressClick}
        className="relative h-3 bg-[#3a3020]/8 rounded-full cursor-pointer group mb-4 overflow-hidden"
      >
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#c23b22]/80 to-[#c23b22] rounded-full transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-[#c23b22] opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${progress}% - 8px)` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          onClick={onReset}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-[#3a3020]/8 text-[#5a5040]/70 hover:bg-[#3a3020]/15 hover:text-[#3a3020] transition-all"
          title="回到开始"
        >
          <SkipBack size={20} />
        </button>

        <button
          onClick={onPlayPause}
          className="w-16 h-16 flex items-center justify-center rounded-full bg-gradient-to-br from-[#c23b22] to-[#a02810] text-white shadow-lg shadow-[#c23b22]/30 hover:shadow-xl hover:shadow-[#c23b22]/40 hover:scale-105 active:scale-95 transition-all"
          title={isPlaying ? "暂停" : "播放"}
        >
          {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
        </button>

        <div className="w-11 h-11 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <span className="text-[8px] text-[#5a5040]/40 font-serif tracking-widest">
              回放
            </span>
            <span className="text-[8px] text-[#5a5040]/40 font-serif">
              模式
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translate(-50%, 20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </div>
  );
}
