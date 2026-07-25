import { describe, expect, it } from "vitest";
import { appendMessages, applyMessageUpdate } from "../messageLog.js";

describe("applyMessageUpdate", () => {
  it("直接指定した文字列に現在ターンを付ける", () => {
    expect(applyMessageUpdate([], "足元に階段がある。", 12)).toEqual([
      { text: "足元に階段がある。", turn: 12 },
    ]);
  });

  it("updater では既存のターンを保ち、新しい行だけに現在ターンを付ける", () => {
    const previous = [{ text: "前の行", turn: 3 }];
    expect(applyMessageUpdate(previous, (messages) => [...messages, "新しい行"], 9)).toEqual([
      { text: "前の行", turn: 3 },
      { text: "新しい行", turn: 9 },
    ]);
  });

  it("明示された turn は変更しない", () => {
    expect(applyMessageUpdate([], { text: "復元済み", turn: 1 }, 9)).toEqual([
      { text: "復元済み", turn: 1 },
    ]);
  });
});

describe("appendMessages", () => {
  it("末尾80件を残して追加する", () => {
    const previous = Array.from({ length: 82 }, (_, index) => index);
    expect(appendMessages(previous, ["new"])).toEqual([...Array.from({ length: 80 }, (_, index) => index + 2), "new"]);
  });
});
