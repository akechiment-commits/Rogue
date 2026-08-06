/**
 * 立ち絵背景の透過処理（白・コーナー色・緑系クロマキー）
 * ブラウザ Canvas / Node canvas 双方で ImageData に適用可能。
 *
 * 1) コーナー／外周から連結した背景をフラッドフィル
 * 2) 髪の隙間・弓の弦の間など、外周に繋がらない小さな背景島を穴埋め
 *    （白防具など大きな同色領域はサイズ上限で残す）
 */

export const DEFAULT_TRANSPARENCY_OPTIONS = {
  threshold: 20,
  nearWhite: 220,
  nearBlack: 20,
  greenMin: 150,
  /**
   * 閉じた背景島を透過する最大ピクセル数。
   * 白防具が金線で細切れになると小さな島になるため、低めに抑える。
   * 髪の隙間・弦の間の小さな残りに効かせ、防具は残す。
   */
  maxHolePixels: 100,
  /** 画像面積に対する穴の上限比率（大きい立ち絵向け・控えめ） */
  maxHoleRatio: 0.0008,
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

export function isNearBlack(r, g, b, nearBlack = DEFAULT_TRANSPARENCY_OPTIONS.nearBlack) {
  return r <= nearBlack && g <= nearBlack && b <= nearBlack;
}

export function isGreenBg(r, g, b, greenMin = DEFAULT_TRANSPARENCY_OPTIONS.greenMin) {
  return g >= greenMin && g > r + 20 && g > b + 20;
}

export function isPortraitBackgroundSeed(r, g, b, a, options = {}) {
  const opts = { ...DEFAULT_TRANSPARENCY_OPTIONS, ...options };
  if (a === 0) return false;
  return isNearWhite(r, g, b, opts.nearWhite) ||
    isNearBlack(r, g, b, opts.nearBlack) ||
    isGreenBg(r, g, b, opts.greenMin);
}

/** コーナーから背景色サンプル（既に α=0 でも RGB が残っていれば採用） */
export function sampleCornerBackgroundColors(data, width, height) {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  const refs = [];
  const seen = new Set();
  for (const [cx, cy] of corners) {
    const idx = (cy * width + cx) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    if (a === 0 && r === 0 && g === 0 && b === 0) continue;
    if (a > 0 && !isPortraitBackgroundSeed(r, g, b, a)) continue;
    if (a === 0 && !isNearWhite(r, g, b, 200) && !isGreenBg(r, g, b) && !isNearBlack(r, g, b, 40)) {
      /* 透過済みコーナーの残 RGB が背景っぽくないなら無視 */
      continue;
    }
    const key = `${r >> 3},${g >> 3},${b >> 3}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ r, g, b });
  }
  return refs;
}

function isBackgroundLikePixel(r, g, b, a, refs, opts) {
  if (a < 8) return false;
  /* コーナー由来の背景色に厳密マッチ（isNearWhite 広げは白防具を細切れにして壊す） */
  if (refs.length > 0) {
    for (const ref of refs) {
      if (colorDist(r, g, b, ref.r, ref.g, ref.b) <= opts.threshold) return true;
    }
    return false;
  }
  /* コーナーサンプルが無いときだけ白・緑を候補に */
  if (isNearWhite(r, g, b, opts.nearWhite)) {
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread <= 12) return true;
  }
  if (isGreenBg(r, g, b, opts.greenMin)) return true;
  return false;
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

  const trySeed = (cx, cy) => {
    const idx = (cy * width + cx) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    if (!isPortraitBackgroundSeed(r, g, b, a, opts)) return;
    const cell = cy * width + cx;
    if (visited[cell]) return;
    visited[cell] = 1;
    queue.push({ x: cx, y: cy, refR: r, refG: g, refB: b });
  };

  /* 四隅＋外周をシード（不規則な背景切れ目対策） */
  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  let qh = 0;
  while (qh < queue.length) {
    const { x, y, refR, refG, refB } = queue[qh++];
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

/**
 * 外周に繋がらない小さな背景色の島（髪の隙間・弦の間など）を透過する。
 * 白防具のような大きな同色塊は maxHole 超で残す。
 */
export function punchEnclosedBackgroundHoles(data, width, height, options = {}) {
  const opts = { ...DEFAULT_TRANSPARENCY_OPTIONS, ...options };
  const refs = sampleCornerBackgroundColors(data, width, height);
  const maxHole = Math.max(
    opts.maxHolePixels,
    Math.floor(width * height * opts.maxHoleRatio),
  );

  const visited = new Uint8Array(width * height);
  const isBg = (x, y) => {
    const idx = (y * width + x) * 4;
    return isBackgroundLikePixel(
      data[idx],
      data[idx + 1],
      data[idx + 2],
      data[idx + 3],
      refs,
      opts,
    );
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (visited[start] || !isBg(x, y)) continue;

      const cells = [];
      let touchesEdge = false;
      const queue = [[x, y]];
      visited[start] = 1;
      let qh = 0;

      while (qh < queue.length) {
        const [cx, cy] = queue[qh++];
        cells.push(cx, cy);
        if (cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1) {
          touchesEdge = true;
        }
        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const cell = ny * width + nx;
          if (visited[cell] || !isBg(nx, ny)) continue;
          visited[cell] = 1;
          queue.push([nx, ny]);
        }
      }

      const pixelCount = cells.length / 2;
      if (touchesEdge || pixelCount > maxHole) continue;

      for (let i = 0; i < cells.length; i += 2) {
        const px = cells[i];
        const py = cells[i + 1];
        data[(py * width + px) * 4 + 3] = 0;
      }
    }
  }

  return data;
}

/** Canvas ImageData 互換オブジェクトに透過を適用 */
export function applyPortraitTransparency(imageData, options = {}) {
  floodFillTransparent(imageData.data, imageData.width, imageData.height, options);
  punchEnclosedBackgroundHoles(imageData.data, imageData.width, imageData.height, options);
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
