import { describe, it, expect } from "vitest";
import {
  colorDist,
  isNearBlack,
  isNearWhite,
  isGreenBg,
  floodFillTransparent,
  punchEnclosedBackgroundHoles,
  applyPortraitTransparency,
} from "../portraitTransparency.js";

function makeImage(w, h, fillFn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b, a] = fillFn(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a ?? 255;
    }
  }
  return data;
}

function alphaAt(data, w, x, y) {
  return data[(y * w + x) * 4 + 3];
}

describe("portraitTransparency", () => {
  it("コーナー色から外側背景を透過する", () => {
    const data = makeImage(4, 4, (x, y) => {
      if (x === 1 && y === 1) return [40, 40, 40, 255];
      return [234, 229, 233, 255];
    });
    floodFillTransparent(data, 4, 4);
    expect(alphaAt(data, 4, 0, 0)).toBe(0);
    expect(alphaAt(data, 4, 1, 1)).toBe(255);
  });

  it("緑背景のコーナーを透過する", () => {
    const data = makeImage(3, 3, () => [20, 220, 30, 255]);
    floodFillTransparent(data, 3, 3);
    expect(data[3]).toBe(0);
    expect(data[data.length - 1]).toBe(0);
  });

  it("外周から連結した黒背景だけを透過する", () => {
    const data = makeImage(5, 5, (x, y) => {
      if (x === 2 && y === 2) return [0, 0, 0, 255];
      if (x >= 1 && x <= 3 && y >= 1 && y <= 3) return [180, 120, 80, 255];
      return [0, 0, 0, 255];
    });
    floodFillTransparent(data, 5, 5);
    expect(data[3]).toBe(0);
    expect(alphaAt(data, 5, 2, 2)).toBe(255);
  });

  it("既に透過済みの黒いコーナーは背景シードにしない", () => {
    const data = makeImage(3, 3, () => [0, 0, 0, 0]);
    data[(1 * 3 + 1) * 4 + 3] = 255;
    floodFillTransparent(data, 3, 3);
    expect(alphaAt(data, 3, 1, 1)).toBe(255);
  });

  it("髪の隙間のような閉じた小さな背景島を穴埋めする", () => {
    /* 外周は既に透過、中央にキャラ、その中に背景色の穴 */
    const BG = [234, 229, 233];
    const CHAR = [40, 40, 50];
    const data = makeImage(7, 7, (x, y) => {
      if (x === 0 || y === 0 || x === 6 || y === 6) return [...BG, 0];
      if (x === 3 && y === 3) return [...BG, 255]; /* 閉じた穴 */
      return [...CHAR, 255];
    });
    punchEnclosedBackgroundHoles(data, 7, 7);
    expect(alphaAt(data, 7, 3, 3)).toBe(0);
    expect(alphaAt(data, 7, 2, 2)).toBe(255);
  });

  it("大きな同色塊（白防具想定）は穴埋めしない", () => {
    const BG = [234, 229, 233];
    const data = makeImage(10, 10, (x, y) => {
      if (x === 0 || y === 0 || x === 9 || y === 9) return [...BG, 0];
      /* 内側 8x8 = 64px の白塊 */
      return [...BG, 255];
    });
    punchEnclosedBackgroundHoles(data, 10, 10, { maxHolePixels: 20, maxHoleRatio: 0 });
    expect(alphaAt(data, 10, 5, 5)).toBe(255);
  });

  it("applyPortraitTransparency は外周＋閉じ穴の両方を透過する", () => {
    const BG = [234, 229, 233];
    const CHAR = [80, 60, 50];
    const data = makeImage(6, 6, (x, y) => {
      if (x === 0 || y === 0 || x === 5 || y === 5) return [...BG, 255];
      if (x === 2 && y === 2) return [...BG, 255];
      return [...CHAR, 255];
    });
    applyPortraitTransparency({ data, width: 6, height: 6 });
    expect(alphaAt(data, 6, 0, 0)).toBe(0);
    expect(alphaAt(data, 6, 2, 2)).toBe(0);
    expect(alphaAt(data, 6, 3, 3)).toBe(255);
  });

  it("色距離判定", () => {
    expect(colorDist(234, 229, 233, 255, 255, 255)).toBe(26);
    expect(isNearWhite(230, 230, 230)).toBe(true);
    expect(isNearBlack(10, 10, 10)).toBe(true);
    expect(isGreenBg(20, 200, 20)).toBe(true);
  });
});
