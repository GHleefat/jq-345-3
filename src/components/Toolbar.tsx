import { useInkStore, type Tool } from "@/store/inkStore";
import { Paintbrush, Droplets, CircleDot } from "lucide-react";

const tools: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: "brush", label: "毛笔", icon: <Paintbrush size={22} /> },
  { id: "water", label: "清水", icon: <Droplets size={22} /> },
  { id: "inkDrop", label: "墨滴", icon: <CircleDot size={22} /> },
];

export default function Toolbar() {
  const { tool, setTool } = useInkStore();

  return (
    <div className="flex flex-col gap-1 p-2">
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          className={`
            group relative flex flex-col items-center justify-center w-14 h-14 rounded-xl
            transition-all duration-300 ease-out
            ${
              tool === t.id
                ? "bg-[#c23b22]/15 text-[#c23b22] shadow-md shadow-[#c23b22]/10"
                : "text-[#5a5040]/70 hover:text-[#3a3020] hover:bg-[#3a3020]/8"
            }
          `}
          title={t.label}
        >
          {t.icon}
          <span className="text-[10px] mt-0.5 font-serif tracking-wider">
            {t.label}
          </span>
          {tool === t.id && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#c23b22] rounded-r-full" />
          )}
        </button>
      ))}
    </div>
  );
}
