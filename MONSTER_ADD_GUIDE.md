# モンスター追加マニュアル

## 1. 定義を追加する

通常モンスターは `monsters.js` の `MONS`、通常ボスは `BOSSES`、中級専用ボスは `INTERMEDIATE_BOSSES` に追加する。

```js
{
  name: "新モンスター",
  hp: 30, atk: 12, def: 4, exp: 20,
  speed: 1,
  tile: 223,
  kind: "beast",
  baseKind: "new_monster",
  monLevel: 1,
  minFloor: 10,
  maxFloor: 20,
  dungeonFloors: {
    beginner: null,
    intermediate: { min: 10, max: 12 },
    advanced: { min: 10, max: 20 },
  },
  levels: [
    { name: "新モンスターⅡ", hp: 50, atk: 20, def: 7, exp: 40 },
    { name: "新モンスターⅢ", hp: 80, atk: 30, def: 10, exp: 75 },
  ],
}
```

`baseKind` は表示名変更に耐える内部キーにする。3形態は原則として同じ `tile` を共有し、レベル差は `levels` の能力値・名前・特性で表す。

## 2. 基本フィールド

| フィールド | 内容 |
|---|---|
| `name` | Lv1の表示名 |
| `hp`, `atk`, `def`, `exp` | Lv1の基本値 |
| `speed` | 通常速度。倍速は2、3倍速は3 |
| `kind` | 獣・ドラゴン・アンデッドなどの種族 |
| `baseKind` | AI、図鑑、変化、合成などが参照する安定キー |
| `monLevel` | Lv1は1。生成時は `makeMonsterFromBase` が設定 |
| `minFloor`, `maxFloor` | 通常出現範囲 |
| `dungeonFloors` | ダンジョン種別ごとの上書き。対象外は `null` |
| `levels` | Lv2・Lv3の差分配列 |
| `tile` | 描画用タイルID |
| `maxAttacks` | 1回の行動での最大攻撃回数 |
| `float` / `wallWalker` | 浮遊／壁抜け。封印・重力との関係を確認する |
| `waterOnly` / `waterWalker` | 水中限定／水上・地上移動 |
| `flightOnly` | 浮遊中だけ自発移動。重力下では自発移動不可 |
| `subtype` | AIの機能分岐キー |
| `isBoss` | ボス即死保護・状態異常短縮などを有効化 |

既存の特性を使う場合は、似た敵の定義をコピーしてから必要な値だけ変える。新しい特性を追加する場合は、定義だけでなく `monTraits.js`、AI、封印・重力・不在巡回も確認する。

## 3. 生成とレベル継承

- 通常出現は `pickMonsterDef()` の階層・ダンジョン種別・`dungeonFloors` の条件を通る。
- 実体生成は `makeMonster()`、固定配置や石像報酬は `makeMonsterFromBase()` を使う。
- `buildMonStats()` がベース定義と `levels` を合成するため、レベル別に引き継ぎたい特性はベースへ置く。
- `penaltyOnly` は通常生成、変化の杖、石像報酬などから除外される。意図しない場合は付けない。
- 水中限定敵を追加した場合、通常の敵配置が水タイルを選べるか、`excludeWaterOnly` の扱いを確認する。

## 4. AIを追加する

単純な近接敵なら定義だけで標準AIが使える。専用行動がある場合は `monsters.js` の `_monsterAIBody()` に `baseKind` または `subtype` の分岐を追加する。

- 行動を移動フェーズと攻撃フェーズに分ける。
- 移動フェーズで特技を予約し、攻撃フェーズで実行する方式では `_rangedAttackThisTurn` など既存の予約フラグを使う。
- `turnAttacks` と `monEffectiveMaxAttacks()` を使い、封印中の攻撃回数を守る。
- `monEffectiveSpeed()`、`monEffectiveFloat()`、`monEffectiveMagicImmune()` などの共通判定を使う。
- 特技で敵・石像・アイテムへ効果を与える場合は、既存の共通処理を呼び、個別に撃破・図鑑・ドロップ処理を書かない。
- 自発移動しない敵は `isStationaryMonster()` の判定に入るか確認する。移動だけ止め、攻撃・特技を許可する場合は `flightOnly` の実装を参考にする。

水・重力・壁抜けを使う敵は、`canEnter()`、`bfsNext()`、`floorAbsence.js` の不在巡回、強制移動後の水没判定を同時に確認する。

## 5. 図鑑・説明・ドロップ

- ゲーム内の生態説明は `monsterEncyclopedia.js` の `DESCRIPTION_BY_KIND` に `baseKind` を追加する。
- 情報が不要な特別個体以外は `NO_ENCYCLOPEDIA_INFO` のままにしない。
- 図鑑カタログは通常敵の3形態、通常ボス、中級専用ボスで構成が異なる。中級専用ボスをガイドへ載せる場合は `generate_final_guide.js` の出力対象を明示的に確認する。
- 通常ドロップや専用ドロップは `items.js` の `monsterDrop()` と `lootRules.js` を通す。
- ドロップしたアイテムは個体IDを新しくし、元敵の所有状態や図鑑計上フラグを引き継がない。
- 実装の詳細は `generate_final_guide.js` の `monTraits()`、必要なら `DESCRIPTION_BY_KIND` 相当のガイド記述へ追加する。

## 6. 画像・タイル

- 3形態で画像を分けず、同じ `tile` を使うのが基本。
- スタイル3は `tiles/sprites/mon1/tile_<ID>.png`、スタイル2は `DAWNLIKE_FALLBACKS`、スタイル1は `render.js` の文字フォールバックを確認する。
- 新しいタイルIDは `tilesetMap.js` の `MONSTER_SHEET_MAP`、必要なら `TILE_NAMES` とフォールバックへ登録する。
- 画像作業の詳細は `GRAPHICS_ADD_GUIDE.md` を参照する。

## 7. テスト

最低限、次をテストする。

- `MONS`／ボス配列に存在し、レベル2・3へ特性が継承される。
- 出現階層・ダンジョン種別・除外条件が正しい。
- 隣接攻撃、遠距離攻撃、特技、封印、魔封じ、聖域。
- 水・重力・壁抜け・不在巡回・強制移動。
- 敵を倒したときの経験値、ドロップ、図鑑計上。

既存の `tests/monTraits.test.js`、`tests/waterMonsterMovement.test.js`、`tests/monsterSpawnRules.test.js`、各専用機能テストを参考にする。
