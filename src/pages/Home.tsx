import { useRef, useEffect, useCallback, useState } from "react";
import { useInkStore } from "@/store/inkStore";
import { InkEngine } from "@/utils/inkEngine";
import { generatePaperTexture } from "@/utils/paperTexture";
import { StrokeRecorder } from "@/utils/strokeRecorder";
import { PlaybackEngine } from "@/utils/playbackEngine";
import { VideoExporter, type ExportProgress } from "@/utils/exportUtils";
import Toolbar from "@/components/Toolbar";
import BrushSettings from "@/components/BrushSettings";
import ActionBar from "@/components/ActionBar";
import PaperSelector from "@/components/PaperSelector";
import PlaybackControls from "@/components/PlaybackControls";
import ExportPanel from "@/components/ExportPanel";

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<InkEngine | null>(null);
  const paperCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<StrokeRecorder | null>(null);
  const playbackEngineRef = useRef<PlaybackEngine | null>(null);
  const videoExporterRef = useRef<VideoExporter | null>(null);
  const playbackCanvasRef = useRef<HTMLCanvasElement>(null);

  const isDrawingRef = useRef(false);
  const animFrameRef = useRef<number>(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(
    null,
  );
  const [isExporting, setIsExporting] = useState(false);
  const [currentStrokeIndex, setCurrentStrokeIndex] = useState(0);

  const {
    tool,
    inkDensity,
    brushSize,
    paperType,
    showPaperSelector,
    playbackMode,
    showPlaybackControls,
    showExportPanel,
    playbackTime,
    playbackSpeed,
    setPlaybackMode,
    setCurrentSession,
    setPlaybackTime,
    setPlaybackSpeed,
    setShowPlaybackControls,
    setStrokeCount,
  } = useInkStore();

  const isMovingRef = useRef(false);
  const dwellTimerRef = useRef<number>(0);
  const dwellUpdateTimerRef = useRef<number>(0);
  const lastMovePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const DWELL_THRESHOLD = 3;
  const DWELL_DELAY = 150;

  useEffect(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    const engine = new InkEngine(w, h, paperType);
    engineRef.current = engine;

    const paperCanvas = generatePaperTexture(w, h, paperType);
    paperCanvasRef.current = paperCanvas;

    const recorder = new StrokeRecorder();
    recorderRef.current = recorder;

    const playbackCanvas = document.createElement("canvas");
    playbackCanvas.width = w;
    playbackCanvas.height = h;
    playbackCanvasRef.current = playbackCanvas;

    setCanvasSize({ width: w, height: h });
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setPaperType(paperType);
    }
    if (canvasSize.width > 0 && canvasSize.height > 0) {
      const paperCanvas = generatePaperTexture(
        canvasSize.width,
        canvasSize.height,
        paperType,
      );
      paperCanvasRef.current = paperCanvas;
    }
  }, [paperType, canvasSize]);

  useEffect(() => {
    const render = () => {
      const displayCtx = displayCanvasRef.current?.getContext("2d");
      const engine = engineRef.current;
      const paperCanvas = paperCanvasRef.current;

      if (displayCtx && engine && paperCanvas && canvasSize.width > 0) {
        displayCtx.clearRect(0, 0, canvasSize.width, canvasSize.height);

        if (playbackMode === "playing" || playbackMode === "paused") {
          const playbackEngine = playbackEngineRef.current;
          if (playbackEngine) {
            const inkCanvas = (playbackEngine as any).getCanvas();
            displayCtx.drawImage(paperCanvas, 0, 0);
            displayCtx.drawImage(inkCanvas, 0, 0);
          }
        } else {
          engine.compositeToCanvas(displayCtx, paperCanvas);
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [canvasSize, playbackMode]);

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !engineRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w <= 0 || h <= 0) return;
      engineRef.current.resize(w, h);
      const paperCanvas = generatePaperTexture(w, h, paperType);
      paperCanvasRef.current = paperCanvas;
      setCanvasSize({ width: w, height: h });

      if (playbackCanvasRef.current) {
        playbackCanvasRef.current.width = w;
        playbackCanvasRef.current.height = h;
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [paperType]);

  const getPos = useCallback(
    (e: React.PointerEvent) => {
      const canvas = displayCanvasRef.current;
      if (!canvas || canvasSize.width === 0) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvasSize.width / rect.width;
      const scaleY = canvasSize.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [canvasSize],
  );

  const handleStartRecording = useCallback(() => {
    if (!recorderRef.current || !engineRef.current) return;
    engineRef.current.clear();
    recorderRef.current.clear();
    recorderRef.current.startRecording(
      canvasSize.width,
      canvasSize.height,
      paperType,
    );
    setPlaybackMode("recording");
    setStrokeCount(0);
    setCurrentStrokeIndex(0);
  }, [canvasSize, paperType, setPlaybackMode, setStrokeCount]);

  const handleStopRecording = useCallback(() => {
    if (!recorderRef.current) return;
    const session = recorderRef.current.stopRecording();
    if (session) {
      setCurrentSession(session);
      setStrokeCount(session.strokes.length);
      setShowPlaybackControls(true);
    }
    setPlaybackMode("idle");
  }, [
    setCurrentSession,
    setPlaybackMode,
    setShowPlaybackControls,
    setStrokeCount,
  ]);

  const handleEnterPlayback = useCallback(() => {
    if (!recorderRef.current || !engineRef.current) return;

    const session = recorderRef.current.getSession();
    if (!session) return;

    const playbackEngine = new InkEngine(
      canvasSize.width,
      canvasSize.height,
      paperType,
    );
    const player = new PlaybackEngine(playbackEngine, {
      onTimeUpdate: (time) => {
        setPlaybackTime(time);
      },
      onPlayStateChange: (isPlaying) => {
        setPlaybackMode(isPlaying ? "playing" : "paused");
      },
      onComplete: () => {
        setPlaybackMode("paused");
      },
      onStrokeStart: (index) => {
        setCurrentStrokeIndex(index);
      },
    });

    player.loadSession(session);
    player.setPlaybackSpeed(playbackSpeed);
    playbackEngineRef.current = player;

    const exporter = new VideoExporter(
      playbackEngine,
      player,
      paperType,
      canvasSize.width,
      canvasSize.height,
    );
    videoExporterRef.current = exporter;

    setPlaybackMode("paused");
    setPlaybackTime(0);
    setCurrentStrokeIndex(0);
  }, [
    canvasSize,
    paperType,
    playbackSpeed,
    setPlaybackMode,
    setPlaybackTime,
    setCurrentStrokeIndex,
  ]);

  const handleExitPlayback = useCallback(() => {
    if (playbackEngineRef.current) {
      playbackEngineRef.current.destroy();
      playbackEngineRef.current = null;
    }
    videoExporterRef.current = null;
    setPlaybackMode("idle");
    setPlaybackTime(0);
    setCurrentStrokeIndex(0);
  }, [setPlaybackMode, setPlaybackTime]);

  const handlePlayPause = useCallback(() => {
    if (!playbackEngineRef.current) return;
    playbackEngineRef.current.togglePlay();
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (!playbackEngineRef.current) return;
    playbackEngineRef.current.seekTo(time);
  }, []);

  const handleSpeedChange = useCallback(
    (speed: number) => {
      if (!playbackEngineRef.current) return;
      playbackEngineRef.current.setPlaybackSpeed(speed);
      setPlaybackSpeed(speed);
    },
    [setPlaybackSpeed],
  );

  const handleReset = useCallback(() => {
    if (!playbackEngineRef.current) return;
    playbackEngineRef.current.reset();
  }, []);

  const handleExportVideo = useCallback(
    async (options: { fps: number; speed: number; quality: number }) => {
      if (!videoExporterRef.current || !playbackEngineRef.current) return;

      setIsExporting(true);
      setExportProgress(null);

      try {
        const blob = await videoExporterRef.current.exportVideo(
          {
            fps: options.fps,
            speed: options.speed,
            quality: options.quality,
            scale: 1,
            includePaper: true,
          },
          (progress) => {
            setExportProgress(progress);
          },
        );

        if (blob) {
          videoExporterRef.current.downloadBlob(
            blob,
            `墨韵_回放_${Date.now()}.webm`,
          );
        }
      } finally {
        setIsExporting(false);
      }
    },
    [],
  );

  const handleExportGIF = useCallback(
    async (options: { fps: number; speed: number }) => {
      if (!videoExporterRef.current || !playbackEngineRef.current) return;

      setIsExporting(true);
      setExportProgress(null);

      try {
        const blob = await videoExporterRef.current.exportGIF(
          {
            fps: options.fps,
            speed: options.speed,
            quality: 0.9,
            scale: 1,
            includePaper: true,
          },
          (progress) => {
            setExportProgress(progress);
          },
        );

        if (blob) {
          videoExporterRef.current.downloadBlob(
            blob,
            `墨韵_动图_${Date.now()}.gif`,
          );
        }
      } finally {
        setIsExporting(false);
      }
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!engineRef.current) return;
      if (playbackMode !== "idle" && playbackMode !== "recording") return;

      const { x, y } = getPos(e);
      const pressure = e.pressure || 0.5;
      const time = Date.now();

      if (tool === "inkDrop") {
        engineRef.current.addInkDrop(x, y, inkDensity, brushSize);
        if (recorderRef.current && playbackMode === "recording") {
          recorderRef.current.addInkDrop(x, y, time, inkDensity, brushSize);
          const strokes = recorderRef.current.getStrokes();
          setStrokeCount(strokes.length);
        }
        return;
      }

      if (tool === "water") {
        engineRef.current.addWaterDrop(x, y, brushSize);
        if (recorderRef.current && playbackMode === "recording") {
          recorderRef.current.addWaterDrop(x, y, time, brushSize);
          const strokes = recorderRef.current.getStrokes();
          setStrokeCount(strokes.length);
        }
      }

      isDrawingRef.current = true;
      isMovingRef.current = false;
      lastMovePosRef.current = { x, y };
      clearTimeout(dwellTimerRef.current);
      engineRef.current.startStroke(x, y, pressure, time);

      if (recorderRef.current && playbackMode === "recording") {
        recorderRef.current.startBrushStroke(
          x,
          y,
          pressure,
          time,
          tool as "brush" | "water",
          inkDensity,
          brushSize,
        );
      }

      if (tool === "brush") {
        dwellTimerRef.current = window.setTimeout(() => {
          if (
            isDrawingRef.current &&
            !isMovingRef.current &&
            engineRef.current
          ) {
            engineRef.current.startDwelling(
              x,
              y,
              pressure,
              inkDensity,
              brushSize,
            );
            if (recorderRef.current && playbackMode === "recording") {
              recorderRef.current.startDwell(x, y, pressure, Date.now());
              dwellUpdateTimerRef.current = window.setInterval(() => {
                if (recorderRef.current) {
                  recorderRef.current.updateDwell(Date.now());
                }
              }, 50);
            }
          }
        }, DWELL_DELAY);
      }
    },
    [tool, inkDensity, brushSize, getPos, playbackMode, setStrokeCount],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawingRef.current || !engineRef.current) return;
      if (tool === "inkDrop") return;
      if (playbackMode !== "idle" && playbackMode !== "recording") return;

      const { x, y } = getPos(e);
      const pressure = e.pressure || 0.5;
      const time = Date.now();

      const dx = x - lastMovePosRef.current.x;
      const dy = y - lastMovePosRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > DWELL_THRESHOLD) {
        isMovingRef.current = true;
        engineRef.current.stopDwelling();
        clearInterval(dwellUpdateTimerRef.current);
        engineRef.current.continueStroke(
          x,
          y,
          pressure,
          time,
          tool,
          inkDensity,
          brushSize,
        );

        if (recorderRef.current && playbackMode === "recording") {
          recorderRef.current.addStrokePoint(x, y, pressure, time);
        }

        lastMovePosRef.current = { x, y };

        if (tool === "brush") {
          clearTimeout(dwellTimerRef.current);
          dwellTimerRef.current = window.setTimeout(() => {
            if (
              isDrawingRef.current &&
              !isMovingRef.current &&
              engineRef.current
            ) {
              engineRef.current.startDwelling(
                x,
                y,
                pressure,
                inkDensity,
                brushSize,
              );
              if (recorderRef.current && playbackMode === "recording") {
                recorderRef.current.startDwell(x, y, pressure, Date.now());
                dwellUpdateTimerRef.current = window.setInterval(() => {
                  if (recorderRef.current) {
                    recorderRef.current.updateDwell(Date.now());
                  }
                }, 50);
              }
            }
          }, DWELL_DELAY);
        }
      } else {
        isMovingRef.current = false;
      }
    },
    [tool, inkDensity, brushSize, getPos, playbackMode],
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current || !engineRef.current) return;
    const time = Date.now();
    isDrawingRef.current = false;
    clearTimeout(dwellTimerRef.current);
    clearInterval(dwellUpdateTimerRef.current);
    engineRef.current.stopDwelling();
    engineRef.current.endStroke();

    if (recorderRef.current && playbackMode === "recording") {
      recorderRef.current.endBrushStroke(time);
      const strokes = recorderRef.current.getStrokes();
      setStrokeCount(strokes.length);
    }
  }, [playbackMode, setStrokeCount]);

  const handlePointerLeave = useCallback(() => {
    if (!isDrawingRef.current || !engineRef.current) return;
    const time = Date.now();
    isDrawingRef.current = false;
    clearTimeout(dwellTimerRef.current);
    clearInterval(dwellUpdateTimerRef.current);
    engineRef.current.stopDwelling();
    engineRef.current.endStroke();

    if (recorderRef.current && playbackMode === "recording") {
      recorderRef.current.endBrushStroke(time);
      const strokes = recorderRef.current.getStrokes();
      setStrokeCount(strokes.length);
    }
  }, [playbackMode, setStrokeCount]);

  const handleUndo = useCallback(() => {
    engineRef.current?.undo();
  }, []);

  const handleClear = useCallback(() => {
    engineRef.current?.clear();
  }, []);

  const handleExport = useCallback(() => {
    if (engineRef.current && paperCanvasRef.current) {
      const dataUrl = engineRef.current.exportImage(paperCanvasRef.current);
      const link = document.createElement("a");
      link.download = `墨韵_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    }
  }, []);

  const cursorStyle =
    playbackMode === "playing" || playbackMode === "paused"
      ? "default"
      : tool === "brush"
        ? "crosshair"
        : tool === "water"
          ? "cell"
          : "pointer";

  const duration = playbackEngineRef.current
    ? playbackEngineRef.current.getState().duration
    : 0;

  const isPlaying = playbackMode === "playing";

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#2a2520] relative select-none">
      <div ref={containerRef} className="absolute inset-0">
        <canvas
          ref={displayCanvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="w-full h-full"
          style={{ cursor: cursorStyle, touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />
      </div>

      {playbackMode === "recording" && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-full flex items-center gap-2 z-30 shadow-lg"
          style={{ animation: "pulseRecording 1.5s ease-in-out infinite" }}
        >
          <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
          <span className="text-sm font-serif tracking-wider">录制中</span>
        </div>
      )}

      {playbackMode !== "playing" && playbackMode !== "paused" && (
        <>
          <div
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/85 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/15 border border-[#3a3020]/8 flex flex-col z-20 overflow-hidden"
            style={{ animation: "slideInLeft 0.4s ease-out" }}
          >
            <div className="border-b border-[#3a3020]/8">
              <Toolbar />
            </div>
            <BrushSettings />
          </div>

          <div
            className="absolute top-4 right-4 bg-white/85 backdrop-blur-xl rounded-xl shadow-lg shadow-black/10 border border-[#3a3020]/8 px-3 py-2 z-20"
            style={{ animation: "fadeIn 0.5s ease-out" }}
          >
            <ActionBar
              onUndo={handleUndo}
              onClear={handleClear}
              onExport={handleExport}
              onStartRecording={handleStartRecording}
              onStopRecording={handleStopRecording}
              onEnterPlayback={handleEnterPlayback}
              onExitPlayback={handleExitPlayback}
            />
          </div>
        </>
      )}

      {showPaperSelector && <PaperSelector />}

      {showPlaybackControls &&
        (playbackMode === "playing" || playbackMode === "paused") && (
          <PlaybackControls
            isPlaying={isPlaying}
            currentTime={playbackTime}
            duration={duration}
            playbackSpeed={playbackSpeed}
            strokeCount={useInkStore.getState().strokeCount}
            currentStrokeIndex={currentStrokeIndex}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onSpeedChange={handleSpeedChange}
            onReset={handleReset}
            onExport={() => {}}
          />
        )}

      {showExportPanel &&
        (playbackMode === "playing" || playbackMode === "paused") && (
          <ExportPanel
            onExportVideo={handleExportVideo}
            onExportGIF={handleExportGIF}
            isExporting={isExporting}
            exportProgress={exportProgress}
          />
        )}

      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-white/20 font-serif tracking-[0.3em] z-10 pointer-events-none"
        style={{ animation: "fadeIn 1s ease-out 0.5s both" }}
      >
        墨 韵
      </div>

      <style>{`
        @keyframes pulseRecording {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
          }
          50% {
            box-shadow: 0 0 0 12px rgba(239, 68, 68, 0);
          }
        }
      `}</style>
    </div>
  );
}
