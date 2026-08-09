# mon1 オブジェクト／アイテム候補

スタイル3の32px表示を前提にした候補素材。選定した候補はスタイル3の実タイルへ反映している。

## 床オブジェクト

| ファイル | 対象 |
|---|---|
| `object_stairs_down.png` | 下り階段 |
| `object_stairs_up.png` | 上り階段 |
| `object_spring.png` | 泉 |
| `object_bigbox_plain.png` | 大箱（単純な木箱） |
| `object_magic_circle.png` | 魔方陣 |
| `object_wind_hole.png` | 風穴 |
| `object_statue.png` | 石像 |
| `object_fixed_portal.png` | 固定転送陣 |
| `object_bones.png` | 骨（一覧表示用） |

## アイテムカテゴリ

`potion`, `scroll`, `weapon`, `armor`, `arrow`, `ring`, `wand`, `pen`, `marker`, `spellbook`, `pot`, `gem`, `gold`, `bottle` を各1枚。食料は `item_food_raw_fruit.png`（未調理）と `item_food_cooked_plated_v3.png`（調理済み）を別に用意。杖は `item_wand_flashy.png` に更新。

## 食料の可読性改訂版

| 種類 | グラフィックの意図 |
|---|---|
| 未調理 | 生肉ではなく、赤い果実・黄色い果実・葉をまとめた「そのまま食べられる素材」 |
| 調理済み | 湯気を使わず、皿・大きな一皿料理・赤いソース・葉で「調理された食事」を明示 |

小さなゲーム内タイルでも、素材と料理のシルエットが一目で分かれるようにした改訂版。

## 今回の差し替え

| 対象 | 採用グラフィック | 変更点 |
|---|---|---|
| 調理済み食料 | `item_food_cooked_plated_v3.png` | 湯気を削除し、皿・大きな卵料理・赤いソース・葉のシルエットを優先 |
| 大箱 | `object_bigbox_plain.png` | 鍵・錠前・金具・革帯を外した、単純な木箱 |
| 杖 | `item_wand_flashy.png` | 青紫の大きな発光宝石、金の装飾、星形の魔力で派手さを明示 |

確認用シート：`food_wand_v4_preview.png`（大箱は `food_box_v3_preview.png`）

## 地形タイル候補

| ファイル | 対象 |
|---|---|
| `terrain_room_floor.png` | 部屋の床 |
| `terrain_corridor_floor.png` | 廊下の床 |
| `terrain_wall.png` | 通常の壁 |
| `terrain_outer_wall.png` | 外周の壊せない壁 |
| `terrain_breakable_wall.png` | 壊せる壁 |

確認用シート：`terrain_food_preview.png`

## 連続配置用の改訂版

前節の地形候補を、4×4で並べたときの継ぎ目と反復感を確認した改訂版。実際の候補としてはこちらを優先する。

| ファイル | 対象 |
|---|---|
| `terrain_room_floor_tileable.png` | 部屋の床 |
| `terrain_corridor_floor_tileable.png` | 廊下の床 |
| `terrain_wall_tileable.png` | 通常の壁 |
| `terrain_outer_wall_tileable.png` | 外周の壊せない壁 |
| `terrain_breakable_wall_tileable.png` | 壊せる壁 |
| `terrain_water_channel.png` | 水路／水面 |

連続配置確認用：`terrain_tileable_repeat_preview.png`

## 可読性優先改訂版

32px表示で「床」と「壁」の役割が直感的に分かれるよう、色・面の向き・模様をさらに分離した版。部屋の床は明るく平たい石床、廊下の床は不定形の敷石、通常の壁は横積みの暗いレンガ、外周壁は黒い補強プレート、壊せる壁は明るい亀裂・欠損・落石で表現している。現在の候補ではこの版を第一候補とする。

| ファイル | 対象 |
|---|---|
| `terrain_room_floor_readable.png` | 部屋の床 |
| `terrain_corridor_floor_readable.png` | 廊下の床 |
| `terrain_wall_readable.png` | 通常の壁 |
| `terrain_outer_wall_readable.png` | 外周の壊せない壁 |
| `terrain_breakable_wall_readable.png` | 壊せる壁（亀裂・欠損・落石） |

確認用シート：`terrain_readability_preview.png`、連続配置確認用：`terrain_readability_repeat_preview.png`

アイテム／オブジェクトは128×128の透過PNG、地形タイルは128×128の不透明PNG。可読性優先の地形版と、アイテム／オブジェクト候補（風穴を除く）はスタイル3の実タイルへ反映済み。風穴は向きが読める現行の矢印描画を維持している。
