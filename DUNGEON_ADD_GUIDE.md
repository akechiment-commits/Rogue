# ダンジョン・フロア追加マニュアル

## 1. ダンジョン種別とフロア種別を分ける

- ダンジョン種別は `beginner`、`intermediate`、`advanced`、`legend`、`debug` などのルールセット。
- フロア種別は通常、ビッグルーム、特殊フロア、ボス、チュートリアルなどの生成レイアウト。
- `SPEC.md` のダンジョン種別、特殊フロア、階層制限を先に更新する。

## 2. 生成の基本

`dungeon.js` の生成関数は、次を一緒に返す構造を基本にする。

- `map`
- `rooms`
- `monsters`
- `items`
- `traps`
- `springs`
- `bigboxes`
- `pentacles`、`statues`、`vents` などの床ギミック
- `stairUp`、`stairDown`、`visible`、`explored`

配置は `floorObjectPlacement.js` の占有ルールに合わせ、敵・アイテム・罠・泉・大箱・階段の重なりを防ぐ。

## 3. 出現ルール

- 階層、ダンジョン種別、上級以上限定、チュートリアル除外を決める。
- `pickMonsterDef()`、`buildUniPool()`、`pickLootFromPool()`、`pickTrap()` の対象を確認する。
- 水中敵、ボス、固定敵、ペナルティ専用敵を通常抽選へ混ぜない。
- 店、壁埋まり、隠し部屋、宝物庫、モンスターハウス、行商人など後段の追加生成も確認する。

## 4. プレイヤーが入った後の処理

- 階段の移動、落とし穴、ポータル、フロア保存・復帰。
- 不在フロアの巡回と待ち伏せ (`floorAbsence.js`)。
- 初回表示、FOV、簡易マップ、フロア一覧。
- ボスフロアの起床、固定取り巻き、クリア条件。
- 新しい状態を追加した場合の `GameSave.js` の保存・復元。

## 5. テスト

- 生成結果が連結し、階段へ到達できる。
- 予定した数と範囲で敵・アイテム・罠・床ギミックが生成される。
- 特殊フロア、店、ボス、デバッグ、旧セーブが壊れない。
- 何度生成しても占有違反・範囲外・未定義タイルが出ない。

参考テスト: `tests/dungeon.test.js`、`tests/floorMap.test.js`、`tests/monsterSpawnRules.test.js`、`tests/floorObjectPlacement.test.js`、`tests/floorAbsence.test.js`。
