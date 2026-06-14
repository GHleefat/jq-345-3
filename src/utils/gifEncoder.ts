export interface GIFFrame {
  imageData: ImageData;
  delay: number;
}

class SimpleColorQuantizer {
  static quantize(imageData: ImageData): { palette: Uint8Array; indices: Uint8Array } {
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const pixelCount = width * height;

    const colorCounts = new Map<number, number>();
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const color = (r << 16) | (g << 8) | b;
      colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
    }

    const colors = Array.from(colorCounts.entries());
    colors.sort((a, b) => b[1] - a[1]);

    const palette = new Uint8Array(256 * 3);
    const colorToIndex = new Map<number, number>();

    const numColors = Math.min(256, colors.length);
    for (let i = 0; i < numColors; i++) {
      const color = colors[i][0];
      palette[i * 3] = (color >> 16) & 0xff;
      palette[i * 3 + 1] = (color >> 8) & 0xff;
      palette[i * 3 + 2] = color & 0xff;
      colorToIndex.set(color, i);
    }

    if (numColors < 256) {
      for (let i = numColors * 3; i < 256 * 3; i++) {
        palette[i] = 0;
      }
    }

    const indices = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const color = (r << 16) | (g << 8) | b;

      let paletteIndex = colorToIndex.get(color);
      if (paletteIndex === undefined) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let j = 0; j < numColors; j++) {
          const pr = palette[j * 3];
          const pg = palette[j * 3 + 1];
          const pb = palette[j * 3 + 2];
          const dist = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = j;
          }
        }
        paletteIndex = bestIdx;
      }
      indices[i] = paletteIndex;
    }

    return { palette, indices };
  }
}

class LZWCompressor {
  static compress(indices: Uint8Array, minCodeSize: number): number[] {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let nextCode = eoiCode + 1;
    let codeSize = minCodeSize + 1;
    const maxCodeSize = 12;

    const output: number[] = [];
    let bitBuffer = 0;
    let bitCount = 0;

    function writeCode(code: number) {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;

      while (bitCount >= 8) {
        output.push(bitBuffer & 0xff);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    }

    const dict = new Map<string, number>();

    function resetDict() {
      dict.clear();
      for (let i = 0; i < clearCode; i++) {
        dict.set(String(i), i);
      }
      nextCode = eoiCode + 1;
      codeSize = minCodeSize + 1;
    }

    resetDict();
    writeCode(clearCode);

    let w = String(indices[0]);

    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const wk = w + "," + k;

      if (dict.has(wk)) {
        w = wk;
      } else {
        const code = dict.get(w);
        if (code !== undefined) {
          writeCode(code);
        }

        if (nextCode < (1 << maxCodeSize)) {
          dict.set(wk, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < maxCodeSize) {
            codeSize++;
          }
        } else {
          writeCode(clearCode);
          resetDict();
        }

        w = String(k);
      }
    }

    const finalCode = dict.get(w);
    if (finalCode !== undefined) {
      writeCode(finalCode);
    }
    writeCode(eoiCode);

    if (bitCount > 0) {
      output.push(bitBuffer & 0xff);
    }

    return output;
  }
}

export class GIFEncoder {
  private width: number;
  private height: number;
  private frames: GIFFrame[] = [];
  private repeat: number = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  addFrame(imageData: ImageData, delay: number = 10) {
    this.frames.push({ imageData, delay });
  }

  setRepeat(repeat: number) {
    this.repeat = repeat;
  }

  encode(): Blob {
    const bytes: number[] = [];

    function writeByte(b: number) {
      bytes.push(b & 0xff);
    }

    function writeShort(s: number) {
      bytes.push(s & 0xff);
      bytes.push((s >> 8) & 0xff);
    }

    function writeString(str: string) {
      for (let i = 0; i < str.length; i++) {
        bytes.push(str.charCodeAt(i) & 0xff);
      }
    }

    function writePalette(palette: Uint8Array) {
      for (let i = 0; i < 256; i++) {
        const idx = i * 3;
        writeByte(palette[idx] || 0);
        writeByte(palette[idx + 1] || 0);
        writeByte(palette[idx + 2] || 0);
      }
    }

    writeString("GIF89a");

    writeShort(this.width);
    writeShort(this.height);
    writeByte(0xf7);
    writeByte(0);
    writeByte(0);

    const firstFrame = this.frames[0];
    let globalPalette = new Uint8Array(256 * 3);
    if (firstFrame) {
      const quant = SimpleColorQuantizer.quantize(firstFrame.imageData);
      globalPalette = quant.palette;
    }
    writePalette(globalPalette);

    writeByte(0x21);
    writeByte(0xff);
    writeByte(11);
    writeString("NETSCAPE2.0");
    writeByte(3);
    writeByte(1);
    writeShort(this.repeat);
    writeByte(0);

    for (let i = 0; i < this.frames.length; i++) {
      const frame = this.frames[i];
      const delayCs = Math.max(2, Math.round(frame.delay / 10));

      writeByte(0x21);
      writeByte(0xf9);
      writeByte(4);
      writeByte(0x04);
      writeShort(delayCs);
      writeByte(0);
      writeByte(0);

      writeByte(0x2c);
      writeShort(0);
      writeShort(0);
      writeShort(this.width);
      writeShort(this.height);
      writeByte(0);

      const quant = SimpleColorQuantizer.quantize(frame.imageData);
      const lzwData = LZWCompressor.compress(quant.indices, 8);

      const minCodeSize = 8;
      writeByte(minCodeSize);

      let pos = 0;
      while (pos < lzwData.length) {
        const blockSize = Math.min(255, lzwData.length - pos);
        writeByte(blockSize);
        for (let j = 0; j < blockSize; j++) {
          writeByte(lzwData[pos + j]);
        }
        pos += blockSize;
      }

      writeByte(0);
    }

    writeByte(0x3b);

    const uint8 = new Uint8Array(bytes);
    return new Blob([uint8], { type: "image/gif" });
  }
}
