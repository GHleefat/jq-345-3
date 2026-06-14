import { useInkStore } from "@/store/inkStore";

export default function BrushSettings() {
  const { inkDensity, brushSize, setInkDensity, setBrushSize, tool } =
    useInkStore();

  const densityLabels = ["淡墨", "浓墨", "焦墨"];
  const densityIndex = inkDensity < 0.35 ? 0 : inkDensity < 0.7 ? 1 : 2;

  return (
    <div className="flex flex-col gap-4 px-3 py-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#5a5040]/70 font-serif tracking-wider">
            {tool === "water" ? "水量" : "墨色"}
          </span>
          <span className="text-[10px] text-[#8a7a60]/60 font-serif">
            {tool === "water" ? "" : densityLabels[densityIndex]}
          </span>
        </div>
        <div className="relative h-6 flex items-center">
          <div
            className="absolute inset-0 rounded-full h-[6px] top-[9px]"
            style={{
              background:
                tool === "water"
                  ? "linear-gradient(to right, rgba(74,124,138,0.1), rgba(74,124,138,0.6))"
                  : "linear-gradient(to right, rgba(150,140,120,0.3), rgba(20,18,15,0.9))",
            }}
          />
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={inkDensity}
            onChange={(e) => setInkDensity(parseFloat(e.target.value))}
            className="ink-slider w-full relative z-10"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-[#5a5040]/70 font-serif tracking-wider">
          {tool === "inkDrop" ? "墨量" : "笔触"}
        </span>
        <div className="flex items-center gap-3">
          <div
            className="rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              width: Math.max(8, Math.min(40, brushSize)) + "px",
              height: Math.max(8, Math.min(40, brushSize)) + "px",
              background:
                tool === "water"
                  ? "radial-gradient(circle, rgba(74,124,138,0.4), rgba(74,124,138,0.1))"
                  : "radial-gradient(circle, rgba(30,25,20,0.6), rgba(30,25,20,0.1))",
            }}
          />
          <input
            type="range"
            min="5"
            max="60"
            step="1"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="ink-slider flex-1"
          />
        </div>
      </div>
    </div>
  );
}
