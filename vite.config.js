import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { transparentizeDataUrl, transparentizeImageBuffer } from "./tools/portraitTransparencyNode.mjs";
import {
  collectPortraitFiles,
  mergePortraitCategories,
  nextVariantFile,
  PORTRAIT_CATEGORIES,
} from "./portraitCatalog.js";

const PORTRAIT_DIR = path.resolve(process.cwd(), "tiles/Character");
const EXTRA_SLOTS_PATH = path.resolve(process.cwd(), "portrait-extra-slots.json");
const SAFE_PORTRAIT_NAME = /^[a-z][a-z0-9_]*$/;

function readExtraSlots() {
  if (!fs.existsSync(EXTRA_SLOTS_PATH)) return { slots: [] };
  return JSON.parse(fs.readFileSync(EXTRA_SLOTS_PATH, "utf8"));
}

function writeExtraSlots(data) {
  fs.writeFileSync(EXTRA_SLOTS_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch { reject(new Error("invalid json")); }
    });
    req.on("error", reject);
  });
}

function portraitApiPlugin() {
  return {
    name: "portrait-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || "").split("?")[0];

        if (url === "/api/portraits/list" && req.method === "GET") {
          fs.mkdirSync(PORTRAIT_DIR, { recursive: true });
          const files = fs.readdirSync(PORTRAIT_DIR)
            .filter((f) => f.endsWith(".png"))
            .map((f) => f.slice(0, -4));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ files }));
          return;
        }

        if (url === "/api/portraits/save" && req.method === "POST") {
          try {
            const body = await readJsonBody(req);
            const file = body.file;
            const dataUrl = body.dataUrl;
            if (!file || !SAFE_PORTRAIT_NAME.test(file)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "無効なファイル名です" }));
              return;
            }
            const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/i.exec(dataUrl || "");
            if (!m) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "画像データが不正です" }));
              return;
            }
            const buf = await transparentizeDataUrl(dataUrl);
            fs.mkdirSync(PORTRAIT_DIR, { recursive: true });
            const outPath = path.join(PORTRAIT_DIR, `${file}.png`);
            if (!outPath.startsWith(PORTRAIT_DIR)) throw new Error("invalid path");
            fs.writeFileSync(outPath, buf);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, path: `tiles/Character/${file}.png` }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        if (url === "/api/portraits/extra-slots" && req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(readExtraSlots()));
          return;
        }

        if (url === "/api/portraits/extra-slots/add" && req.method === "POST") {
          try {
            const body = await readJsonBody(req);
            const { categoryId, afterFile } = body;
            if (!categoryId || !afterFile) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "categoryId と afterFile が必要です" }));
              return;
            }
            const catDef = PORTRAIT_CATEGORIES.find((c) => c.id === categoryId);
            if (!catDef) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "無効なカテゴリです" }));
              return;
            }
            const data = readExtraSlots();
            const merged = mergePortraitCategories(data.slots);
            const cat = merged.find((c) => c.id === categoryId);
            const afterSlot = cat?.slots.find((s) => s.file === afterFile);
            if (!afterSlot) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "基準スロットが見つかりません" }));
              return;
            }
            const allFiles = collectPortraitFiles(merged);
            const file = nextVariantFile(afterFile, allFiles);
            const n = file.match(/_(\d+)$/)?.[1] ?? "2";
            const baseLabel = afterSlot.label.replace(/ \d+$/, "");
            const label = body.label || `${baseLabel} ${n}`;
            const group = afterSlot.group ?? catDef.group ?? undefined;
            const entry = { file, label, categoryId, afterFile };
            if (group) entry.group = group;
            if (afterSlot.armorVariantOf) entry.armorVariantOf = afterSlot.armorVariantOf;
            data.slots.push(entry);
            writeExtraSlots(data);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, slot: entry }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        if (url === "/api/portraits/extra-slots/remove" && req.method === "POST") {
          try {
            const body = await readJsonBody(req);
            const { file, deleteImage } = body;
            if (!file || !SAFE_PORTRAIT_NAME.test(file)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "無効なファイル名です" }));
              return;
            }
            const data = readExtraSlots();
            const idx = data.slots.findIndex((s) => s.file === file);
            if (idx < 0) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "追加スロットではないため削除できません" }));
              return;
            }
            data.slots.splice(idx, 1);
            writeExtraSlots(data);
            if (deleteImage) {
              const outPath = path.join(PORTRAIT_DIR, `${file}.png`);
              if (outPath.startsWith(PORTRAIT_DIR) && fs.existsSync(outPath)) fs.unlinkSync(outPath);
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        if (url === "/api/portraits/transparentize-all" && req.method === "POST") {
          try {
            fs.mkdirSync(PORTRAIT_DIR, { recursive: true });
            const files = fs.readdirSync(PORTRAIT_DIR).filter((f) => f.endsWith(".png"));
            let count = 0;
            let skipped = 0;
            for (const file of files) {
              const full = path.join(PORTRAIT_DIR, file);
              const input = fs.readFileSync(full);
              const out = await transparentizeImageBuffer(input);
              if (out.equals(input)) {
                skipped++;
                continue;
              }
              fs.writeFileSync(full, out);
              count++;
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, count, processed: count, skipped }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        if (url === "/api/portraits/delete" && req.method === "POST") {
          try {
            const body = await readJsonBody(req);
            const file = body.file;
            if (!file || !SAFE_PORTRAIT_NAME.test(file)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "無効なファイル名です" }));
              return;
            }
            const outPath = path.join(PORTRAIT_DIR, `${file}.png`);
            if (outPath.startsWith(PORTRAIT_DIR) && fs.existsSync(outPath)) fs.unlinkSync(outPath);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        next();
      });
    },
  };
}

function serveRootTilesPlugin() {
  const TILES_ROOT = path.resolve(process.cwd(), "tiles");

  function copyDirSync(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) copyDirSync(s, d);
      else fs.copyFileSync(s, d);
    }
  }

  return {
    name: "serve-root-tiles",

    // 開発サーバー: ルートの tiles/ を /tiles/ として配信
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (!url.startsWith("/tiles/")) return next();

        // public/tiles/ に既存ファイルがあればそちら優先
        const publicPath = path.resolve(process.cwd(), "public", url.slice(1));
        if (fs.existsSync(publicPath)) return next();

        const filePath = path.resolve(process.cwd(), url.slice(1));
        // パストラバーサル防止
        if (!filePath.startsWith(process.cwd())) return next();

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mime =
            ext === ".png"
              ? "image/png"
              : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : ext === ".webp"
              ? "image/webp"
              : "application/octet-stream";
          res.setHeader("Content-Type", mime);
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    },

    // プロダクションビルド: dist/tiles/ にコピー
    closeBundle() {
      const distDir = path.resolve(process.cwd(), "dist", "tiles");
      for (const sub of ["sprites", "items", "chara_clean2", "treasure_final", "pipo", "Character"]) {
        const src = path.join(TILES_ROOT, sub);
        if (fs.existsSync(src)) copyDirSync(src, path.join(distDir, sub));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), portraitApiPlugin(), serveRootTilesPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(process.cwd(), "index.html"),
        portraitEditor: path.resolve(process.cwd(), "portrait-editor.html"),
      },
    },
  },
});
