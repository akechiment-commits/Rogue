# 床ギミック追加マニュアル

対象は泉、大箱、魔方陣、石像、風穴、固定転送陣、祭壇、ガチャマシーン、次元宝物庫、偽階段など、床に置かれてアイテムとは別に管理されるもの。

## 1. 管理先を決める

| ギミック | ダンジョン状態 | 主な実装 |
|---|---|---|
| 泉 | `dg.springs` | `dungeon.js` / `Game.jsx` / `items.js` |
| 大箱 | `dg.bigboxes` | `items.js` / `Game.jsx` |
| 魔方陣 | `dg.pentacles` | `useItemActions.js` / `pentacleTurnEffects.js` |
| 石像 | `dg.statues` | `fixtures.js` / `fixtureQueries.js` |
| 風穴 | `dg.vents` | `dungeon.js` / `useGameRenderer.js` |
| ガチャ | `dg.gachaMachines` | `gachaRules.js` / `dungeon.js` / `Game.jsx` |
| 祭壇 | `dg.altars` | `fixtures.js` / `items.js` / `Game.jsx` |
| 宝物庫 | `dg.dimensionalVaults` | `dungeon.js` / `fixtures.js` |
| 固定転送 | `dg.pentacles` の `kind:"fixed_portal"` | `fixtures.js` / `monsterPortalTransit.js` |
| 偽階段 | `dg.traps` の特殊 `effect` | `fixtures.js` / `traps.js` |

既存の配列を再利用できる場合は、管理先を増やさない。新しい配列を作る場合は、セーブ・床一覧・描画・占有判定・移動・図鑑を最初に設計する。

## 2. 配置と占有

床ギミックは通常、床、敵、プレイヤー、アイテム、罠、泉、大箱、魔方陣、石像、階段などと重ならない。

- `floorObjectPlacement.js` の占有判定・空きマス選択を使う。
- `dungeon.js` の通常・特殊・ボス・デバッグ生成の各経路で配置条件を確認する。
- 石像、階段、泉、水、壁、店内、宝物庫内部などの例外を明記する。
- 場所替え、ワープ、吹き飛ばし、飛びつきで移動できるかを決める。
- 投擲物が触れた場合、収納・破壊・起動・反射のどれになるかを決める。

## 3. 操作と説明

床ギミックは次の入口を確認する。

- 上に乗ったときの表示と初遭遇ミニ解説
- 足元一覧・`Z`・調べるから開く画面
- `lookDescription.js` の説明
- `floorInventory.js` の一覧
- `Game.jsx` のキーボード・ボタン・ターン消費
- 敵や投擲物が触れたときの処理

「横から調べる」と「上に乗る」を区別するギミックでは、発見・存在認識・操作・図鑑計上を別々にテストする。

## 4. 破壊・連鎖・図鑑

- 杖・炎・氷・雷・爆発・薬・投擲物で破壊されるかを決める。
- 石像のように「壊れるが中身を出さない」「ダメージ系だけ壊す」といった分類を `fixtureQueries.js` に追加する。
- 大箱・泉・祭壇などは `trackBigbox()`、`trackTrap()`、`trackItem()` など既存の発見追跡を使う。
- 同じ個体を調べる、乗る、操作する、壊す、再配置する場合の図鑑計上を1回に固定する。
- 破壊後のアイテム・敵・罠・魔方陣・床の後始末を確認する。

## 5. セーブ・描画・ガイド

- `GameSave.js` で新しい `dg` フィールドが保存・復元されるか確認する。
- `useGameRenderer.js` と `render.js` に描画を追加し、スタイル1／2／3のフォールバックを用意する。
- `tilesetMap.js`、`TILE_NAMES`、`tileSprites.js`、`GRAPHICS_ADD_GUIDE.md` を必要に応じて更新する。
- `SPEC.md`、`generate_final_guide.js` の床ギミック表・説明を更新する。

## 6. テスト

- 配置、占有、描画、調べる、足元一覧、初遭遇解説。
- 乗る・調べる・操作する・投げ込む・壊す・ワープする。
- 敵、石像、泉、大箱、罠、魔方陣、階段との相互作用。
- セーブ・ロード、旧セーブ、同一個体の図鑑計上。

参考テスト: `tests/floorObjectPlacement.test.js`、`tests/fixtureQueries.test.js`、`tests/specialFixtures.test.js`、`tests/firstEncounterTips.test.js`、`tests/encyclopediaData.test.js`。
