import { describe, it, expect } from "vitest";
import {
  playerLabel,
  normalizePlayerName,
  applyPlayerNameToSave,
  PLAYER_NAME_MAX,
} from "../playerLabel.js";

describe("playerLabel", () => {
  it("未設定はプレイヤー", () => {
    expect(playerLabel("")).toBe("プレイヤー");
    expect(playerLabel(null)).toBe("プレイヤー");
    expect(playerLabel("  ")).toBe("プレイヤー");
  });

  it("設定済みはそのまま", () => {
    expect(playerLabel("しろがね")).toBe("しろがね");
  });
});

describe("normalizePlayerName", () => {
  it("前後空白を除去する", () => {
    const r = normalizePlayerName("  しろがね  ");
    expect(r.ok).toBe(true);
    expect(r.name).toBe("しろがね");
  });

  it("空は拒否", () => {
    expect(normalizePlayerName("").ok).toBe(false);
    expect(normalizePlayerName("   ").ok).toBe(false);
  });

  it("最大文字数を超えると拒否", () => {
    const long = "あ".repeat(PLAYER_NAME_MAX + 1);
    expect(normalizePlayerName(long).ok).toBe(false);
  });

  it("ちょうど最大文字数はOK", () => {
    const ok = "あ".repeat(PLAYER_NAME_MAX);
    expect(normalizePlayerName(ok).ok).toBe(true);
  });
});

describe("applyPlayerNameToSave", () => {
  it("名前と playerId を付与する", () => {
    const r = applyPlayerNameToSave({ hubGold: 10, playerId: "" }, "テスト");
    expect(r.ok).toBe(true);
    expect(r.save.playerName).toBe("テスト");
    expect(r.save.playerId).toMatch(/\S/);
    expect(r.save.hubGold).toBe(10);
  });

  it("既存 playerId は維持する", () => {
    const r = applyPlayerNameToSave(
      { playerId: "fixed-id", playerName: "" },
      "改名",
    );
    expect(r.ok).toBe(true);
    expect(r.save.playerId).toBe("fixed-id");
    expect(r.save.playerName).toBe("改名");
  });
});
