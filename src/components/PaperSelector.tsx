import { useInkStore, type PaperType } from "@/store/inkStore";
import { getPaperName } from "@/utils/paperTexture";
import { useEffect, useRef, useState } from "react";
import { generatePaperTexture } from "@/utils/paperTexture";

const paperTypes: PaperType[] = ["raw", "cooked", "bark"];

const paperDescriptions: Record<PaperType, string> = {
  raw: "吸墨性强，扩散明显",
  cooked: "吸墨性弱，边缘清晰",
  bark: "中等吸墨，带斑点纹理",
};

export default function PaperSelector() {
  const { paperType, setPaperType, setShowPaperSelector } = useInkStore();
  const [previews, setPreviews] = useState<Record<PaperType, string>>(
    {} as any,
  );
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const generated: Record<PaperType, string> = {} as any;
    for (const type of paperTypes) {
      const canvas = generatePaperTexture(120, 80, type);
      generated[type] = canvas.toDataURL();
    }
    setPreviews(generated);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPaperSelector(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setShowPaperSelector]);

  return (
    <div
      ref={panelRef}
      className="absolute top-16 right-4 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl shadow-black/10 border border-[#3a3020]/10 p-4 z-30 min-w-[220px]"
      style={{ animation: "fadeIn 0.2s ease-out" }}
    >
      <h3 className="text-sm font-serif text-[#3a3020] mb-3 tracking-wider">
        宣纸纹理
      </h3>
      <div className="flex flex-col gap-2">
        {paperTypes.map((type) => (
          <button
            key={type}
            onClick={() => {
              setPaperType(type);
              setShowPaperSelector(false);
            }}
            className={`
              flex items-center gap-3 p-2 rounded-xl transition-all duration-200
              ${
                paperType === type
                  ? "bg-[#c23b22]/8 ring-1 ring-[#c23b22]/20"
                  : "hover:bg-[#3a3020]/5"
              }
            `}
          >
            {previews[type] && (
              <img
                src={previews[type]}
                alt={getPaperName(type)}
                className="w-16 h-10 rounded-lg object-cover border border-[#3a3020]/10"
              />
            )}
            <div className="flex flex-col items-start">
              <span
                className={`text-xs font-serif tracking-wider ${
                  paperType === type ? "text-[#c23b22]" : "text-[#3a3020]"
                }`}
              >
                {getPaperName(type)}
              </span>
              <span className="text-[10px] text-[#8a7a60]/60">
                {paperDescriptions[type]}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
