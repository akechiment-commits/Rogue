import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { WANDS } from "../items.js";
import { altarPriestServiceTargets, altarPriestServicePrice } from "../priestServiceRules.js";
import { formatEquipmentPlusChange, formatItemChargeChange } from "../inventoryLabel.js";

const effects = [];
const refs = [];
let refCursor = 0;

vi.mock("react", async () => ({
  ...await vi.importActual("react"),
  useRef: (initial) => {
    const idx = refCursor++;
    if (!refs[idx]) refs[idx] = { current: initial };
    return refs[idx];
  },
  useEffect: (fn) => { effects.push(fn); },
}));

import * as React from "react";
import { PriestModal } from "../GameModals.jsx";

const textOf = (node) => node == null ? "" : Array.isArray(node) ? node.map(textOf).join("")
  : typeof node === "object" ? textOf(node.props?.children) : String(node);

function collectButtons(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const child of node) collectButtons(child, out);
    return out;
  }
  if (typeof node !== "object") return out;
  if (node.type === "button") out.push(node);
  collectButtons(node.props?.children, out);
  return out;
}

describe("祭壇の司祭モーダルと台詞", () => {
  beforeEach(() => {
    effects.length = 0;
    refs.length = 0;
    refCursor = 0;
    vi.stubGlobal("React", React);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("未識別杖の現在回数を隠し、識別済み杖のみ回数を表示し、選択行をスクロール追従する", () => {
    const unknownWand = { ...WANDS[0], id: "w_unknown", charges: 3, fullIdent: false, bcKnown: true };
    const knownWand = { ...WANDS[1], id: "w_known", charges: 5, fullIdent: true };
    const extraWands = Array.from({ length: 10 }, (_, idx) => ({
      ...WANDS[0],
      id: `w_extra_${idx}`,
      charges: 4,
      fullIdent: false,
    }));
    const player = makePlayer({
      gold: 50000,
      inventory: [unknownWand, knownWand, ...extraWands],
    });
    const priest = { id: "priest", isAltarPriest: true, hp: 200, state: "friendly" };
    const gs = { player, dungeon: makeEmptyDg({ monsters: [priest] }), ident: new Set(), allBcKnown: false };
    const priestRef = { current: priest };
    const actionsRef = { current: null };

    refCursor = 0;
    effects.length = 0;
    const tree = PriestModal({
      mode: "refill_wand",
      setMode: vi.fn(),
      gs,
      priestRef,
      actionsRef,
      menuSel: 11,
      setMenuSel: vi.fn(),
      onService: vi.fn(),
      mobile: false,
      dname: (item) => (item.fullIdent ? item.name : "不明な杖"),
    });

    const buttons = collectButtons(tree);
    // buttons[0] は閉じる(✕)、buttons[1] が1行目 (unknownWand)、buttons[2] が2行目 (knownWand)
    expect(textOf(buttons[1])).toContain("不明な杖　＋1回補充");
    expect(textOf(buttons[1])).not.toContain("3回");
    expect(textOf(buttons[1])).not.toContain("4回");
    expect(textOf(buttons[2])).toContain(`${knownWand.name}　現在 5回 → 6回`);

    // 行要素の ref に 11 番目（0-indexed 行）を割り当てて effect を実行し scrollIntoView を検証
    const targetButton = buttons[12]; // index 11 in rows (0-based row after close button)
    expect(typeof targetButton.ref).toBe("function");
    const scrollIntoView = vi.fn();
    targetButton.ref({ scrollIntoView });
    for (const runEffect of effects) runEffect();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("司祭の挨拶台詞が「加護を授けよう」のみになっており、補充ログも未識別回数を漏らさない", () => {
    const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
    expect(source).toContain('setMsgs((prev) => [...prev.slice(-80), "司祭：「加護を授けよう」"]);');
    expect(source).not.toContain("杖やペンの補充、装備の強化、解呪、状態異常の解除を望むか？");

    const start = source.indexOf("  const doPriestService = useCallback(");
    const end = source.indexOf("  const doMerchantBuy = useCallback(", start);
    const unknownWand = { ...WANDS[0], id: "w_unknown", charges: 3, fullIdent: false };
    const knownWand = { ...WANDS[1], id: "w_known", charges: 5, fullIdent: true };
    const player = makePlayer({ gold: 50000, inventory: [unknownWand, knownWand] });
    const priest = { id: "priest", isAltarPriest: true, hp: 200, state: "friendly" };
    const sr = { current: { player, dungeon: makeEmptyDg({ monsters: [priest] }), fakeNames: {}, ident: new Set(), nicknames: {}, allBcKnown: false } };
    const messages = [];
    const deps = {
      sr,
      priestRef: { current: priest },
      useCallback: (fn) => fn,
      altarPriestServiceTargets,
      altarPriestServicePrice,
      itemDisplayName: (item) => (item.fullIdent ? item.name : "不明な杖"),
      formatItemChargeChange,
      formatEquipmentPlusChange,
      setPlayerItemProperties: vi.fn(),
      clearStatusEffectsOnHpZero: vi.fn(),
      setMsgs: (fn) => { messages.push(...fn([])); },
      setPriestMenuSel: vi.fn(),
      setGs: vi.fn(),
    };
    const doPriestService = new Function(...Object.keys(deps), `${source.slice(start, end)}; return doPriestService;`)(...Object.values(deps));

    doPriestService("refill_wand", unknownWand);
    expect(unknownWand.charges).toBe(4);
    expect(messages.at(-1)).toContain("不明な杖の回数が1回分補充された！");
    expect(messages.at(-1)).not.toContain("3→4");

    doPriestService("refill_wand", knownWand);
    expect(knownWand.charges).toBe(6);
    expect(messages.at(-1)).toContain(`${knownWand.name}の回数が1回分補充された！(5→6回)`);
  });
});
