/**
 * tiles/Character/*.png を一括透過処理
 * 使い方: node tools/portrait-transparent-batch.mjs
 */
import fs from "fs";
import path from "path";
import { transparentizeImageBuffer } from "./portraitTransparencyNode.mjs";

const PORTRAIT_DIR = path.resolve(process.cwd(), "tiles/Character");

async function main() {
  if (!fs.existsSync(PORTRAIT_DIR)) {
    console.error("tiles/Character が見つかりません");
    process.exit(1);
  }
  const files = fs.readdirSync(PORTRAIT_DIR).filter((f) => f.endsWith(".png"));
  let done = 0;
  for (const file of files) {
    const full = path.join(PORTRAIT_DIR, file);
    const buf = fs.readFileSync(full);
    const out = await transparentizeImageBuffer(buf);
    fs.writeFileSync(full, out);
    done++;
    console.log(`  ✓ ${file}`);
  }
  console.log(`Done. ${done} files updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});