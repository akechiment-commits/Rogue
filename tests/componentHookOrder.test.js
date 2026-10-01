import fs from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

// 子のコールバック内部のreturnは、コンポーネントの早期returnと区別する。
function containsReturn(node) {
  if (!node || typeof node !== "object") return false;
  if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)) return false;
  if (node.type === "ReturnStatement") return true;
  return Object.entries(node).some(([key, value]) => !["loc", "start", "end"].includes(key) &&
    (Array.isArray(value) ? value.some(containsReturn) : containsReturn(value)));
}

describe("初回描画と初期化後のフック順序", () => {
  it.each(["Game.jsx", "GameModals.jsx", "HubScreen.jsx", "SoundModal.jsx"])("早期returnの後にReact・カスタムフックを置かない: %s", file => {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
    const errors = [];
    traverse(ast, {
      Function(path) {
        const name = path.node.id?.name || path.parent.id?.name || "";
        if (!/^[A-Z]|^use[A-Z]/.test(name) || path.node.body.type !== "BlockStatement") return;
        let earlyReturn = false;
        for (const statement of path.node.body.body) {
          const calls = statement.type === "VariableDeclaration" ? statement.declarations.map(entry => entry.init) :
            statement.type === "ExpressionStatement" ? [statement.expression] : [];
          for (const call of calls) if (earlyReturn && call?.type === "CallExpression" &&
            call.callee.type === "Identifier" && /^use[A-Z]/.test(call.callee.name)) {
            errors.push(`${name}:${statement.loc.start.line}:${call.callee.name}`);
          }
          if (containsReturn(statement)) earlyReturn = true;
        }
      },
    });
    expect(errors).toEqual([]);
  });
});
