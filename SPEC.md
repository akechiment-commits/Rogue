# ローグゲーム 仕様書

> このファイルはゲームの仕様・実装の概要メモ。  
> アイテム詳細は `items.js`、敵詳細は `monsters.js`、罠詳細は `traps.js` を参照。  
> 開発ルールは `CLAUDE.md` を参照。

---

## ゲーム概要

React + Vite 製のローグライク。  
2Dキャンバス描画、ターン制、ランダム生成ダンジョン。  
モバイル・PCどちらにも対応。

### アイテム生成（レア度）

- 共通: `pickLootFromPool(pool, context)`（`items.js`）
- **レア度と weight は 1:1**（同レアは同 weight）
  | レア | weight | 目安 |
  | E | 12 | 最コモン |
  | D | 8 | |
  | C | 4 | |
  | B | 2 | |
  | A | 1 | |
  | S | 0.05 | 願い級のみ |
- 基本は `weight` 抽選。店・変化・ドロップは **運枠**（`LOOT_LUCK`）
  - shop / change: 18% で C 以上のみ weight
  - drop: 10% で D 以上のみ weight
  - floor: 運枠なし
- 敵の一般ランダムドロップ率: 特技なし・分裂 2% / 特技持ち 5%

### 床ギミック（拾えない固定物）

- 実装: `fixtures.js`（生成は `dungeon.attachFloorGimmicks`）
- **偽階段**: 罠データ。未看破時は階段タイルに見える。踏むとランダムな通常罠に化けて発動。看破・杖・薬は通常罠と同様
- **風穴**: `dg.vents`。中心±2 の 5×5 で**物理**飛び道具の進行方向を風向きに上書き（遠投中も同様）。対象: 投擲・矢・石（ワッカ含む）・ブレスなど。`stepProjectile(..., { wind: true })`。**杖・魔法弾は曲がらない**（`wind: false`）
- **石像**: `dg.statues`。**ダメージ／有害効果**（投擲・矢・杖弾・爆発など）で破壊→ややレアなアイテム＋**そのフロアの出現敵プールから1体（出現レベル+1、最大3）**。通行不可。**アイテム・罠・泉・大箱・魔方陣・油など床オブジェクトは重ならない**（`placeItemAt` は隣へ、罠生成・落とし穴等も石像マスを避ける。石像移動時は `displaceObjectsFromStatue`）。**移動で突っ込む／Z・Enterで正面調べは「石像がある。」表示のみ・ターン消費なし**（近接では壊さない）。**場所替え・テレポート・飛びつき**は壊さず効果を発揮（位置交換／石像を飛ばす／前に飛びつく）。**穴掘り・軟化**で破壊時は**アイテムのみ**（敵は出ない）。実装: `fixtures.hitStatueWithAction` / `wandEffectBreaksStatue` / `wandEffectStatueLootOnly`
- **固定転送**: `pentacles` の `kind:"fixed_portal"`。生成時ペア固定。ペンのポータルとは非接続。プレイヤー・敵・投げ物も転送。乗ってのかすれ消耗はしない（爆発・油・薬液など破壊経路は対象）

### ダメージ計算（攻撃 vs 防御）

- 実装: `utils.js` の `calcAtkDefDmg(atk, def, opts)`
- 基本: `floor(atk² / (atk + floor(def × weight)))`（従来どおり）
  - 敵→プレイヤー: `weight = 1.5`
  - プレイヤー→敵・矢など: `weight = 1`
- **防御の割合軽減（ソフト）**: その後 `× (1 - min(0.40, def/(def+80)))`
  - 例: 防15 ≈ 16%減 / 防30 ≈ 27%減 / 防80以上で最大40%減
  - 高 atk ボスでも防具差が出るが、防御だけで無敵にはならない
- 最後に乱数 ±2（一部の敵同士攻撃は ±1）

### 願い（Wish）

- 実装: `wish.js`（コア）、`WishModal`（UI）
- **泉**: 「飲む」「浸す」各約0.5%で発動。叶うと泉は必ず干上がる
- **願いの杖** (`effect: wish`): 常に1回。充填・合成で回数増加不可。生成 weight 0.05（超低確率）。振ると願いUI
- **願いの壺** (`potEffect: wish_pot`): 物を入れると願いUI。捧げた物と壺は消滅（1回限り）。生成 weight 0.05（超低確率）
- UI:
  - **直接入力**: 図鑑未登録の道具も可。拒否は全能キラー・アルテマソード・願いの杖/壺・キー類など。ゴッドスパークは可
  - **お金**: 「お金」「金」「金貨」等 → 10000〜20000G ランダム
  - **大箱**: 名前で願い可。足元優先で配置（空いていなければ DRO）
  - **道具**: 図鑑（セーブ＋今回の探索）に載った道具・大箱のみ。カテゴリ選択
  - **恩恵**: 全回復（満腹含む）／全識別／フロアを見通す／レベル+3／敵の全滅（通常撃破扱い・経験値とドロップあり／復活の魔方陣でも蘇らない）

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

> **⚠️ グラフィック設定は現在作業一時停止中**  
> タイルセット切り替えUI・透過処理・立ち絵の整備が途中。再開時はこのセクションを読んでから作業すること。

### 3種類のタイルセット

| スタイル番号 | 名称 | 概要 | 保存場所 |
|---|---|---|---|
| 1 | ASCII | テキスト文字で描画。画像不要。デフォルト | `render.js` の `TILE_RENDER` |
| 2 | DawnLike | スプライトシート形式のタイル画像 | `public/tiles/`（Vite の public として配信） |
| 3 | mon1 個別PNG | モンスター・アイテムごとに1枚ずつのPNG | `tiles/sprites/mon1/tile_${id}.png` |

スタイルは `currentTileset` ステートで管理（`Game.jsx`）。切り替えUIは **未完成**。

### スタイル3のファイル配信

`tiles/` はルートにありViteの `public/` 配下ではないため、`vite.config.js` のカスタムプラグインで配信している。  
`public/tiles/` にファイルがある場合はそちらが優先される（スタイル2と3で同じURLを共有しないよう注意）。

### バーチャルタイルID（スタイル3専用）

アイテムの外見を冒険ごとにランダム化するために使う仮想ID。  
画像は `Game.jsx` の `useEffect([currentTileset])` ブロックで mon1 選択時のみ `customTileImages[idx]` に読み込まれる。

| 範囲 | 用途 |
|---|---|
| 2001〜2009 | ペン（`tiles/items/item_r01_c01〜c09.png`） |
| 3001〜3025 | 薬（薬スプライトプール参照） |

**スタイル1/2では画像が読み込まれないため、レンダラーで必ず `customTileImages[vi]` の存在チェックをしてフォールバックすること。**

### バーチャルタイルIDを新規追加する手順

1. `Game.jsx` の `useEffect([currentTileset])` に画像読み込みを追加（mon1 専用）
2. `useGameRenderer.js` の `_spriteTile` 系ヘルパーを更新（`customTileImages[vi]` チェック必須）
3. `Game.jsx` の `init()` と resume パスにスプライトマップを追加
4. `GameSave.js` の save/load 両方に追加

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

### 再現可能な乱数

`utils.js` の `createSeededRng(seed)` は、ダンジョン生成・抽選のテストで注入する 0 以上 1 未満の乱数関数を返す。`rng` / `pick` / `shuffle` は第2または第3引数でその関数を受け取れる。ゲーム本体の乱数呼び出しは段階的にこの注入形式へ移行する。

---

## 主要ファイル構成

| ファイル | 役割 |
|---|---|
| `Game.jsx` | メインゲームロジック・状態管理 |
| `useGameRenderer.js` | キャンバス描画ループ |
| `render.js` | `drawTile()`・スタイル1描画定義・`customTileImages` |
| `dungeon.js` | ダンジョン生成ロジック |
| `items.js` | 全アイテム定義・識別・フェイク名テーブル |
| `lootRules.js` | レア度・重み付き抽選・運枠・一般ドロップ率の純粋ルール |
| `inventoryRules.js` | インベントリの種別順・名前順ソート規則 |
| `inventoryLabel.js` | インベントリの装備・識別・能力値を含む表示ラベル生成 |
| `monsters.js` | 全モンスター定義・AI |
| `traps.js` | 罠定義・発動ロジック |
| `GameSave.js` | セーブ・ロード（localStorage） |
| `GameHelpers.js` | 戦闘・アイテム使用などのヘルパー |
| `lookDescription.js` | 調べるモードのマス説明を組み立てる純粋ロジック |
| `messageLog.js` | メッセージのターン付与・履歴追加を正規化する純粋ロジック |
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
  Character/        ← プレイヤー立ち絵（81枚、状況別PNG）
public/
  tiles/            ← スタイル2（DawnLike）スプライト ※優先度高
```

---

## キャラクター立ち絵システム

> **⚠️ 透過処理が作業一時停止中**  
> threshold=20 のフラッドフィル透過を適用済みだが、一部画像でまだ背景が残っている可能性あり。  
> 再開時は `make_transparent.py` を使い、コーナー色(約R234,G229,B233)から距離20以内を透過する方針。  
> 純白エフェクト(255,255,255)はコーナーからの距離が26のため threshold=20 で保持される。

### 立ち絵ファイル（`tiles/Character/`）

81枚のPNG。場面に応じて命名：

| プレフィックス | 内容 |
|---|---|
| `stand_*` | 通常立ち・歩行・装備 |
| `battle_*` | 攻撃モーション各種（`battle_melee`＝武器近接、`battle_unarmed`＝素手、`battle_dash`＝ダッシュ） |
| `damage_*` | 被ダメージ（矢・炎・重撃など属性別） |
| `hp_*` | HP状態（満タン・中程度・瀕死・傷） |
| `action_*` | アイテム使用（薬・食料・巻物・杖・弓・投擲・壺・宝箱） |
| `reaction_*` | リアクション（レベルアップ・驚き・喜び・落ち込み） |
| `status_*` | 状態異常（毒・睡眠・金縛り・拘束＝からめ鬼捕獲・閉じ込め＝とじこめ壺・移動不能など） |
| `gameover_dead` | ゲームオーバー画面専用 |

### 立ち絵の切り替えロジック（`Game.jsx`）

- `portraitSrc` ステート＋`setPortraitSrc` で管理
- `forcePortrait(key)` ：クールタイム無視で即切り替え（被ダメージ・死亡など）
- `tryPortrait(key)` ：4秒クールタイム内は切り替えしない（歩行・瀕死表示などの頻繁な状態変化）
- 読む・食べる・装備・攻撃・壺／宝箱操作などの能動アクションはクールタイムを無視して即時切り替え。HP回復は最大HPの20%以上かつ20HP以上の大回復時だけ「回復した」を表示する
- `PORTRAIT_SETS` オブジェクトで各 key → ファイル名の配列（ランダム選択）
- 優先度：死亡 > 被ダメージ > **拘束中（`capturedBy`）は他行動より拘束立ち絵を常時優先** > レベルアップ > 状態異常 > アイテム使用 > 歩行 > 攻撃
- HP が低いと `hp_low` 系を優先（歩行時も上書き）

### サイドバーへの表示（`GameModals.jsx` の `SidebarPanel`）

- 右サイドバー背景色 `#f5f0e8`（白系で透過残りを目立たなくする力技）
- 画像幅 220%・overflow: visible（意図的にはみ出し）
- ゲームオーバー画面では `gameover_dead.png` を赤いドロップシャドウ付きで大きく表示

---

## セーブデータ

`localStorage` キー: `roguelike_dungeon_save_v1`（保存形式 v2。v1 はロード時に互換変換）
ファイル: `GameSave.js`

- 装備品はインベントリインデックスで保存
- `ident` は `Set → Array → Set` で変換
- `penSpriteMap`, `potionSpriteMap` も保存・復元される
- 直近80件のメッセージが保存される

---

## 未実装・TODO メモ

（実装したら随時ここに追記）
