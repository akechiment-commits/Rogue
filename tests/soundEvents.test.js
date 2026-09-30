import { describe, it, expect, vi, afterEach } from "vitest";
import { soundEngine } from "../soundEngine.js";
import { updateDungeonBgm, processActionMessages, createMessageSoundObserver } from "../soundEvents.js";
import { applyMessageUpdate } from "../messageLog.js";
import { genDungeon, triggerMonsterHouse } from "../dungeon.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";
afterEach(() => vi.restoreAllMocks());
describe("ゲーム状態とBGM", () => {
  it("実際に生成した深層階でplayer.depthから深層BGMを選ぶ", () => {
    const play = vi.spyOn(soundEngine, "playBGM").mockImplementation(() => {});
    updateDungeonBgm({ player: makePlayer({ depth: 21 }), dungeon: genDungeon(20, "advanced"), maxDepth: 30 });
    expect(play.mock.calls.at(-1)[0].name).toBe("dungeon_deep");
  });
  it("店のroom記録を使って入店・退店に追従する", () => {
    const play = vi.spyOn(soundEngine, "playBGM").mockImplementation(() => {});
    const state = { player: makePlayer(), dungeon: makeEmptyDg({ shops: [{ room: { x: 4, y: 4, w: 5, h: 5 } }] }) };
    updateDungeonBgm(state);
    expect(play.mock.calls.at(-1)[0].name).toBe("shop");
    state.player.x = 20;
    updateDungeonBgm(state);
    expect(play.mock.calls.at(-1)[0].name).toBe("dungeon_shallow");
  });
  it("ハウス発動で切り替わり、参加敵の全滅後は戻る。感知だけでは切り替わらない", () => {
    const play = vi.spyOn(soundEngine, "playBGM").mockImplementation(() => {});
    const player = makePlayer();
    const dg = makeEmptyDg({ monsterSenseActive: true, monsterHouseRoom: { x: 4, y: 4, w: 5, h: 5 }, monsters: [{ hp: 20, dormantHouse: true }] });
    updateDungeonBgm({ player, dungeon: dg });
    expect(play.mock.calls.at(-1)[0].name).toBe("dungeon_shallow");
    triggerMonsterHouse(dg, player, []);
    updateDungeonBgm({ player, dungeon: dg });
    expect(play.mock.calls.at(-1)[0].name).toBe("monster_house");
    dg.monsters[0].hp = 0;
    updateDungeonBgm({ player, dungeon: dg });
    expect(play.mock.calls.at(-1)[0].name).toBe("dungeon_shallow");
  });
  it("UIのクリア・死亡状態を反映する", () => {
    const play = vi.spyOn(soundEngine, "playBGM").mockImplementation(() => {});
    const state = { player: makePlayer(), dungeon: makeEmptyDg() };
    updateDungeonBgm(state, { gameClear: true });
    expect(play.mock.calls.at(-1)[0].name).toBe("gameclear");
    updateDungeonBgm(state, { gameOver: true });
    expect(play.mock.calls.at(-1)[0].name).toBe("gameover");
  });
});

describe("共通ログからの効果音", () => {
  it("アイテム使用のオブジェクト形式ログにも対応し、同じ描画では二重再生しない", () => {
    const play = vi.spyOn(soundEngine, "playSE").mockImplementation(() => {});
    const history = [{ text: "冒険が始まった！", turn: 0 }];
    const observe = createMessageSoundObserver(history);
    const next = applyMessageUpdate(history, rows => [...rows, "回復薬を飲んだ。HPが回復した！"], 1);
    observe(next);
    observe(next);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("useItem");
  });
  it("セーブの履歴復元では再生せず、同じ文章でも次の行動は再生する", () => {
    const play = vi.spyOn(soundEngine, "playSE").mockImplementation(() => {});
    const history = [{ text: "回復薬を飲んだ。", turn: 1 }];
    const observe = createMessageSoundObserver();
    observe(history, { reset: true });
    observe(history);
    expect(play).not.toHaveBeenCalled();
    observe([...history, { text: "回復薬を飲んだ。", turn: 2 }]);
    expect(play).toHaveBeenCalledOnce();
  });
  it("金貨の実際の拾得文言を認識し、罠を見るだけでは発動音を鳴らさない", () => {
    const play = vi.spyOn(soundEngine, "playSE").mockImplementation(() => {});
    processActionMessages([{ text: "100ゴールドを拾った！" }]);
    expect(play).toHaveBeenCalledWith("gold");
    play.mockClear();
    processActionMessages([{ text: "足元に罠がある。" }]);
    expect(play).not.toHaveBeenCalled();
  });
});
