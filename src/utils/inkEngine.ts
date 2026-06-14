import { PerlinNoise } from "./noise";
import {
  getPaperDiffusionFactor,
  generatePaperTexture,
  type PaperType,
} from "./paperTexture";

interface Point {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

export class InkEngine {
  private inkCanvas: HTMLCanvasElement;
  private inkCtx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private paperType: PaperType;
  private lastPoint: Point | null = null;
  private points: Point[] = [];
  private animatingDrops: InkDrop[] = [];
  private rafId: number | null = null;
  private historyStack: ImageData[] = [];
  private maxHistory = 30;
  private historyEnabled = true;
  private dwellRafId: number | null = null;
  private isDwelling = false;
  private dwellPoint: {
    x: number;
    y: number;
    pressure: number;
    inkDensity: number;
    brushSize: number;
  } | null = null;

  constructor(width: number, height: number, paperType: PaperType) {
    this.width = width;
    this.height = height;
    this.paperType = paperType;

    this.inkCanvas = document.createElement("canvas");
    this.inkCanvas.width = width;
    this.inkCanvas.height = height;
    this.inkCtx = this.inkCanvas.getContext("2d", {
      willReadFrequently: true,
    })!;
  }

  getCanvas(): HTMLCanvasElement {
    return this.inkCanvas;
  }

  getContext(): CanvasRenderingContext2D {
    return this.inkCtx;
  }

  setPaperType(type: PaperType) {
    this.paperType = type;
  }

  setHistoryEnabled(enabled: boolean) {
    this.historyEnabled = enabled;
  }

  pushHistory() {
    if (!this.historyEnabled) return;
    const data = this.inkCtx.getImageData(0, 0, this.width, this.height);
    this.historyStack.push(data);
    if (this.historyStack.length > this.maxHistory) {
      this.historyStack.shift();
    }
  }

  undo(): boolean {
    if (this.historyStack.length === 0) return false;
    const data = this.historyStack.pop()!;
    this.inkCtx.putImageData(data, 0, 0);
    return true;
  }

  clear() {
    this.pushHistory();
    this.inkCtx.clearRect(0, 0, this.width, this.height);
    this.animatingDrops = [];
    this.lastPoint = null;
    this.points = [];
  }

  startStroke(x: number, y: number, pressure: number, time: number) {
    this.pushHistory();
    this.lastPoint = { x, y, pressure, time };
    this.points = [{ x, y, pressure, time }];
  }

  continueStroke(
    x: number,
    y: number,
    pressure: number,
    time: number,
    tool: "brush" | "water",
    inkDensity: number,
    brushSize: number,
  ) {
    const current: Point = { x, y, pressure, time };
    if (!this.lastPoint) {
      this.lastPoint = current;
      this.points.push(current);
      return;
    }

    const dx = current.x - this.lastPoint.x;
    const dy = current.y - this.lastPoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dt = current.time - this.lastPoint.time;
    const speed = dt > 0 ? dist / dt : 0;

    const steps = Math.max(1, Math.floor(dist / 2));

    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const px = this.lastPoint.x + dx * t;
      const py = this.lastPoint.y + dy * t;
      const pPressure =
        this.lastPoint.pressure +
        (current.pressure - this.lastPoint.pressure) * t;

      if (tool === "brush") {
        this.drawBrushStamp(px, py, pPressure, speed, inkDensity, brushSize);
      } else {
        this.drawWaterStamp(px, py, brushSize);
      }
    }

    this.lastPoint = current;
    this.points.push(current);
  }

  endStroke() {
    this.stopDwelling();
    this.lastPoint = null;
    this.points = [];
  }

  startDwelling(
    x: number,
    y: number,
    pressure: number,
    inkDensity: number,
    brushSize: number,
  ) {
    this.dwellPoint = { x, y, pressure, inkDensity, brushSize };
    this.isDwelling = true;
    this.dwellLoop();
  }

  stopDwelling() {
    this.isDwelling = false;
    this.dwellPoint = null;
    if (this.dwellRafId !== null) {
      cancelAnimationFrame(this.dwellRafId);
      this.dwellRafId = null;
    }
  }

  private dwellLoop() {
    if (!this.isDwelling || !this.dwellPoint) return;

    const { x, y, pressure, inkDensity, brushSize } = this.dwellPoint;
    const ctx = this.inkCtx;
    const diffusionFactor = getPaperDiffusionFactor(this.paperType);
    const size = Math.max(2, brushSize * (0.3 + pressure * 0.7));

    const coreSize = size * 0.45;
    const midSize = size * 0.7;
    const outerSize = size * (0.9 + diffusionFactor * 0.3);

    const baseAlpha = Math.min(0.6, inkDensity * 0.15);

    const g1 = ctx.createRadialGradient(x, y, 0, x, y, coreSize);
    g1.addColorStop(0, `rgba(10,8,5,${baseAlpha})`);
    g1.addColorStop(0.5, `rgba(20,18,15,${baseAlpha * 0.6})`);
    g1.addColorStop(1, `rgba(30,28,25,0)`);
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(x, y, coreSize, 0, Math.PI * 2);
    ctx.fill();

    const g2 = ctx.createRadialGradient(x, y, coreSize * 0.4, x, y, midSize);
    g2.addColorStop(0, `rgba(25,22,18,${baseAlpha * 0.5})`);
    g2.addColorStop(1, `rgba(40,35,30,0)`);
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(x, y, midSize, 0, Math.PI * 2);
    ctx.fill();

    const g3 = ctx.createRadialGradient(x, y, midSize * 0.3, x, y, outerSize);
    g3.addColorStop(0, `rgba(40,38,35,${baseAlpha * 0.15})`);
    g3.addColorStop(1, `rgba(50,45,40,0)`);
    ctx.fillStyle = g3;
    ctx.beginPath();
    ctx.arc(x, y, outerSize, 0, Math.PI * 2);
    ctx.fill();

    const spreadAngle = Math.random() * Math.PI * 2;
    const spreadDist = size * (0.3 + Math.random() * 0.8);
    const sx = x + Math.cos(spreadAngle) * spreadDist;
    const sy = y + Math.sin(spreadAngle) * spreadDist;
    const sSize = size * (0.04 + Math.random() * 0.1);
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sSize);
    sg.addColorStop(0, `rgba(30,25,20,${baseAlpha * 0.3})`);
    sg.addColorStop(1, `rgba(40,35,30,0)`);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, sSize, 0, Math.PI * 2);
    ctx.fill();

    this.dwellRafId = requestAnimationFrame(() => this.dwellLoop());
  }

  private drawBrushStamp(
    x: number,
    y: number,
    pressure: number,
    speed: number,
    inkDensity: number,
    brushSize: number,
  ) {
    const ctx = this.inkCtx;
    const diffusionFactor = getPaperDiffusionFactor(this.paperType);

    const speedFactor = Math.max(0.2, 1 - speed * 0.15);
    const pressureFactor = 0.3 + pressure * 0.7;

    const baseSize = brushSize * pressureFactor;
    const size = Math.max(2, baseSize * (0.6 + speedFactor * 0.4));

    const alpha = Math.min(1, inkDensity * speedFactor * pressureFactor);

    ctx.save();

    const coreAlpha = alpha * 0.8;
    const midAlpha = alpha * 0.4;
    const outerAlpha = alpha * 0.12 * diffusionFactor;

    const coreSize = size * 0.5;
    const midSize = size * 0.8;
    const outerSize = size * (1.0 + diffusionFactor * 0.5);
    const diffuseSize = size * (1.5 + diffusionFactor * 0.8);

    const gradient1 = ctx.createRadialGradient(x, y, 0, x, y, coreSize);
    gradient1.addColorStop(0, `rgba(20,18,15,${coreAlpha})`);
    gradient1.addColorStop(0.6, `rgba(30,28,25,${coreAlpha * 0.7})`);
    gradient1.addColorStop(1, `rgba(40,38,35,0)`);
    ctx.fillStyle = gradient1;
    ctx.beginPath();
    ctx.arc(x, y, coreSize, 0, Math.PI * 2);
    ctx.fill();

    const gradient2 = ctx.createRadialGradient(
      x,
      y,
      coreSize * 0.5,
      x,
      y,
      midSize,
    );
    gradient2.addColorStop(0, `rgba(35,32,28,${midAlpha})`);
    gradient2.addColorStop(0.5, `rgba(45,42,38,${midAlpha * 0.5})`);
    gradient2.addColorStop(1, `rgba(55,50,45,0)`);
    ctx.fillStyle = gradient2;
    ctx.beginPath();
    ctx.arc(x, y, midSize, 0, Math.PI * 2);
    ctx.fill();

    const gradient3 = ctx.createRadialGradient(
      x,
      y,
      midSize * 0.3,
      x,
      y,
      outerSize,
    );
    gradient3.addColorStop(0, `rgba(50,45,40,${outerAlpha})`);
    gradient3.addColorStop(0.4, `rgba(60,55,50,${outerAlpha * 0.4})`);
    gradient3.addColorStop(1, `rgba(70,65,60,0)`);
    ctx.fillStyle = gradient3;
    ctx.beginPath();
    ctx.arc(x, y, outerSize, 0, Math.PI * 2);
    ctx.fill();

    if (diffusionFactor > 0.8) {
      const gradient4 = ctx.createRadialGradient(
        x,
        y,
        outerSize * 0.3,
        x,
        y,
        diffuseSize,
      );
      gradient4.addColorStop(0, `rgba(70,65,55,${outerAlpha * 0.3})`);
      gradient4.addColorStop(0.5, `rgba(80,75,65,${outerAlpha * 0.1})`);
      gradient4.addColorStop(1, `rgba(90,85,75,0)`);
      ctx.fillStyle = gradient4;
      ctx.beginPath();
      ctx.arc(x, y, diffuseSize, 0, Math.PI * 2);
      ctx.fill();
    }

    if (Math.random() < 0.3 * diffusionFactor) {
      const angle = Math.random() * Math.PI * 2;
      const sDist = size * (0.5 + Math.random() * 1.2);
      const sx = x + Math.cos(angle) * sDist;
      const sy = y + Math.sin(angle) * sDist;
      const sSize = size * (0.05 + Math.random() * 0.15);

      const sGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sSize);
      sGrad.addColorStop(0, `rgba(40,35,30,${alpha * 0.2})`);
      sGrad.addColorStop(1, `rgba(50,45,40,0)`);
      ctx.fillStyle = sGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, sSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawWaterStamp(x: number, y: number, brushSize: number) {
    const ctx = this.inkCtx;
    const radius = brushSize * 1.5;

    const sx = Math.max(0, Math.floor(x - radius));
    const sy = Math.max(0, Math.floor(y - radius));
    const sw = Math.min(this.width - sx, Math.ceil(radius * 2));
    const sh = Math.min(this.height - sy, Math.ceil(radius * 2));

    if (sw <= 0 || sh <= 0) return;

    const imageData = ctx.getImageData(sx, sy, sw, sh);
    const data = imageData.data;

    const diffusionFactor = getPaperDiffusionFactor(this.paperType);
    const blurRadius = Math.max(2, Math.floor(radius * 0.3 * diffusionFactor));

    const tempData = new Uint8ClampedArray(data);

    for (let py = blurRadius; py < sh - blurRadius; py++) {
      for (let px = blurRadius; px < sw - blurRadius; px++) {
        const cx = px + sx;
        const cy = py + sy;
        const distToCenter = Math.sqrt((cx - x) ** 2 + (cy - y) ** 2);

        if (distToCenter > radius) continue;

        const falloff = 1 - distToCenter / radius;
        const idx = (py * sw + px) * 4;

        if (tempData[idx + 3] < 5) continue;

        let rSum = 0,
          gSum = 0,
          bSum = 0,
          aSum = 0,
          count = 0;

        for (let by = -blurRadius; by <= blurRadius; by++) {
          for (let bx = -blurRadius; bx <= blurRadius; bx++) {
            const bIdx = ((py + by) * sw + (px + bx)) * 4;
            const weight = 1 - Math.sqrt(bx * bx + by * by) / blurRadius;
            if (weight > 0) {
              rSum += tempData[bIdx] * weight;
              gSum += tempData[bIdx + 1] * weight;
              bSum += tempData[bIdx + 2] * weight;
              aSum += tempData[bIdx + 3] * weight;
              count += weight;
            }
          }
        }

        if (count > 0) {
          const blend = falloff * 0.4;
          data[idx] = Math.round(
            data[idx] * (1 - blend) + (rSum / count) * blend,
          );
          data[idx + 1] = Math.round(
            data[idx + 1] * (1 - blend) + (gSum / count) * blend,
          );
          data[idx + 2] = Math.round(
            data[idx + 2] * (1 - blend) + (bSum / count) * blend,
          );
          data[idx + 3] = Math.round(
            data[idx + 3] * (1 - blend * 0.3) + (aSum / count) * blend * 0.3,
          );
        }
      }
    }

    ctx.putImageData(imageData, sx, sy);

    ctx.save();
    ctx.globalAlpha = 0.02;
    ctx.globalCompositeOperation = "destination-out";
    const wGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    wGrad.addColorStop(0, "rgba(0,0,0,0.3)");
    wGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = wGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  addInkDrop(x: number, y: number, inkDensity: number, brushSize: number) {
    this.pushHistory();
    const drop = new InkDrop(
      x,
      y,
      inkDensity,
      brushSize,
      this.paperType,
      this.width,
      this.height,
    );
    this.animatingDrops.push(drop);
    if (!this.rafId) {
      this.animateDrops();
    }
  }

  addWaterDrop(x: number, y: number, brushSize: number) {
    this.pushHistory();
    const ctx = this.inkCtx;
    const diffusionFactor = getPaperDiffusionFactor(this.paperType);
    const radius = brushSize * 2;

    const sx = Math.max(0, Math.floor(x - radius));
    const sy = Math.max(0, Math.floor(y - radius));
    const ex = Math.min(this.width, Math.ceil(x + radius));
    const ey = Math.min(this.height, Math.ceil(y + radius));
    const sw = ex - sx;
    const sh = ey - sy;
    if (sw <= 0 || sh <= 0) return;

    const imageData = ctx.getImageData(sx, sy, sw, sh);
    const data = imageData.data;

    let hasInk = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 10) {
        hasInk = true;
        break;
      }
    }
    if (!hasInk) return;

    const drop = new WaterInkFlower(
      x,
      y,
      radius,
      diffusionFactor,
      this.paperType,
      this.width,
      this.height,
      sx,
      sy,
      sw,
      sh,
      imageData,
    );
    this.animatingDrops.push(drop as any);
    if (!this.rafId) {
      this.animateDrops();
    }
  }

  private animateDrops() {
    if (this.animatingDrops.length === 0) {
      this.rafId = null;
      return;
    }

    const ctx = this.inkCtx;

    for (let i = this.animatingDrops.length - 1; i >= 0; i--) {
      const drop = this.animatingDrops[i];
      const stillAlive = drop.step(ctx);

      if (!stillAlive) {
        this.animatingDrops.splice(i, 1);
      }
    }

    this.rafId = requestAnimationFrame(() => this.animateDrops());
  }

  compositeToCanvas(
    targetCtx: CanvasRenderingContext2D,
    paperCanvas: HTMLCanvasElement,
  ) {
    if (this.width <= 0 || this.height <= 0) return;
    if (paperCanvas.width <= 0 || paperCanvas.height <= 0) return;
    targetCtx.drawImage(paperCanvas, 0, 0);
    targetCtx.drawImage(this.inkCanvas, 0, 0);
  }

  exportImage(paperCanvas: HTMLCanvasElement, scale = 2): string {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = this.width * scale;
    exportCanvas.height = this.height * scale;
    const ctx = exportCanvas.getContext("2d")!;

    const hiResPaper = generatePaperTexture(
      this.width * scale,
      this.height * scale,
      this.paperType,
    );
    ctx.drawImage(hiResPaper, 0, 0);

    ctx.save();
    ctx.scale(scale, scale);
    ctx.drawImage(this.inkCanvas, 0, 0);
    ctx.restore();

    return exportCanvas.toDataURL("image/png");
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    if (this.width <= 0 || this.height <= 0) {
      this.width = width;
      this.height = height;
      this.inkCanvas.width = width;
      this.inkCanvas.height = height;
      return;
    }
    const imageData = this.inkCtx.getImageData(0, 0, this.width, this.height);
    this.width = width;
    this.height = height;
    this.inkCanvas.width = width;
    this.inkCanvas.height = height;
    this.inkCtx.putImageData(imageData, 0, 0);
  }

  destroy() {
    this.stopDwelling();
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.animatingDrops = [];
  }
}

class InkDrop {
  private x: number;
  private y: number;
  private density: number;
  private baseSize: number;
  private paperType: PaperType;
  private noise: PerlinNoise;
  private noise2: PerlinNoise;
  private noise3: PerlinNoise;
  private stepCount = 0;
  private maxSteps: number;
  private particles: DropParticle[] = [];
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(
    x: number,
    y: number,
    density: number,
    baseSize: number,
    paperType: PaperType,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    this.x = x;
    this.y = y;
    this.density = density;
    this.baseSize = baseSize;
    this.paperType = paperType;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    this.noise = new PerlinNoise(Math.random() * 10000);
    this.noise2 = new PerlinNoise(Math.random() * 10000);
    this.noise3 = new PerlinNoise(Math.random() * 10000);

    const diffusionFactor = getPaperDiffusionFactor(paperType);
    this.maxSteps = Math.floor(30 + density * 40 * diffusionFactor);

    const numBranches = Math.floor(5 + Math.random() * 8);
    for (let i = 0; i < numBranches; i++) {
      const angle =
        (Math.PI * 2 * i) / numBranches + (Math.random() - 0.5) * 0.8;
      this.particles.push({
        x,
        y,
        angle,
        speed: 0.5 + Math.random() * 1.5,
        life: 1,
        decay: 0.01 + Math.random() * 0.02,
        width: 0.5 + Math.random() * 1.5,
        branching: Math.random() < 0.4,
      });
    }
  }

  step(ctx: CanvasRenderingContext2D): boolean {
    if (this.stepCount >= this.maxSteps) return false;

    const diffusionFactor = getPaperDiffusionFactor(this.paperType);
    const progress = this.stepCount / this.maxSteps;

    if (this.stepCount === 0) {
      const coreSize = this.baseSize * 0.4;
      const alpha = this.density * 0.9;
      const grad = ctx.createRadialGradient(
        this.x,
        this.y,
        0,
        this.x,
        this.y,
        coreSize,
      );
      grad.addColorStop(0, `rgba(15,12,10,${alpha})`);
      grad.addColorStop(0.4, `rgba(25,22,18,${alpha * 0.7})`);
      grad.addColorStop(0.7, `rgba(40,35,30,${alpha * 0.3})`);
      grad.addColorStop(1, `rgba(50,45,40,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, coreSize, 0, Math.PI * 2);
      ctx.fill();
    }

    const haloRadius = this.baseSize * (1.5 + progress * 2 * diffusionFactor);
    const haloAlpha = this.density * 0.08 * (1 - progress * 0.7);
    const haloGrad = ctx.createRadialGradient(
      this.x,
      this.y,
      haloRadius * 0.3,
      this.x,
      this.y,
      haloRadius,
    );
    haloGrad.addColorStop(0, `rgba(60,55,45,${haloAlpha})`);
    haloGrad.addColorStop(0.5, `rgba(70,65,55,${haloAlpha * 0.4})`);
    haloGrad.addColorStop(1, `rgba(80,75,65,0)`);
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    const newParticles: DropParticle[] = [];

    for (const p of this.particles) {
      if (p.life <= 0) continue;

      const noiseAngle =
        this.noise.fbm(p.x * 0.02, p.y * 0.02, 3) * Math.PI * 2;
      const noiseAngle2 = this.noise2.noise2D(p.x * 0.05, p.y * 0.05) * 0.5;

      p.angle = p.angle * 0.7 + noiseAngle * 0.2 + noiseAngle2 * 0.1;

      const vx = Math.cos(p.angle) * p.speed * diffusionFactor;
      const vy = Math.sin(p.angle) * p.speed * diffusionFactor;

      const prevX = p.x;
      const prevY = p.y;
      p.x += vx;
      p.y += vy;

      p.x = Math.max(0, Math.min(this.canvasWidth, p.x));
      p.y = Math.max(0, Math.min(this.canvasHeight, p.y));

      p.life -= p.decay;
      p.speed *= 0.98;

      const alpha = this.density * p.life * 0.3;
      const lineW = Math.max(0.5, p.width * p.life * this.baseSize * 0.05);

      if (alpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `rgba(30,25,20,1)`;
        ctx.lineWidth = lineW;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        const sGrad = ctx.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          lineW * 3,
        );
        sGrad.addColorStop(0, `rgba(30,25,20,${alpha * 0.3})`);
        sGrad.addColorStop(1, `rgba(40,35,30,0)`);
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, lineW * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      if (p.branching && Math.random() < 0.03 && p.life > 0.3) {
        const branchAngle = p.angle + (Math.random() - 0.5) * Math.PI * 0.8;
        newParticles.push({
          x: p.x,
          y: p.y,
          angle: branchAngle,
          speed: p.speed * 0.6,
          life: p.life * 0.5,
          decay: p.decay * 1.5,
          width: p.width * 0.6,
          branching: false,
        });
      }
    }

    this.particles.push(...newParticles);

    if (this.stepCount % 5 === 0 && this.stepCount > 10) {
      const spGrad = ctx.createRadialGradient(
        this.x,
        this.y,
        0,
        this.x,
        this.y,
        haloRadius * 0.6,
      );
      const spAlpha = this.density * 0.05 * (1 - progress);
      spGrad.addColorStop(0, `rgba(25,20,15,${spAlpha})`);
      spGrad.addColorStop(1, `rgba(35,30,25,0)`);
      ctx.fillStyle = spGrad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, haloRadius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    this.stepCount++;
    return this.stepCount < this.maxSteps;
  }
}

interface DropParticle {
  x: number;
  y: number;
  angle: number;
  speed: number;
  life: number;
  decay: number;
  width: number;
  branching: boolean;
}

class WaterInkFlower {
  private cx: number;
  private cy: number;
  private radius: number;
  private diffusionFactor: number;
  private paperType: PaperType;
  private canvasWidth: number;
  private canvasHeight: number;
  private noise: PerlinNoise;
  private noise2: PerlinNoise;
  private stepCount = 0;
  private maxSteps: number;
  private particles: WaterParticle[] = [];
  private sourceInk: { r: number; g: number; b: number; a: number };
  private sourceX: number;
  private sourceY: number;
  private sourceW: number;
  private sourceH: number;
  private sourceImageData: ImageData;

  constructor(
    cx: number,
    cy: number,
    radius: number,
    diffusionFactor: number,
    paperType: PaperType,
    canvasWidth: number,
    canvasHeight: number,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    imageData: ImageData,
  ) {
    this.cx = cx;
    this.cy = cy;
    this.radius = radius;
    this.diffusionFactor = diffusionFactor;
    this.paperType = paperType;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.sourceX = sx;
    this.sourceY = sy;
    this.sourceW = sw;
    this.sourceH = sh;
    this.sourceImageData = imageData;

    this.noise = new PerlinNoise(Math.random() * 10000);
    this.noise2 = new PerlinNoise(Math.random() * 10000);

    this.maxSteps = Math.floor(40 + diffusionFactor * 30);

    let rSum = 0,
      gSum = 0,
      bSum = 0,
      aSum = 0,
      count = 0;
    const data = imageData.data;
    const localCX = Math.floor(cx - sx);
    const localCY = Math.floor(cy - sy);
    const sampleR = Math.floor(radius * 0.5);

    for (let dy = -sampleR; dy <= sampleR; dy++) {
      for (let dx = -sampleR; dx <= sampleR; dx++) {
        const px = localCX + dx;
        const py = localCY + dy;
        if (px < 0 || py < 0 || px >= sw || py >= sh) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > sampleR) continue;
        const idx = (py * sw + px) * 4;
        if (data[idx + 3] > 10) {
          const w = 1 - dist / sampleR;
          rSum += data[idx] * w;
          gSum += data[idx + 1] * w;
          bSum += data[idx + 2] * w;
          aSum += data[idx + 3] * w;
          count += w;
        }
      }
    }

    if (count > 0) {
      this.sourceInk = {
        r: Math.round(rSum / count),
        g: Math.round(gSum / count),
        b: Math.round(bSum / count),
        a: Math.round(aSum / count),
      };
    } else {
      this.sourceInk = { r: 30, g: 25, b: 20, a: 80 };
    }

    const numArms = Math.floor(6 + Math.random() * 10);
    for (let i = 0; i < numArms; i++) {
      const angle = (Math.PI * 2 * i) / numArms + (Math.random() - 0.5) * 0.6;
      this.particles.push({
        x: cx,
        y: cy,
        angle,
        speed: 0.3 + Math.random() * 1.2,
        life: 1,
        decay: 0.008 + Math.random() * 0.015,
        width: 0.4 + Math.random() * 1.2,
        branching: Math.random() < 0.5,
      });
    }
  }

  step(ctx: CanvasRenderingContext2D): boolean {
    if (this.stepCount >= this.maxSteps) return false;

    const progress = this.stepCount / this.maxSteps;
    const { r, g, b, a } = this.sourceInk;
    const inkAlpha = (a / 255) * 0.5 * (1 - progress * 0.6);

    if (this.stepCount < 3) {
      const blurR =
        this.radius * (0.3 + this.stepCount * 0.15) * this.diffusionFactor;
      const grad = ctx.createRadialGradient(
        this.cx,
        this.cy,
        0,
        this.cx,
        this.cy,
        blurR,
      );
      grad.addColorStop(0, `rgba(${r},${g},${b},${inkAlpha * 0.3})`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${inkAlpha * 0.1})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, blurR, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.globalAlpha = 0.08 * this.diffusionFactor;
      ctx.globalCompositeOperation = "destination-out";
      const fadeGrad = ctx.createRadialGradient(
        this.cx,
        this.cy,
        0,
        this.cx,
        this.cy,
        blurR * 0.5,
      );
      fadeGrad.addColorStop(0, "rgba(0,0,0,0.4)");
      fadeGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fadeGrad;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, blurR * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const newParticles: WaterParticle[] = [];

    for (const p of this.particles) {
      if (p.life <= 0) continue;

      const noiseVal =
        this.noise.fbm(p.x * 0.015, p.y * 0.015, 3) * Math.PI * 2;
      const noiseVal2 = this.noise2.noise2D(p.x * 0.04, p.y * 0.04) * 0.4;
      p.angle = p.angle * 0.6 + noiseVal * 0.25 + noiseVal2 * 0.15;

      const vx = Math.cos(p.angle) * p.speed * this.diffusionFactor;
      const vy = Math.sin(p.angle) * p.speed * this.diffusionFactor;

      const prevX = p.x;
      const prevY = p.y;
      p.x += vx;
      p.y += vy;
      p.x = Math.max(0, Math.min(this.canvasWidth, p.x));
      p.y = Math.max(0, Math.min(this.canvasHeight, p.y));

      p.life -= p.decay;
      p.speed *= 0.97;

      const alpha = (a / 255) * p.life * 0.25;
      const lineW = Math.max(0.3, p.width * p.life * this.radius * 0.03);

      if (alpha > 0.005) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
        ctx.lineWidth = lineW;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        const sGrad = ctx.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          lineW * 4,
        );
        sGrad.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.25})`);
        sGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, lineW * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      if (p.branching && Math.random() < 0.04 && p.life > 0.3) {
        const bAngle = p.angle + (Math.random() - 0.5) * Math.PI * 0.9;
        newParticles.push({
          x: p.x,
          y: p.y,
          angle: bAngle,
          speed: p.speed * 0.5,
          life: p.life * 0.4,
          decay: p.decay * 1.3,
          width: p.width * 0.5,
          branching: false,
        });
      }
    }

    this.particles.push(...newParticles);

    if (this.stepCount % 8 === 0 && this.stepCount > 5) {
      const haloR = this.radius * (0.5 + progress * this.diffusionFactor);
      const haloAlpha = (a / 255) * 0.04 * (1 - progress * 0.5);
      const hGrad = ctx.createRadialGradient(
        this.cx,
        this.cy,
        0,
        this.cx,
        this.cy,
        haloR,
      );
      hGrad.addColorStop(0, `rgba(${r},${g},${b},${haloAlpha})`);
      hGrad.addColorStop(0.5, `rgba(${r},${g},${b},${haloAlpha * 0.3})`);
      hGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = hGrad;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, haloR, 0, Math.PI * 2);
      ctx.fill();
    }

    this.stepCount++;
    return this.stepCount < this.maxSteps;
  }
}

interface WaterParticle {
  x: number;
  y: number;
  angle: number;
  speed: number;
  life: number;
  decay: number;
  width: number;
  branching: boolean;
}
