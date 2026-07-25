/** 後方互換用。容量を抑える Python 版の一括処理を呼び出す。 */
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(scriptDir, "portrait-transparent-batch.py");
const python = process.platform === "win32" ? "python" : "python3";
const result = spawnSync(python, [script], {
  cwd: process.cwd(),
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
