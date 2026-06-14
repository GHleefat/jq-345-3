import { useState, useCallback } from "react";
import { X, Film, Image, Loader2, CheckCircle, Share2 } from "lucide-react";
import { useInkStore } from "@/store/inkStore";
import type { ExportProgress } from "@/utils/exportUtils";

interface ExportPanelProps {
  onExportVideo: (options: { fps: number; speed: number; quality: number }) => Promise<void>;
  onExportGIF: (options: { fps: number; speed: number }) => Promise<void>;
  isExporting: boolean;
  exportProgress: ExportProgress | null;
}

export default function ExportPanel({
  onExportVideo,
  onExportGIF,
  isExporting,
  exportProgress,
}: ExportPanelProps) {
  const { setShowExportPanel } = useInkStore();
  const [activeTab, setActiveTab] = useState<"video" | "gif">("video");
  const [fps, setFps] = useState(30);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState(0.9);
  const [exportComplete, setExportComplete] = useState(false);

  const handleExportVideo = useCallback(async () => {
    setExportComplete(false);
    await onExportVideo({ fps, speed, quality });
    setExportComplete(true);
    setTimeout(() => setExportComplete(false), 3000);
  }, [onExportVideo, fps, speed, quality]);

  const handleExportGIF = useCallback(async () => {
    setExportComplete(false);
    await onExportGIF({ fps: Math.min(fps, 15), speed });
    setExportComplete(true);
    setTimeout(() => setExportComplete(false), 3000);
  }, [onExportGIF, fps, speed]);

  const progressPercent = exportProgress
    ? Math.round(exportProgress.progress * 100)
    : 0;

  return (
    <div
      className="absolute bottom-28 right-4 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/25 border border-[#3a3020]/10 w-[340px] overflow-hidden z-40"
      style={{ animation: "slideInRight 0.3s ease-out" }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3a3020]/8">
        <div className="flex items-center gap-2">
          <Share2 size={18} className="text-[#4a7c8a]" />
          <span className="text-sm font-serif text-[#3a3020] tracking-wider">
            导出分享
          </span>
        </div>
        <button
          onClick={() => setShowExportPanel(false)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#5a5040]/50 hover:text-[#3a3020] hover:bg-[#3a3020]/8 transition-all"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex border-b border-[#3a3020]/8">
        <button
          onClick={() => setActiveTab("video")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-serif tracking-wider transition-all ${
            activeTab === "video"
              ? "text-[#4a7c8a] bg-[#4a7c8a]/8 border-b-2 border-[#4a7c8a]"
              : "text-[#5a5040]/60 hover:text-[#3a3020]"
          }`}
        >
          <Film size={16} />
          视频
        </button>
        <button
          onClick={() => setActiveTab("gif")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-serif tracking-wider transition-all ${
            activeTab === "gif"
              ? "text-[#c23b22] bg-[#c23b22]/8 border-b-2 border-[#c23b22]"
              : "text-[#5a5040]/60 hover:text-[#3a3020]"
          }`}
        >
          <Image size={16} />
          动图
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#5a5040]/70 font-serif tracking-wider">
              帧率
            </span>
            <span className="text-xs text-[#3a3020] font-mono">{fps} FPS</span>
          </div>
          <input
            type="range"
            min={activeTab === "gif" ? 8 : 15}
            max={activeTab === "gif" ? 20 : 60}
            step={1}
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value))}
            disabled={isExporting}
            className="w-full accent-[#4a7c8a]"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#5a5040]/70 font-serif tracking-wider">
              播放速度
            </span>
            <span className="text-xs text-[#3a3020] font-mono">{speed}x</span>
          </div>
          <div className="flex gap-1">
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                disabled={isExporting}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-mono transition-all ${
                  speed === s
                    ? "bg-[#4a7c8a]/20 text-[#4a7c8a]"
                    : "bg-[#3a3020]/5 text-[#5a5040]/60 hover:bg-[#3a3020]/10"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {activeTab === "video" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#5a5040]/70 font-serif tracking-wider">
                画质
              </span>
              <span className="text-xs text-[#3a3020] font-mono">
                {Math.round(quality * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.05}
              value={quality}
              onChange={(e) => setQuality(parseFloat(e.target.value))}
              disabled={isExporting}
              className="w-full accent-[#4a7c8a]"
            />
          </div>
        )}

        {isExporting && exportProgress && (
          <div className="space-y-2 py-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#5a5040]/70 font-serif">正在导出...</span>
              <span className="text-[#4a7c8a] font-mono">
                {progressPercent}%
              </span>
            </div>
            <div className="h-2 bg-[#3a3020]/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#4a7c8a] to-[#6ba0b0] rounded-full transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-[10px] text-[#5a5040]/50 font-mono text-center">
              帧 {exportProgress.currentFrame} / {exportProgress.totalFrames}
            </div>
          </div>
        )}

        {exportComplete && (
          <div className="flex items-center gap-2 py-2 px-3 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle size={18} className="text-green-500" />
            <span className="text-xs text-green-700 font-serif">
              导出完成！文件已自动下载
            </span>
          </div>
        )}

        <button
          onClick={activeTab === "video" ? handleExportVideo : handleExportGIF}
          disabled={isExporting}
          className={`w-full py-3 rounded-xl text-sm font-serif tracking-wider transition-all flex items-center justify-center gap-2 ${
            isExporting
              ? "bg-[#3a3020]/10 text-[#5a5040]/50 cursor-not-allowed"
              : activeTab === "video"
              ? "bg-gradient-to-r from-[#4a7c8a] to-[#6ba0b0] text-white shadow-lg shadow-[#4a7c8a]/25 hover:shadow-xl hover:shadow-[#4a7c8a]/35"
              : "bg-gradient-to-r from-[#c23b22] to-[#d45a3a] text-white shadow-lg shadow-[#c23b22]/25 hover:shadow-xl hover:shadow-[#c23b22]/35"
          }`}
        >
          {isExporting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              导出中...
            </>
          ) : (
            <>
              {activeTab === "video" ? <Film size={18} /> : <Image size={18} />}
              导出{activeTab === "video" ? "WebM视频" : "GIF动图"}
            </>
          )}
        </button>

        <p className="text-[10px] text-[#5a5040]/40 text-center leading-relaxed">
          提示：视频格式为 WebM，可直接分享到微信朋友圈。
          <br />
          如需其他格式，可使用格式转换工具转换。
        </p>
      </div>

      <style>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
