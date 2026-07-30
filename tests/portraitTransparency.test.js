import { describe, it, expect } from "vitest";
import {
  colorDist,
  isNearBlack,
  isNearWhite,
  isGreenBg,
  floodFillTransparent,
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

describe("portraitTransparency", () => {
  it("コーナー色から外側背景を透過する", () => {
    const data = makeImage(4, 4, (x, y) => {
      if (x === 1 && y === 1) return [40, 40, 40, 255];
      return [234, 229, 233, 255];
    });
    floodFillTransparent(data, 4, 4);
    expect(data[(0 * 4 + 0) * 4 + 3]).toBe(0);
    expect(data[(1 * 4 + 1) * 4 + 3]).toBe(255);
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
    expect(data[(2 * 5 + 2) * 4 + 3]).toBe(255);
  });

  it("既に透過済みの黒いコーナーは背景シードにしない", () => {
    const data = makeImage(3, 3, () => [0, 0, 0, 0]);
    data[(1 * 3 + 1) * 4 + 3] = 255;
    floodFillTransparent(data, 3, 3);
    expect(data[(1 * 3 + 1) * 4 + 3]).toBe(255);
  });

  it("色距離判定", () => {
    expect(colorDist(234, 229, 233, 255, 255, 255)).toBe(26);
    expect(isNearWhite(230, 230, 230)).toBe(true);
    expect(isNearBlack(10, 10, 10)).toBe(true);
    expect(isGreenBg(20, 200, 20)).toBe(true);
  });
});
