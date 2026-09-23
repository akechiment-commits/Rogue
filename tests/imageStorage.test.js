import { describe, it, expect, beforeEach, vi } from "vitest";
import { saveImage, loadImage, deleteImage, listImageKeys } from "../imageStorage.js";

describe("imageStorage", () => {
  beforeEach(() => {
    // LocalStorage のモック
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (i) => Array.from(store.keys())[i] || null,
    };
  });

  it("LocalStorageフォールバック環境で正しく保存・取得できる", async () => {
    await saveImage("test_key", "data:image/png;base64,abc");
    const val = await loadImage("test_key");
    expect(val).toBe("data:image/png;base64,abc");
  });

  it("存在しないキーの場合は null を返す", async () => {
    const val = await loadImage("non_existent_key");
    expect(val).toBeNull();
  });

  it("削除が正しく動作する", async () => {
    await saveImage("delete_target", "data:image/png;base64,xyz");
    expect(await loadImage("delete_target")).toBe("data:image/png;base64,xyz");

    await deleteImage("delete_target");
    expect(await loadImage("delete_target")).toBeNull();
  });

  it("プレフィックス付きのキー一覧を取得できる", async () => {
    await saveImage("roguelike_tile_1", "data1");
    await saveImage("roguelike_tile_2", "data2");
    await saveImage("roguelike_portrait", "data_portrait");

    const tileKeys = await listImageKeys("roguelike_tile_");
    expect(tileKeys).toContain("roguelike_tile_1");
    expect(tileKeys).toContain("roguelike_tile_2");
    expect(tileKeys).not.toContain("roguelike_portrait");
  });
});
