import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function localDependencyGraph(root) {
  const files = fs.readdirSync(root).filter((name) => name.endsWith(".js") || name.endsWith(".jsx"));
  const graph = new Map(files.map((name) => [name, new Set()]));
  const importPattern = /(?:from\s+|import\s*\()(["'])(\.\/[^"']+)\1/g;

  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of source.matchAll(importPattern)) {
      let dependency = path.basename(match[2]);
      if (!path.extname(dependency)) dependency += ".js";
      if (graph.has(dependency)) graph.get(file).add(dependency);
    }
  }
  return graph;
}

function findCycles(graph) {
  let nextIndex = 0;
  const stack = [];
  const onStack = new Set();
  const index = new Map();
  const lowLink = new Map();
  const cycles = [];

  const visit = (node) => {
    index.set(node, nextIndex);
    lowLink.set(node, nextIndex);
    nextIndex++;
    stack.push(node);
    onStack.add(node);

    for (const dependency of graph.get(node)) {
      if (!index.has(dependency)) {
        visit(dependency);
        lowLink.set(node, Math.min(lowLink.get(node), lowLink.get(dependency)));
      } else if (onStack.has(dependency)) {
        lowLink.set(node, Math.min(lowLink.get(node), index.get(dependency)));
      }
    }

    if (lowLink.get(node) !== index.get(node)) return;
    const component = [];
    let current;
    do {
      current = stack.pop();
      onStack.delete(current);
      component.push(current);
    } while (current !== node);
    if (component.length > 1) cycles.push(component.sort());
  };

  for (const node of graph.keys()) {
    if (!index.has(node)) visit(node);
  }
  return cycles;
}

describe("module dependencies", () => {
  it("ルート実装モジュールに循環依存がない", () => {
    const root = path.resolve(import.meta.dirname, "..");
    expect(findCycles(localDependencyGraph(root))).toEqual([]);
  });
});
