import { PerlinNoise } from "./noise";

export type PaperType = "raw" | "cooked" | "bark";

const PAPER_CONFIG: Record<
  PaperType,
  {
    fiberScale: number;
    fiberIntensity: number;
    speckleIntensity: number;
    baseColor: [number, number, number];
    name: string;
  }
> = {
  raw: {
    fiberScale: 0.03,
    fiberIntensity: 0.15,
    speckleIntensity: 0.06,
    baseColor: [245, 240, 228],
    name: "生宣",
  },
  cooked: {
    fiberScale: 0.06,
    fiberIntensity: 0.08,
    speckleIntensity: 0.03,
    baseColor: [248, 244, 236],
    name: "熟宣",
  },
  bark: {
    fiberScale: 0.04,
    fiberIntensity: 0.12,
    speckleIntensity: 0.1,
    baseColor: [240, 232, 216],
    name: "皮纸",
  },
};

export function generatePaperTexture(
  width: number,
  height: number,
  type: PaperType,
): HTMLCanvasElement {
  const config = PAPER_CONFIG[type];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  const noise = new PerlinNoise(42);
  const noise2 = new PerlinNoise(137);
  const noise3 = new PerlinNoise(256);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      const fiber1 = noise.fbm(x * config.fiberScale, y * config.fiberScale, 4);
      const fiber2 = noise2.fbm(
        x * config.fiberScale * 2,
        y * config.fiberScale * 0.5,
        3,
      );
      const fiberValue = (fiber1 * 0.6 + fiber2 * 0.4) * config.fiberIntensity;

      const speckle = noise3.noise2D(x * 0.1, y * 0.1);
      const speckleValue =
        speckle > 0.3 ? (speckle - 0.3) * config.speckleIntensity : 0;

      const grain = (Math.random() - 0.5) * 0.02;

      const variation = fiberValue + speckleValue + grain;

      data[idx] = Math.min(
        255,
        Math.max(0, config.baseColor[0] + variation * 255),
      );
      data[idx + 1] = Math.min(
        255,
        Math.max(0, config.baseColor[1] + variation * 255),
      );
      data[idx + 2] = Math.min(
        255,
        Math.max(0, config.baseColor[2] + variation * 255 * 0.95),
      );
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const lineNoise = new PerlinNoise(99);
  ctx.globalAlpha = 0.03;
  ctx.strokeStyle = "rgba(180,170,150,1)";
  for (let i = 0; i < height; i += 2) {
    const offset = lineNoise.noise2D(i * 0.01, 0) * 3;
    ctx.beginPath();
    ctx.moveTo(0, i + offset);
    ctx.lineTo(width, i + offset + lineNoise.noise2D(i * 0.01, 1) * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return canvas;
}

export function getPaperName(type: PaperType): string {
  return PAPER_CONFIG[type].name;
}

export function getPaperDiffusionFactor(type: PaperType): number {
  switch (type) {
    case "raw":
      return 1.2;
    case "cooked":
      return 0.5;
    case "bark":
      return 0.85;
  }
}
