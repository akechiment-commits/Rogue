/**
 * 立ち絵背景の透過処理（白・コーナー色・緑系クロマキー）
 * ブラウザ Canvas / Node canvas 双方で ImageData に適用可能。
 */

export const DEFAULT_TRANSPARENCY_OPTIONS = {
  threshold: 20,
  nearWhite: 220,
  greenMin: 150,
};

export function colorDist(r1, g1, b1, r2, g2, b2) {
  return Math.max(
    Math.abs(r1 - r2),
    Math.abs(g1 - g2),
    Math.abs(b1 - b2),
  );
}

export function isNearWhite(r, g, b, nearWhite = DEFAULT_TRANSPARENCY_OPTIONS.nearWhite) {
  return r >= nearWhite && g >= nearWhite && b >= nearWhite;
}

export function isGreenBg(r, g, b, greenMin = DEFAULT_TRANSPARENCY_OPTIONS.greenMin) {
  return g >= greenMin && g > r + 20 && g > b + 20;
}

function isBgSeed(r, g, b, opts) {
  return isNearWhite(r, g, b, opts.nearWhite) || isGreenBg(r, g, b, opts.greenMin);
}

/**
 * @param {Uint8ClampedArray} data - RGBA
 * @param {number} width
 * @param {number} height
 * @param {Partial<typeof DEFAULT_TRANSPARENCY_OPTIONS>} options
 */
export function floodFillTransparent(data, width, height, options = {}) {
  const opts = { ...DEFAULT_TRANSPARENCY_OPTIONS, ...options };
  const visited = new Uint8Array(width * height);
  const queue = [];

  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];

  for (const [cx, cy] of corners) {
    const idx = (cy * width + cx) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    if (!isBgSeed(r, g, b, opts)) continue;
    const cell = cy * width + cx;
    if (visited[cell]) continue;
    visited[cell] = 1;
    queue.push({ x: cx, y: cy, refR: r, refG: g, refB: b });
  }

  while (queue.length > 0) {
    const { x, y, refR, refG, refB } = queue.shift();
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    if (colorDist(r, g, b, refR, refG, refB) > opts.threshold) continue;

    data[idx + 3] = 0;

    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const cell = ny * width + nx;
      if (visited[cell]) continue;
      visited[cell] = 1;
      queue.push({ x: nx, y: ny, refR, refG, refB });
    }
  }

  return data;
}

/** Canvas ImageData 互換オブジェクトに透過を適用 */
export function applyPortraitTransparency(imageData, options = {}) {
  floodFillTransparent(imageData.data, imageData.width, imageData.height, options);
  return imageData;
}

/** ブラウザ: data URL → 透過済み PNG data URL */
export function transparentizeDataUrl(dataUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      applyPortraitTransparency(imageData, options);
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = dataUrl;
  });
}