import fs from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const globals = new Set(("console window document navigator location localStorage sessionStorage indexedDB Image ImageData FileReader File Blob URL URLSearchParams fetch Request Response Headers AbortController DOMException KeyboardEvent CustomEvent Event Audio AudioContext HTMLElement HTMLCanvasElement OffscreenCanvas Worker performance requestAnimationFrame cancelAnimationFrame setTimeout clearTimeout setInterval clearInterval queueMicrotask structuredClone atob btoa alert confirm prompt crypto self globalThis process Buffer __dirname __filename module exports require Object Array Number String Boolean Math Date JSON Set Map WeakSet WeakMap Promise RegExp Error TypeError RangeError ReferenceError SyntaxError AggregateError Uint8Array Uint8ClampedArray Uint16Array Uint32Array Int8Array Int16Array Int32Array Float32Array Float64Array ArrayBuffer DataView TextEncoder TextDecoder Intl Symbol BigInt Infinity NaN undefined parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI eval Function").split(" "));
globals.add("WebSocket");
const sourceFiles = execFileSync("git", ["ls-files", "*.js", "*.jsx", "*.mjs", "*.cjs"], {
  cwd: new URL("..", import.meta.url), encoding: "utf8",
}).trim().split(/\r?\n/).filter(file => !/^(tests|tiles|public|art-preview)\//.test(file));

// JSXの本番ビルドは未定義変数を検出しないため、実行経路に依存せず参照を検証する。
function unboundSelected(file, names = null) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["jsx"], allowReturnOutsideFunction: file.endsWith(".cjs") });
  const errors = [];
  const checkReference = path => {
    const name = path.node.name;
    if ((!names || names.includes(name)) && !globals.has(name) && !path.scope.hasBinding(name)) {
      errors.push(`${name}:${path.node.loc.start.line}`);
    }
  };
  traverse(ast, {
    ReferencedIdentifier: checkReference,
    AssignmentExpression(path) {
      const target = path.get("left");
      if (target.isIdentifier()) checkReference(target);
    },
    UpdateExpression(path) {
      const target = path.get("argument");
      if (target.isIdentifier()) checkReference(target);
    },
    JSXIdentifier(path) {
      if (/^[A-Z]/.test(path.node.name) &&
          ["JSXOpeningElement", "JSXClosingElement"].includes(path.parent.type) &&
          path.parent.name === path.node) checkReference(path);
    },
  });
  return errors;
}

describe("ゲームの実行経路に必要な変数参照", () => {
  it.each(sourceFiles)("全追跡ソースの読み書き・JSX参照に未定義変数がない: %s", file => {
    expect(unboundSelected(file)).toEqual([]);
  });
  it("射撃とワッカの指輪を併用した追加射撃で矢の処理を参照できる", () => {
    expect(unboundSelected("Game.jsx", ["shootArrow"])).toEqual([]);
  });
  it("階再訪と大箱の識別・祝福複製で識別／図鑑関数を参照できる", () => {
    expect(unboundSelected("Game.jsx", ["markBigboxKindIdentified"])).toEqual([]);
    expect(unboundSelected("GameModals.jsx", ["trackBigbox"])).toEqual([]);
  });
});
