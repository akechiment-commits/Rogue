import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "canvas";
import { transparentizeImageBuffer } from "./portraitTransparencyNode.mjs";

function readOption(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function resolveInside(root, relativePath, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} がルート外を指しています: ${relativePath}`);
  }
  return resolved;
}

async function readImageInfo(filePath) {
  const image = await loadImage(fs.readFileSync(filePath));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, image.width, image.height).data;
  let transparentPixels = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) transparentPixels += 1;
  }
  return { width: image.width, height: image.height, transparentPixels };
}

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = path.resolve(readOption(args, "--manifest") || "tools/portrait-recovery-confirmed.json");
  const sourceRoot = path.resolve(readOption(args, "--source-root") || "tiles/Character/_brushup");
  const targetRoot = path.resolve(readOption(args, "--target-root") || "tiles/Character");
  const backupRoot = path.resolve(
    readOption(args, "--backup-root") || path.join(os.tmpdir(), `rogue-portrait-recovery-${Date.now()}`),
  );
  const apply = args.includes("--apply");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error("復旧マニフェストが空です");
  }

  const targets = new Set();
  const staged = [];
  for (const entry of manifest.entries) {
    if (!entry || typeof entry.target !== "string" || typeof entry.source !== "string") {
      throw new Error("不正な復旧エントリがあります");
    }
    if (targets.has(entry.target)) throw new Error(`対象が重複しています: ${entry.target}`);
    targets.add(entry.target);

    const sourcePath = resolveInside(sourceRoot, entry.source, "原本");
    const targetPath = resolveInside(targetRoot, entry.target, "対象");
    if (!fs.existsSync(sourcePath)) throw new Error(`原本がありません: ${sourcePath}`);
    if (!fs.existsSync(targetPath)) throw new Error(`対象がありません: ${targetPath}`);

    const [sourceInfo, targetInfo] = await Promise.all([
      readImageInfo(sourcePath),
      readImageInfo(targetPath),
    ]);
    if (sourceInfo.width !== targetInfo.width || sourceInfo.height !== targetInfo.height) {
      throw new Error(`サイズ不一致: ${entry.target} (${sourceInfo.width}x${sourceInfo.height} / ${targetInfo.width}x${targetInfo.height})`);
    }
    if (sourceInfo.transparentPixels !== 0) {
      throw new Error(`原本が既に透過済みです。安全のため停止します: ${entry.source}`);
    }

    const output = await transparentizeImageBuffer(fs.readFileSync(sourcePath));
    const outputPath = path.join(backupRoot, "staged", entry.target);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output);
    const outputInfo = await readImageInfo(outputPath);
    if (outputInfo.width !== targetInfo.width || outputInfo.height !== targetInfo.height) {
      throw new Error(`変換後のサイズ不一致: ${entry.target}`);
    }
    staged.push({ entry, sourcePath, targetPath, outputPath, sourceInfo, targetInfo, outputInfo });
  }

  fs.mkdirSync(backupRoot, { recursive: true });
  fs.writeFileSync(
    path.join(backupRoot, "manifest.json"),
    JSON.stringify({ manifestPath, sourceRoot, targetRoot, entries: manifest.entries }, null, 2),
  );

  if (!apply) {
    console.log(`検証のみ完了: ${staged.length}枚。対象ファイルは変更していません。`);
    console.log(`変換済みステージ: ${path.join(backupRoot, "staged")}`);
    return;
  }

  const backupFilesRoot = path.join(backupRoot, "before");
  for (const item of staged) {
    const backupPath = path.join(backupFilesRoot, item.entry.target);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(item.targetPath, backupPath);
  }
  for (const item of staged) {
    fs.copyFileSync(item.outputPath, item.targetPath);
  }

  console.log(`復旧完了: ${staged.length}枚`);
  console.log(`復旧前バックアップ: ${backupFilesRoot}`);
  console.log(`原本からの変換結果: ${path.join(backupRoot, "staged")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
