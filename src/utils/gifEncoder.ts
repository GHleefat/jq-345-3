export interface GIFFrame {
  imageData: ImageData;
  delay: number;
}

class ColorQuantizer {
  static quantize(imageData: ImageData, maxColors: number = 256): { palette: number[]; indices: Uint8Array } {
    const pixels = imageData.data;
    const pixelCount = imageData.width * imageData.height;

    const colorMap = new Map<number, number>();
    const colorList: number[] = [];

    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const color = (r << 16) | (g << 8) | b;

      if (!colorMap.has(color)) {
        colorMap.set(color, colorList.length);
        colorList.push(color);
      }
    }

    if (colorList.length <= maxColors) {
      const palette: number[] = [];
      for (const color of colorList) {
        palette.push((color >> 16) & 0xff);
        palette.push((color >> 8) & 0xff);
        palette.push(color & 0xff);
      }

      while (palette.length < maxColors * 3) {
        palette.push(0);
      }

      const indices = new Uint8Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        const idx = i * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const color = (r << 16) | (g << 8) | b;
        indices[i] = colorMap.get(color) || 0;
      }

      return { palette, indices };
    }

    return this.medianCutQuantize(imageData, maxColors);
  }

  private static medianCutQuantize(
    imageData: ImageData,
    maxColors: number,
  ): { palette: number[]; indices: Uint8Array } {
    const pixels = imageData.data;
    const pixelCount = imageData.width * imageData.height;

    const pixelColors: number[] = [];
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      pixelColors.push((pixels[idx] << 16) | (pixels[idx + 1] << 8) | pixels[idx + 2]);
    }

    interface ColorBucket {
      colors: number[];
      rMin: number; rMax: number;
      gMin: number; gMax: number;
      bMin: number; bMax: number;
    }

    function buildBucket(colors: number[]): ColorBucket {
      let rMin = 255, rMax = 0;
      let gMin = 255, gMax = 0;
      let bMin = 255, bMax = 0;

      for (const c of colors) {
        const r = (c >> 16) & 0xff;
        const g = (c >> 8) & 0xff;
        const b = c & 0xff;
        if (r < rMin) rMin = r;
        if (r > rMax) rMax = r;
        if (g < gMin) gMin = g;
        if (g > gMax) gMax = g;
        if (b < bMin) bMin = b;
        if (b > bMax) bMax = b;
      }

      return { colors, rMin, rMax, gMin, gMax, bMin, bMax };
    }

    function splitBucket(bucket: ColorBucket): [ColorBucket, ColorBucket] {
      const rRange = bucket.rMax - bucket.rMin;
      const gRange = bucket.gMax - bucket.gMin;
      const bRange = bucket.bMax - bucket.bMin;

      let sortKey: (c: number) => number;
      if (rRange >= gRange && rRange >= bRange) {
        sortKey = (c) => (c >> 16) & 0xff;
      } else if (gRange >= bRange) {
        sortKey = (c) => (c >> 8) & 0xff;
      } else {
        sortKey = (c) => c & 0xff;
      }

      const sorted = [...bucket.colors].sort((a, b) => sortKey(a) - sortKey(b));
      const mid = Math.floor(sorted.length / 2);
      return [buildBucket(sorted.slice(0, mid)), buildBucket(sorted.slice(mid))];
    }

    let buckets: ColorBucket[] = [buildBucket(pixelColors)];

    while (buckets.length < maxColors) {
      let largestIdx = 0;
      let largestSize = 0;

      for (let i = 0; i < buckets.length; i++) {
        if (buckets[i].colors.length > largestSize) {
          largestSize = buckets[i].colors.length;
          largestIdx = i;
        }
      }

      if (largestSize <= 1) break;

      const [a, b] = splitBucket(buckets[largestIdx]);
      buckets.splice(largestIdx, 1, a, b);
    }

    const palette: number[] = [];
    for (const bucket of buckets) {
      let rSum = 0, gSum = 0, bSum = 0;
      for (const c of bucket.colors) {
        rSum += (c >> 16) & 0xff;
        gSum += (c >> 8) & 0xff;
        bSum += c & 0xff;
      }
      const count = bucket.colors.length || 1;
      palette.push(Math.round(rSum / count));
      palette.push(Math.round(gSum / count));
      palette.push(Math.round(bSum / count));
    }

    while (palette.length < maxColors * 3) {
      palette.push(0);
    }

    const indices = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      let bestIdx = 0;
      let bestDist = Infinity;

      for (let j = 0; j < buckets.length; j++) {
        const pr = palette[j * 3];
        const pg = palette[j * 3 + 1];
        const pb = palette[j * 3 + 2];
        const dist = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = j;
        }
      }

      indices[i] = bestIdx;
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
    const maxCode = 1 << codeSize;
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

    const dictionary = new Map<string, number>();
    function resetDictionary() {
      dictionary.clear();
      for (let i = 0; i < clearCode; i++) {
        dictionary.set(String(i), i);
      }
      nextCode = eoiCode + 1;
      codeSize = minCodeSize + 1;
    }

    resetDictionary();
    writeCode(clearCode);

    let currentSequence = String(indices[0]);

    for (let i = 1; i < indices.length; i++) {
      const nextIndex = indices[i];
      const combined = currentSequence + "," + nextIndex;

      if (dictionary.has(combined)) {
        currentSequence = combined;
      } else {
        const code = dictionary.get(currentSequence);
        if (code !== undefined) {
          writeCode(code);
        }

        if (nextCode < (1 << maxCodeSize)) {
          dictionary.set(combined, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < maxCodeSize) {
            codeSize++;
          }
        } else {
          writeCode(clearCode);
          resetDictionary();
        }

        currentSequence = String(nextIndex);
      }
    }

    const finalCode = dictionary.get(currentSequence);
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

    function writeBytes(data: number[] | Uint8Array) {
      for (let i = 0; i < data.length; i++) {
        bytes.push(data[i] & 0xff);
      }
    }

    function writeString(str: string) {
      for (let i = 0; i < str.length; i++) {
        bytes.push(str.charCodeAt(i) & 0xff);
      }
    }

    function writeShort(s: number) {
      bytes.push(s & 0xff);
      bytes.push((s >> 8) & 0xff);
    }

    writeString("GIF89a");

    writeShort(this.width);
    writeShort(this.height);

    writeByte(0xf7);
    writeByte(0);
    writeByte(0);

    const firstFrame = this.frames[0];
    let globalPalette: number[] = [];
    if (firstFrame) {
      const quant = ColorQuantizer.quantize(firstFrame.imageData, 256);
      globalPalette = quant.palette;
    }

    for (let i = 0; i < 256 * 3; i++) {
      writeByte(globalPalette[i] || 0);
    }

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

      writeByte(0x21);
      writeByte(0xf9);
      writeByte(4);
      writeByte(0x08);

      const delayCs = Math.max(2, Math.round(frame.delay / 10));
      writeShort(delayCs);

      writeByte(0);
      writeByte(0);

      writeByte(0x2c);
      writeShort(0);
      writeShort(0);
      writeShort(this.width);
      writeShort(this.height);
      writeByte(0);

      const quant = ColorQuantizer.quantize(frame.imageData, 256);

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
