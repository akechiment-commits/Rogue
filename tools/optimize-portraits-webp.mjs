import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { collectPortraitFiles, mergePortraitCategories } from "../portraitCatalog.js";

const root = process.cwd();
const sourceDir = path.join(root, "tiles", "Character");
const outputDir = path.join(root, "tiles", "CharacterOptimized");
const extraSlotsPath = path.join(root, "portrait-extra-slots.json");
const extraSlots = fs.existsSync(extraSlotsPath)
  ? JSON.parse(fs.readFileSync(extraSlotsPath, "utf8")).slots || []
  : [];
const portraitFiles = collectPortraitFiles(mergePortraitCategories(extraSlots));

fs.mkdirSync(outputDir, { recursive: true });

let sourceBytes = 0;
let outputBytes = 0;
for (const name of portraitFiles) {
  const sourcePath = path.join(sourceDir, `${name}.png`);
  const outputPath = path.join(outputDir, `${name}.webp`);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source portrait: ${sourcePath}`);
  }

  execFileSync("magick", [
    sourcePath,
    "-quality", "90",
    "-define", "webp:alpha-quality=100",
    outputPath,
  ], { stdio: "inherit" });

  sourceBytes += fs.statSync(sourcePath).size;
  outputBytes += fs.statSync(outputPath).size;
}

const reduction = sourceBytes ? ((1 - outputBytes / sourceBytes) * 100).toFixed(1) : "0.0";
console.log(
  `Optimized ${portraitFiles.size} portraits: ${(sourceBytes / 1024 / 1024).toFixed(2)} MB -> ` +
    `${(outputBytes / 1024 / 1024).toFixed(2)} MB (${reduction}% smaller).`,
);
