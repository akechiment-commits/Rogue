import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

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
      for (const sub of ["sprites", "items", "chara_clean2", "treasure_final", "pipo"]) {
        const src = path.join(TILES_ROOT, sub);
        if (fs.existsSync(src)) copyDirSync(src, path.join(distDir, sub));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), serveRootTilesPlugin()],
});
