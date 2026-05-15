# ローグゲーム 仕様書

> このファイルはゲームの仕様・実装の概要メモ。  
> アイテム詳細は `items.js`、敵詳細は `monsters.js`、罠詳細は `traps.js` を参照。  
> 開発ルールは `CLAUDE.md` を参照。

---

## ゲーム概要

React + Vite 製のローグライク。  
2Dキャンバス描画、ターン制、ランダム生成ダンジョン。  
モバイル・PCどちらにも対応。

### ダンジョン種別

| ID | 名称 | 階数 | 特記 |
|---|---|---|---|
| `tutorial` | チュートリアル | 5F | 固定構成。ローグライクの基本を学ぶ |
| `beginner` | 初心者ダンジョン | 10F | 全識別・祝呪既知 |
| `intermediate` | 中級者ダンジョン | 20F | 標準難度 |
| `advanced` | 上級者ダンジョン | 30F | 高難度 |
| `legend` | 超上級者ダンジョン | 50F | 最高難度。深淵の禁書を持ち帰るのが目標 |
| `debug` | デバッグダンジョン | 無制限 | 全アイテム・全モンスター配置。HP/MP 200 |

`beginner` では `allBcKnown = true`（祝呪・識別状態が全てわかる）。

---

## ビジュアルスタイル

→ 詳細は `CLAUDE.md` の「ビジュアルスタイルの仕組み」を参照。

| スタイル | 名称 | 保存場所 |
|---|---|---|
| 1 | ASCII（デフォルト） | `render.js` の `TILE_RENDER` |
| 2 | DawnLike | `public/tiles/` |
| 3 | mon1 個別PNG | `tiles/sprites/mon1/tile_${id}.png` |

スタイル3のみ、ペン・薬のグラフィックが冒険ごとにランダム化される。

---

## アイテムのタイルID一覧

`items.js` で `tile` プロパティに設定されている値。スタイル3の場合 `tiles/sprites/mon1/tile_${id}.png` が使われる。

| tile ID | アイテム種別 | スタイル3 画像の内容 |
|---|---|---|
| 16 | 薬（基本）| → potionSpriteMap でランダム化（3001〜3025） |
| 17 | 薬（上位）| → 同上 |
| 18 | 巻物・特殊巻物 | — |
| 19 | 食料（生） | — |
| 20 | 武器 | chip3_v2/item_r01_c05 |
| 21 | 防具 | chip3_v2/item_r04_c01 |
| 22 | 金貨 | — |
| 23 | 矢 | chip3_v2/item_r11_c01 |
| 24 | 杖 | chip3_v2/item_r10_c13 |
| 25 | 地雷（罠） | chip3_v2/item_r13_c03 |
| 26〜30, 45〜51, 71〜73, 84〜85, 94 | 各種罠（地雷以外） | tile_25.png と同じ画像 |
| 32 | 壺 | — |
| 41 | 魔法の筆（マーカー） | — |
| 42 | ペン（基本）| → penSpriteMap でランダム化（2001〜2009） |
| 43 | 魔法書 | — |
| 60 | 指輪 | chip3_v2/item_r06_c01 |
| 66 | 食料（調理済み） | — |
| 87〜92, 101〜102 | 宝石類 | — |
| 88〜102 | 宝石各種 | — |

### ペンスプライトプール（2001〜2009）

`tiles/items/item_r01_c01.png` 〜 `item_r01_c09.png`（9枚）。  
`penSpriteMap: { effect名: 1〜9 }` で管理。

### 薬スプライトプール（3001〜3025）

```
1=item_r04_c07  2=item_r04_c10  3=item_r04_c11  4=item_r04_c14
5=item_r05_c01  6=item_r05_c02  7=item_r05_c03  8=item_r05_c04
9=item_r05_c05  10=item_r05_c06 11=item_r05_c08 12=item_r05_c12 13=item_r05_c14
14=item_r03_c01 15=item_r03_c02 16=item_r03_c03 17=item_r03_c04
18=item_r03_c05 19=item_r03_c15
20=item_r04_c01 21=item_r04_c02 22=item_r04_c03 23=item_r04_c04
24=item_r04_c05 25=item_r04_c06
```

`potionSpriteMap: { effect名: 1〜25 }` で管理。

---

## アイテム種別と識別システム

### 識別が必要なアイテム

未識別時は偽名（fakeNames）で表示される。識別キー：

| 種別 | 識別キー形式 | 例 |
|---|---|---|
| 薬 | `p:${effect}` | `p:heal` |
| 巻物 | `s:${effect}` | `s:teleport` |
| 指輪 | `r:${effect}` | `r:power_ring` |
| 杖 | `w:${effect}` | `w:sleep` |

### アイテム種別一覧

| type | 説明 |
|---|---|
| `potion` | 薬。飲む・投げる効果あり |
| `scroll` | 巻物。読む効果あり |
| `weapon` | 武器。装備可能 |
| `armor` | 防具。装備可能 |
| `arrow` | 矢。99本まで束 |
| `ring` | 指輪。最大2個装備。＋値あり |
| `wand` | 杖。充填あり |
| `pen` | ペン。足元に魔方陣を描く。充填2 |
| `marker` | 魔法の筆。白紙の巻物に魔法を書ける |
| `scroll`（特殊）| 識別・複製・換金・変成など |
| `spellbook` | 魔法書。魔法を習得できる |
| `food` | 食料。満腹度回復 |
| `pot` | 壺。アイテムを入れて使う |
| `gem` | 宝石。遠方の店で高値で売れる |
| `gold` | 金貨 |
| `bottle` / `potion(water)` | 空き瓶・水 |

### 祝福・呪いシステム

- `bc: "blessed"` / `bc: "cursed"` / なし（normal）
- 祝福：効果強化、呪い：効果反転または弱体化
- 未識別の場合、祝呪も不明

---

## 罠一覧

`traps.js` で定義。tile ID 25 が地雷（特別）、それ以外は全て同じ画像（tile_25と同じ）。

| tile | effect | 名称 |
|---|---|---|
| 25 | `land_mine` | 地雷（爆発） |
| 26 | `arrow_trap` | 矢の罠 |
| 27〜30 | 各種 | 毒・炎・石化・落とし穴 等 |
| 45 | `invisible_trap` | 透明の罠 |
| 46 | `summon_trap` | 召喚の罠 |
| 47 | `slow_trap` | 鈍足の罠 |
| 48 | `seal_trap` | 封印の罠 |
| 49 | `steal_trap` | 盗みの罠 |
| 50 | `hunger_trap` | 空腹の罠 |
| 51 | `blowback_trap` | 吹き飛ばしの罠 |
| 71〜73 | 各種 | — |
| 84 | `bewitch_trap` | 惑わしの罠 |
| 85 | `darkness_trap` | 暗闇の罠 |
| 94 | `rot_trap` | 腐敗の罠 |

---

## ゲームセッションの状態構造（session / gs）

`Game.jsx` の `gs` ステートに入る主要フィールド：

```js
{
  player: { ... },          // プレイヤーデータ
  dungeon: { ... },         // 現在フロアのダンジョンデータ
  floors: { 1: dg, ... },   // 各フロアのキャッシュ
  ident: Set<string>,       // 識別済みキーのセット
  fakeNames: { ... },       // 偽名テーブル
  bbFakeNames: { ... },     // 大箱偽名テーブル
  nicknames: { ... },       // ユーザーが付けたニックネーム
  isDebugRun: bool,
  dungeonType: string,      // "beginner" 等
  maxDepth: number | null,
  allBcKnown: bool,
  floorTurns: number,
  penSpriteMap: { effect: 1〜9 },    // 冒険ごとにランダム化
  potionSpriteMap: { effect: 1〜25 }, // 冒険ごとにランダム化
}
```

---

## 主要ファイル構成

| ファイル | 役割 |
|---|---|
| `Game.jsx` | メインゲームロジック・状態管理 |
| `useGameRenderer.js` | キャンバス描画ループ |
| `render.js` | `drawTile()`・スタイル1描画定義・`customTileImages` |
| `dungeon.js` | ダンジョン生成ロジック |
| `items.js` | 全アイテム定義・識別・フェイク名テーブル |
| `monsters.js` | 全モンスター定義・AI |
| `traps.js` | 罠定義・発動ロジック |
| `GameSave.js` | セーブ・ロード（localStorage） |
| `GameHelpers.js` | 戦闘・アイテム使用などのヘルパー |
| `GameModals.jsx` | インベントリ・各種モーダルUI |
| `GameButtons.jsx` | モバイル用ボタン |
| `HubScreen.jsx` | タイトル・ダンジョン選択画面 |
| `tilesetMap.js` | スプライトシートのマッピング定義 |
| `animEvents.js` | アニメーションイベントシステム |
| `DiscoveryTracker.js` | 図鑑・発見追跡 |
| `vite.config.js` | Viteカスタムプラグイン（tiles/配信） |
| `generate_final_guide.js` | Excelガイド生成スクリプト |
| `process_items_bg.py` | アイテム画像の透過処理スクリプト |

### スプライト画像の場所

```
tiles/
  sprites/
    mon1/           ← スタイル3メインスプライト（tile_${id}.png）
  items/            ← ペン・薬のランダムグラフィックプール
  chip3_v2/         ← 武器・防具・指輪等の素材（切り出し前）
  chara_clean2/     ← キャラクタースプライト
  treasure_final/   ← 宝物スプライト
  pipo/             ← ピポスプライト
public/
  tiles/            ← スタイル2（DawnLike）スプライト ※優先度高
```

---

## セーブデータ

`localStorage` キー: `roguelike_dungeon_save_v1`  
ファイル: `GameSave.js`

- 装備品はインベントリインデックスで保存
- `ident` は `Set → Array → Set` で変換
- `penSpriteMap`, `potionSpriteMap` も保存・復元される
- 直近80件のメッセージが保存される

---

## 未実装・TODO メモ

（実装したら随時ここに追記）
