/**
 * Node 用: Buffer / data URL → 透過済み PNG Buffer
 */
import { createCanvas, loadImage } from "canvas";
import { applyPortraitTransparency } from "../portraitTransparency.js";

function hasTransparency(data) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

export async function transparentizeImageBuffer(buf, options = {}) {
  const img = await loadImage(buf);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  /* 透過済み画像は元のPNGをそのまま返し、二重処理を防ぐ。 */
  if (hasTransparency(imageData.data)) return buf;
  /* 不透明な原本だけを透過処理し、髪・弦の閉じた隙間も同時に処理する。 */
  applyPortraitTransparency(imageData, options);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer("image/png", { compressionLevel: 9 });
}

export async function transparentizeDataUrl(dataUrl, options = {}) {
  const m = /^data:image\/(?:png|jpeg|webp);base64,(.+)$/i.exec(dataUrl || "");
  if (!m) throw new Error("画像データが不正です");
  const buf = Buffer.from(m[1], "base64");
  return transparentizeImageBuffer(buf, options);
}
