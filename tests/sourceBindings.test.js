import fs from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

// JSXの本番ビルドは未定義変数を検出しないため、実行経路に依存せず参照を検証する。
function unboundSelected(file, names) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  const errors = [];
  traverse(ast, {
    ReferencedIdentifier(path) {
      if (names.includes(path.node.name) && !path.scope.hasBinding(path.node.name)) {
        errors.push(`${path.node.name}:${path.node.loc.start.line}`);
      }
    },
  });
  return errors;
}

describe("ゲームの実行経路に必要な変数参照", () => {
  it("階再訪と大箱の識別・祝福複製で識別／図鑑関数を参照できる", () => {
    expect(unboundSelected("Game.jsx", ["markBigboxKindIdentified"])).toEqual([]);
    expect(unboundSelected("GameModals.jsx", ["trackBigbox"])).toEqual([]);
  });
});
