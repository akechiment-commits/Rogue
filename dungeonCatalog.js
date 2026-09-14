import { rng } from "./utils.js";
import { RARITY_WEIGHT } from "./lootRules.js";

/* ===== BIG BOX TYPES ===== */
export const BB_TYPES = [
  { kind: "synthesis", name: "合成の大箱", cap: () => 2,          rarity: "D", weight: RARITY_WEIGHT.D, desc: "2つのアイテムを合成する。\n武器/防具同士→能力引継ぎ。杖/ペン同士→チャージ合算。\n杖+装備→異種合成で杖の能力が宿る。\n特定の組み合わせで特殊合成が発生することもある。" },
  { kind: "change",    name: "変化の大箱", cap: () => rng(2, 4),  rarity: "C", weight: RARITY_WEIGHT.C, desc: "入れたアイテムがランダムな別のアイテムに変化する。\n何に変わるかは開けるまで不明。宝石・キーアイテムは変化しない。" },
  { kind: "enhance",   name: "強化の大箱", cap: () => rng(1, 2),  rarity: "C", weight: RARITY_WEIGHT.C, desc: "武器・防具の＋値を1上げる。\n力・守り・命の指輪の＋値も増やせる。壺の容量+1。\n他のアイテムには効果がない。" },
  { kind: "satiety",   name: "満腹の大箱", cap: () => rng(2, 4),  rarity: "D", weight: RARITY_WEIGHT.D, desc: "食料のサイズを1段階大きくする。\n生→最大で超特大、調理済み→最大で爆盛り。\n食料以外には効果がない。" },
  { kind: "refill",    name: "充填の大箱", cap: () => rng(1, 3),  rarity: "D", weight: RARITY_WEIGHT.D, desc: "杖・ペン・魔法の筆の使用回数をランダムに回復する。" },
  { kind: "identify",  name: "鑑定の大箱", cap: () => rng(3, 5),  rarity: "D", weight: RARITY_WEIGHT.D, desc: "入れたアイテムを識別する。\n薬・巻物・杖の見た目名が判明し、武器・防具の呪い状態も分かる。" },
  { kind: "split",     name: "分裂の大箱", cap: () => 1,          rarity: "B", weight: RARITY_WEIGHT.B, desc: "入れたアイテムを複製する。\n＋値・矢の数は半減する。金貨・キーアイテムは分裂しない。" },
  { kind: "bless",     name: "祝福の大箱", cap: () => rng(1, 2),  rarity: "B", weight: RARITY_WEIGHT.B, desc: "入れたアイテムを祝福する。\n壺は祝福ではなく容量+1。キーアイテムには効果がない。" },
  { kind: "curse",     name: "呪いの大箱", cap: () => rng(1, 2),  rarity: "B", weight: RARITY_WEIGHT.B, desc: "入れたアイテムを呪う。\n壺は容量-1。食料は腐る。金貨・キーアイテムには効果がない。" },
  { kind: "scatter",   name: "拡散の大箱", cap: () => rng(3, 6),  rarity: "C", weight: RARITY_WEIGHT.C, desc: "入れたアイテムを部屋内の全員に投げつけ消滅させる。\n薬・杖・壺・矢は各種効果発動。使うたびに容量が減る。" },
  { kind: "trash",     name: "ゴミ箱",     cap: () => rng(5, 10), rarity: "C", weight: RARITY_WEIGHT.C, desc: "入れたアイテムが消滅する。使うたびに容量が減り壊れる。" },
  { kind: "reverse",   name: "反転の大箱", cap: () => rng(2, 4),  rarity: "C", weight: RARITY_WEIGHT.C, desc: "入れたアイテムの祝福と呪いを反転する。未祝呪は変わらない。" },
  { kind: "greed",     name: "換金の大箱", cap: () => rng(3, 6),  rarity: "C", weight: RARITY_WEIGHT.C, desc: "入れたアイテムが売値相当の金貨になる。壊すと金貨が飛び出す。キーアイテムには効果がない。" },
  { kind: "nitro",     name: "ニトロ箱",   cap: () => 1,          rarity: "C", weight: RARITY_WEIGHT.C, desc: "道具が入ると中身が消滅し、半径2マスに即爆発する。" },
  { kind: "monster",   name: "魔物の大箱", cap: () => rng(2, 4),  rarity: "C", weight: RARITY_WEIGHT.C, desc: "入れている間は何も起こらない。壊れると中身がすべて敵になる。" },
];

/* ===== TRAPS ===== */
/* rarity/weight はアイテムと同じ対応（E:12 D:8 C:4 B:2 A:1）。生成は pickTrap() で weight 抽選。 */
export const TRAPS = [
  /* E: よく出る基本罠 */
  { name:"矢の罠",         effect:"arrow_trap",    tile:26,  rarity:"E", weight:12, desc:"踏むと、そのときの正面方向から矢が飛んでくる。\nダメージは小さいが序盤は注意。矢が落ちる。\n踏む以外で壊れると矢が数本散らばる。" },
  { name:"睡眠ガスの罠",   effect:"sleep",         tile:30,  rarity:"E", weight:12, desc:"踏むと6ターン眠る。" },
  { name:"鈍足の罠",       effect:"slow_trap",     tile:47,  rarity:"C", weight:4,  desc:"踏むと10ターン鈍足になる(速度半減)。" },
  { name:"空腹の罠",       effect:"hunger_trap",   tile:50,  rarity:"E", weight:12, desc:"踏むと満腹度が最大の10%減少する。" },
  { name:"MP吸収の罠",     effect:"mp_absorb_trap", tile:120, rarity:"C", weight:4,  desc:"踏むとMPが5減る。\nモンスターが踏むと封印状態になる（特技使用不可）。" },
  { name:"混乱の罠",       effect:"confuse_trap",   tile:127, rarity:"E", weight:12, desc:"踏むと10ターン混乱する。\n敵が踏むと20ターン混乱する。耐混乱の防具で防げる。" },
  /* D: やや多い */
  { name:"毒矢の罠",       effect:"poison_arrow",  tile:45,  rarity:"D", weight:8,  desc:"踏むと、そのときの正面方向から毒矢が飛んでくる。\nダメージ+毒状態。\n踏む以外で壊れると毒矢が数本散らばる。" },
  { name:"強矢の罠",       effect:"strong_arrow",  tile:121, rarity:"D", weight:8,  desc:"踏むと、そのときの正面方向から強矢が飛んでくる。\n通常の矢よりダメージが大きい。\n踏む以外で壊れると強矢が数本散らばる。" },
  { name:"錆の罠",         effect:"rust",          tile:28,  rarity:"D", weight:8,  desc:"踏むと装備中の武器or防具の＋値が-1される。\n金属製装備が対象。" },
  { name:"回転板",         effect:"spin",          tile:29,  rarity:"D", weight:8,  desc:"踏むとランダムな場所に吹き飛ばされる。\n飛んだ先の罠も発動する。" },
  { name:"落石の罠",       effect:"rockfall",      tile:72,  rarity:"D", weight:8,  desc:"踏むと岩が降ってきて15～25ダメージ。\n対象がいなければ石が落ちる（罠マスには重ならず近くに転がる）。\n踏む以外で壊れると石が数個散らばる。" },
  { name:"吹き飛ばしの罠", effect:"blowback_trap", tile:51,  rarity:"D", weight:8,  desc:"踏むと向いていた方向と逆に最大10マス吹き飛ぶ。\n壁に激突すると10ダメージ。敵に当たると5ダメージ。" },
  { name:"暗闇の罠",       effect:"darkness_trap", tile:85,  rarity:"D", weight:8,  desc:"踏むと20ターン暗闇状態。\n視界が1マスになる。" },
  { name:"油まみれの罠",   effect:"oil_trap",       tile:123, rarity:"D", weight:8,  desc:"踏むと油まみれになる（プレイヤー50ターン／敵100ターン）。\n炎・爆発ダメージが2倍。敵が踏んでも同様（ボス・店主も有効）。" },
  { name:"浮遊の罠",       effect:"float_trap",     tile:122, rarity:"D", weight:8,  desc:"踏むと30ターン浮遊する。\n罠にかからなくなるが、階段を降りられなくなる。\n敵が踏んでも浮遊する（ボス・店主も有効）。" },
  /* C: ややレア */
  { name:"落とし穴",       effect:"pitfall",       tile:27,  rarity:"C", weight:4,  desc:"踏むと次のフロアに落ちる。\nアイテムも一緒に落ちる。" },
  { name:"召喚の罠",       effect:"summon_trap",   tile:46,  rarity:"C", weight:4,  desc:"踏むと周囲に2～4体の敵が出現する。\n出現した敵は即座にこちらを認識している。" },
  { name:"封印の罠",       effect:"seal_trap",     tile:48,  rarity:"C", weight:4,  desc:"踏むと50ターン魔法が封印される。\n巻物・魔法・杖が使えなくなる。" },
  { name:"盗みの罠",       effect:"steal_trap",    tile:49,  rarity:"C", weight:4,  desc:"踏むと所持品が1つランダムにフロアのどこかへ飛ばされる。\nアイテムで起動した場合もそのアイテムが飛ばされる。\nロングソードは10%でソボロ助広に変化する。\nキーアイテムは盗まれない。" },
  { name:"影ぬいの罠",     effect:"shadow_stitch", tile:71,  rarity:"E", weight:12, desc:"踏むと5ターン移動不能になる。\n攻撃やアイテム使用は可能。" },
  { name:"惑わしの罠",     effect:"bewitch_trap",  tile:84,  rarity:"C", weight:4,  desc:"踏むと50ターン幻惑状態。\n周囲の見た目と、見渡すで得られる情報が狂う。" },
  { name:"腐敗の罠",       effect:"rot_trap",      tile:94,  rarity:"C", weight:4,  desc:"踏むと所持品の食料が1つランダムに腐る。敵が踏むと通常敵は食料に変わり、ボスは現在HPの1/4ダメージを受ける。\n腐った食料は満腹回復が0.4倍に。" },
  { name:"鳴動の罠",       effect:"alarm_trap",     tile:125, rarity:"C", weight:4,  desc:"踏むとフロア中の敵が一斉に気づく。\nダメージはないが危険。敵が踏んでも警報が鳴る。" },
  /* B: レア（危険） */
  { name:"地雷",           effect:"explode",       tile:25,  rarity:"C", weight:4,  desc:"踏むと周囲8マスが大爆発（敵ターン後）。敵は即死、プレイヤーはHP半減（耐火で軽減）。\n壁・罠・大箱・床のアイテムも破壊される。爆発範囲内の地雷・時限爆弾は、爆発の種類によらず誘爆する。" },
  { name:"時限爆弾の罠",   effect:"time_bomb",     tile:73,  rarity:"B", weight:2,  desc:"踏むと4ターン後に大爆発が起きる。\n爆発は地雷と同じ威力。爆発範囲内の地雷・時限爆弾は、爆発の種類によらず誘爆する。離れれば回避できる。\n作動済みの爆心地に薬液をかけると消火可能。\n作動済みは爆心地にカウントダウン表示。" },
  { name:"未識別の罠",     effect:"unident_trap",   tile:124, rarity:"B", weight:2,  desc:"踏むと、識別していた所持品・装備のうち1つがランダムで未識別に戻る。\n武器・防具・食料は祝呪がわからなくなる。\n落ちたアイテムで作動すると、そのアイテムが未識別になる。\n敵が踏むと20ターン混乱する。" },
  { name:"増殖の罠",       effect:"multiply_trap",  tile:126, rarity:"B", weight:2,  desc:"踏むと、同じ部屋の敵がそれぞれ1体ずつ分裂する。\nボス・店主には無効。作動後の破損率50%。" },
  { name:"水鉄砲の罠",     effect:"watergun_trap",  tile:132, rarity:"C", weight:4,  desc:"踏むと水鉄砲を浴びる。ずぶ濡れになり、所持品に水の影響が出る。\n巻物・魔法書は白紙化、食料はサイズ1段階縮小、ペンはインク-1。\nアーマーガッパ（耐水）で防げる。" },
  { name:"転倒の罠",       effect:"trip_trap",      tile:133, rarity:"D", weight:8,  desc:"踏むと転んで小ダメージを受け、所持品が数個ランダムに周囲へ落ちる。\n装備中の武器・防具・指輪とキーアイテムは落ちない。\n落ちた先の罠・泉・水にも作用し、壺・薬・空き瓶は低確率で割れる。\n体幹の指輪で無効。" },
  { name:"罠の罠",         effect:"trap_trap",      tile:210, rarity:"B", weight:2,  desc:"踏むと同じフロアに大量の新しい罠ができる。\n罠の罠自体はできない。発動すると必ず壊れる。" },
  { name:"道具魔物化の罠", effect:"item_monster_trap", tile:211, rarity:"B", weight:2,  desc:"踏むと同じ部屋の床のアイテムがすべてモンスターに変わる。\n発動すると必ず壊れる。" },
  { name:"加速の罠",       effect:"haste_trap",     tile:212, rarity:"C", weight:4,  desc:"踏むと同じ部屋の敵の速度が1段階上がる。\n敵が踏むと、同じ部屋にいれば自分の速度が上がる。\nアイテムなどで発動すると部屋内の全員が加速する。" },
  { name:"装備外しの罠",   effect:"unequip_trap",   tile:213, rarity:"C", weight:4,  desc:"踏むと装備中の武器・防具・指輪のうち1つが外れる。\n護盗の能力で防げる。\n敵が踏むと攻撃力と防御力が少し下がる（重ねがけ可）。" },
  { name:"レベルダウンの罠", effect:"level_down_trap", tile:216, rarity:"B", weight:2,  desc:"踏むとレベルが1下がる。\nレベル1では何も起こらない。\n敵が踏んでもレベルが1下がる。" },
];
