import { describe, expect, it } from "vitest";
import { createCanvas } from "canvas";
import { transparentizeDataUrl, transparentizeImageBuffer } from "../tools/portraitTransparencyNode.mjs";

function makePartiallyTransparentPng() {
  const canvas = createCanvas(4, 4);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 4, 4);
  ctx.clearRect(0, 0, 1, 1);
  return canvas.toBuffer("image/png");
}

describe("portraitTransparencyNode", () => {
  it("既に透過済みのPNGを再処理せず、そのまま返す", async () => {
    const input = makePartiallyTransparentPng();
    const output = await transparentizeImageBuffer(input);
    expect(output.equals(input)).toBe(true);
  });

  it("data URL経由でも既存の透過を保持する", async () => {
    const input = makePartiallyTransparentPng();
    const dataUrl = `data:image/png;base64,${input.toString("base64")}`;
    const output = await transparentizeDataUrl(dataUrl);
    expect(output.equals(input)).toBe(true);
  });
});
