# mon1 オブジェクト／アイテム候補

スタイル3の32px表示を前提にした候補素材。既存のタイル画像や描画処理は変更していない。

## 床オブジェクト

| ファイル | 対象 |
|---|---|
| `object_stairs_down.png` | 下り階段 |
| `object_stairs_up.png` | 上り階段 |
| `object_spring.png` | 泉 |
| `object_bigbox.png` | 大箱 |
| `object_magic_circle.png` | 魔方陣 |
| `object_wind_hole.png` | 風穴 |
| `object_statue.png` | 石像 |
| `object_fixed_portal.png` | 固定転送陣 |
| `object_bones.png` | 骨（一覧表示用） |

## アイテムカテゴリ

`potion`, `scroll`, `weapon`, `armor`, `arrow`, `ring`, `wand`, `pen`, `marker`, `spellbook`, `pot`, `gem`, `gold`, `bottle` を各1枚。食料は `item_food_raw.png`（未調理）と `item_food_cooked.png`（調理済み）を別に用意。

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

アイテム／オブジェクトは128×128の透過PNG、地形タイルは128×128の不透明PNG。実際のタイルへの差し替えは行っていない。
