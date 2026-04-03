import XLSX from 'xlsx';
import { MONS, BOSSES } from './monsters.js';
import {
  ITEMS, WANDS, POTS, TRAPS, RINGS, BB_TYPES,
  GEM_TYPES, SPELLS, SPELLBOOKS,
  RAW_SIZES, COOKED_SIZES, FOOD_EFFECTS, FOOD_DESCS,
  POTION_FOOD_PREFIX,
  WATER_BOTTLE, BLANK_SCROLL, MAGIC_MARKER,
  CAT_CLAW_T, EXCALIBUR_T, TRIELEM_SWORD_T, TRIELEM_ARMOR_T, ALLBANE_SWORD_T, DIVINE_SHIELD_T, GODSPARKWAND_T,
  ARROW_T, POISON_ARROW_T, PIERCING_ARROW_T, STONE_T, MAGIC_STONE_T, BOMB_ARROW_T,
} from './items.js';

const wb = XLSX.utils.book_new();

function addSheet(name, data) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = Array(15).fill(null).map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}

// アイテム名 → rarity のマップを生成
const _rarityMap = new Map();
for (const it of ITEMS) _rarityMap.set(it.name, it.rarity);

// data配列の先頭行(ヘッダー)の末尾に 'rarity' を追加し、
// 各行でcol[0]が空でない場合にrarity値を末尾に追加する
function injectRarity(data) {
  data[0].push('rarity');
  for (let i = 1; i < data.length; i++) {
    const name = data[i][0];
    data[i].push(name ? (_rarityMap.get(name) ?? '') : '');
  }
  return data;
}

// ===== 目次 =====
const indexData = [
  ['ローグ - ゲーム完全実装ガイド'],
  [''],
  ['シート一覧'],
  ['01. 薬 - Potion（12種 + 水）', '飲用時のプレイヤー・モンスター両方の効果'],
  ['02. 食べ物への薬効果（11種）', '食べ物に浴びせかけた時の効果'],
  ['03. 巻物 - Scroll（18種）', '全巻物の通常・祝福・呪い時効果'],
  ['04. 武器・防具', '装備システムと呪い時の動作'],
  ['05. 指輪 - Ring（12種）', '全種類と効果'],
  ['06. 壺 - Pot（17種）', '全種類と容量・効果'],
  ['07. ペン・魔方陣 - Pen（16種）', '全種類と通常・祝福・呪い時効果'],
  ['08. マーカーペン・魔法書', '書き込み機構と習得システム'],
  ['09. 状態異常（13種）', 'プレイヤー・モンスターの状態異常一覧'],
  ['10. 罠（19種）', '全罠の効果'],
  ['11. モンスター図鑑（54種+ボス10体）', 'ゲーム内に出現する全敵（各3形態あり）'],
  ['12. 杖 - Wand（22種）', '全杖の通常・祝福・呪い時効果'],
  ['13. 食べ物（11効果種）', '食べ物の効果・サイズ・状態一覧'],
  ['14. 大箱 - BigBox（9種）', '全大箱の効果'],
  [''],
  ['データ来源'],
  ['items.js - applyPotionEffect（1818-2205行）', '薬の完全実装'],
  ['items.js - applyPotionToItem（2267-2331行）', '食べ物への薬効果'],
  ['useItemActions.js - scroll effects（655-1189行）', '巻物の完全実装'],
  ['useItemActions.js - ring/pot/spellbook/pen（1345-1752行）', 'その他アイテム・ペン'],
  ['Game.jsx', 'ペン・魔方陣のランタイム効果'],
  ['items.js - RINGS/POTS/PENS（3420+/689+/136+）', 'アイテム定義'],
  ['items.js - TRAPS（909+行）', '罠定義'],
  ['monsters.js', 'モンスター全種（332行以降）'],
];

addSheet('00_目次', indexData);

// ===== 薬（Potion）=====
const potionData = [
  ['薬の種類', '状態', 'プレイヤー効果', 'モンスター効果', 'コード行'],

  ['水', '通常', 'HP + 10 回復', 'HP + 10 回復', '1826-1850'],
  ['', '祝福', 'HP + 15 回復', 'HP + 15 回復', ''],
  ['', '呪い', 'ダメージ 7', 'ダメージ 7', ''],
  ['', '満タン時', '上昇なし（val/30=0）', '上昇なし', ''],
  ['', 'アンデッド', '-', '常に反転してダメージ', ''],

  ['回復薬', '通常', 'HP + 30 回復', 'HP + 30 回復', '1826-1850'],
  ['', '祝福', 'HP + 45 回復', 'HP + 45 回復', ''],
  ['', '呪い', 'ダメージ 21', 'ダメージ 21', ''],
  ['', '満タン時', 'HP最大値 + 1（祝福+2）', 'HP最大値 + 1（祝福+2）', ''],
  ['', 'アンデッド', '-', '常に反転してダメージ', ''],

  ['大回復薬', '通常', 'HP + 60 回復', 'HP + 60 回復', '1826-1850'],
  ['', '祝福', 'HP + 90 回復', 'HP + 90 回復', ''],
  ['', '呪い', 'ダメージ 42', 'ダメージ 42', ''],
  ['', '満タン時', 'HP最大値 + 2（祝福+4）', 'HP最大値 + 2（祝福+4）', ''],
  ['', 'アンデッド', '-', '常に反転してダメージ', ''],

  ['超回復薬', '通常', 'HP + 100 回復', 'HP + 100 回復', '1852-1875'],
  ['', '祝福', 'HP + 200 回復（2倍）', 'HP + 200 回復（2倍）', ''],
  ['', '呪い', 'ダメージ 50', 'ダメージ 50', ''],
  ['', '満タン時', 'HP最大値 + (祝福6/通常3)', 'HP最大値 + (祝福6/通常3)', ''],

  ['毒薬', '通常', '毒状態。攻撃力が低下', 'ダメージ val + rng(-3,3)。毒5ターン。攻撃力半減', '1877-1926'],
  ['', '祝福', '強毒→攻撃力3低下', 'ダメージ × 1.5。毒8ターン', ''],
  ['', '呪い', '反転→毒が治る', '反転→回復 val × 0.5（アンデッドはダメージ）', ''],
  ['', '毒消し指輪', '完全に無効化', '-', ''],

  ['炎の薬', '通常', 'ダメージ val + rng(-5,5)', 'ダメージ val + rng(-5,5)', '1928-1965'],
  ['', '祝福', 'ダメージ × 1.5（強炎）', 'ダメージ × 1.5（強炎）', ''],
  ['', '呪い', '反転→回復 val', '反転→回復 val × 0.5', ''],
  ['', '火ダルマ', '-', '常に回復（祝福含）', ''],
  ['', '油まみれ', 'ダメージ2倍', 'ダメージ2倍', ''],
  ['', '耐火防具', 'ダメージ半減', '-', ''],

  ['睡眠薬', '通常', '眠り val + rng(-1,1)（基本5）', '眠り val + rng(-1,1)ターン', '1967-1981'],
  ['', '祝福', '眠り × 2倍（10ターン）', '眠り × 2倍（強眠）', ''],
  ['', '呪い', '反転→モンスター全敵透視100ターン', '反転→覚醒', ''],

  ['鈍足の薬', '通常', '鈍足10ターン（速度×0.5）', '鈍足（速度×0.5）', '1994-2006'],
  ['', '祝福', '鈍足20ターン（速度×0.25）', '鈍足（速度×0.25）', ''],
  ['', '呪い', '反転→加速10ターン（2倍速）', '反転→加速（覚醒）', ''],
  ['', '耐鈍足防具', '無効化', '-', ''],

  ['金縛りの薬', '通常', '金縛り10ターン', '金縛り（ボス10T/他永続）', '2007-2030'],
  ['', '祝福', '金縛り20ターン＋2回アクション必要', '金縛り20T＋2回アクション必要', ''],
  ['', '呪い', '反転→状態異常防止200ターン', '反転→状態異常防止200ターン', ''],

  ['力の薬', '通常', 'ATK + val（+3）', 'ATK + val（+3）', '1983-1993'],
  ['', '祝福', 'ATK + val × 1.5', 'ATK + val × 1.5', ''],
  ['', '呪い', '反転→ATK - val × 0.5', '反転→ATK - val × 0.5', ''],

  ['混乱の薬', '通常', '混乱5ターン', '混乱20ターン', '2031-2047'],
  ['', '祝福', '混乱10ターン（強）', '混乱40ターン（強）', ''],
  ['', '呪い', '反転→混乱解除 + 必中100T', '反転→混乱解除', ''],
  ['', '耐混乱防具', '無効化', '-', ''],

  ['マナ回復薬', '通常', 'MP + val 回復', '特技使用率100%', '2048-2082'],
  ['', '祝福', 'MP + val × 1.5 回復', '特技使用率100%', ''],
  ['', '呪い', '反転→MP封印50T', '反転→永続封印（ボス20T）', ''],
  ['', '満タン時', '最大MP + (祝福2/通常1)', '-', ''],

  ['暗闇の薬', '通常', '暗闇20ターン。視界1マス', '暗闇50ターン', '2083-2110'],
  ['', '祝福', '暗闇50ターン（強）', '暗闇永続', ''],
  ['', '呪い', '反転→モンスター感知100T', '反転→暗闇解除', ''],
  ['', '耐暗闇防具', '無効化', '-', ''],

  ['惑わしの薬', '通常', '幻惑50ターン（周囲の見た目が狂う）', '幻惑50ターン。逃げ出す', '2111-2135'],
  ['', '祝福', '幻惑100ターン（強）', '幻惑永続', ''],
  ['', '呪い', '反転→フロア罠全表示', '反転→幻惑解除', ''],
  ['', '耐惑わし防具', '無効化', '-', ''],

  ['レベルアップの薬', '通常', 'レベルアップ × 1', 'レベルアップ × 1', '2136-2161'],
  ['', '祝福', 'レベルアップ × 2', 'レベルアップ × 2', ''],
  ['', '呪い', '反転→上の階へワープ', '反転→レベルダウン', ''],

  ['封印の薬', '通常', 'MP封印50ターン', '封印状態（ボス20T/他永続）', '2162-2200'],
  ['', '祝福', 'MP封印50T + 鈍足10T', '封印 + 速度 × 0.5', ''],
  ['', '呪い', '反転→MP封印解除', '反転→特技使用率100%', ''],
  ['', '耐鈍足防具', '鈍足無効化（MP封印有効）', '-', ''],
];

addSheet('01_薬', injectRarity(potionData));

// ===== 食べ物への薬効果 =====
const foodData = [['薬の種類', '通常・祝福', '呪い', '備考']];
const _seen = new Set();
for (const it of ITEMS.filter(i => i.type === 'potion')) {
  const eff = it.effect;
  if (_seen.has(eff)) continue;
  _seen.add(eff);
  const normal = POTION_FOOD_PREFIX[eff] ?? '-';
  const curse  = POTION_FOOD_PREFIX['c_' + eff] ?? normal;
  const note   = eff === 'fire' ? 'value × 2倍。既に調理済みは焦げた状態' : 'value × 0.8に減少';
  foodData.push([it.name, normal, curse, note]);
}

addSheet('02_食べ物への薬', foodData);

// ===== 巻物（Scroll）=====
const scrollData = [
  ['巻物名', '通常', '祝福', '呪い', 'コード行'],

  ['テレポートの巻物', 'ランダムTP', 'TP先選択可能', 'TP先階層選択可能', '655-680'],
  ['マップの巻物', 'フロア全体 + 罠表示', 'フロア + 罠 + アイテム + 敵表示（常時）', 'マップ記憶全消去', '681-700'],
  ['武器強化の巻物', '装備武器 +1', '装備武器 +2', '装備武器 -1（装備の呪いも同時解除）', '701-712'],
  ['防具強化の巻物', '装備防具 +1', '装備防具 +2', '装備防具 -1（装備の呪いも同時解除）', '713-724'],
  ['雷の巻物', '視界内敵 rng(30,40)ダメージ', 'フロア全敵 rng(30,40)ダメージ', '視界内敵 rng(30,40)ダメージ + 自分にも rng(30,40)ダメージ', '725-767'],
  ['回復の巻物', '自分と視界内全員がHP+50回復', '自分と視界内全員がHP+100回復', '自分含め視界内全員に35ダメージ', '768-812'],
  ['道具寄せの巻物', 'アイテムを隣接8マスに集める', 'インベントリに直接吸収', 'アイテムをランダム配置', '813-893'],
  ['眠りの巻物', '視界内敵6ターン眠り', 'フロア全敵12ターン眠り', '自分含め視界内全員6ターン眠り', '894-920'],
  ['混乱の巻物', '視界内敵20ターン混乱', 'フロア全敵40ターン混乱', '自分5ターン混乱 + 視界内敵10ターン混乱', '921-943'],
  ['炎の巻物', '視界内敵 rng(30,40)ダメージ（油まみれ×2）', 'フロア全敵 rng(30,40)ダメージ', '視界内敵 rng(30,40) + 自分にも rng(30,40)ダメージ', '944-975'],
  ['強化解除の巻物', '視界内敵バフ解除（攻撃バフ/激昂/加速）', '視界内敵バフ解除 + ATK-rng(2,4)/DEF-rng(1,3)永続低下', '自分の武器と防具両方 -1', '976-1010'],
  ['壁崩しの巻物', '半径5マスの壁を壊す', '半径10マスの壁を壊す', '周囲8マスの床を壁に変える', '1011-1035'],
  ['金縛りの巻物', '周囲1マスの敵を金縛り', '視界内敵を金縛り', 'プレイヤーが20ターン金縛り', '1035-1060'],
  ['識別の巻物', 'アイテム1つ識別', 'インベントリ全識別', '識別済みアイテムを未識別に戻す', '1061-1102'],
  ['複製の巻物', 'アイテム1つ複製', 'アイテム1つ複製（祝福でも1個）', 'アイテム削除', '1103-1109'],
  ['召喚の巻物', '4体の敵を召喚', '8体の敵を召喚（aware=true）', '同じ部屋の敵を別の部屋に飛ばす', '1110-1141'],
  ['罠の巻物', 'rng(8,15)個の罠を配置', 'rng(15,25)個の罠を配置', 'フロアの罠を全削除', '1142-1165'],
  ['収納上手の巻物', '最大所持数 + rng(1,3)', '最大所持数 + rng(2,6)', '最大所持数 - rng(1,3)', '1166-1189'],
  ['白紙の巻物', 'マーカーペンで書き込み対象', 'マーカーペンで書き込み対象', 'マーカーペンで書き込み対象', '1651-1656'],
];

addSheet('03_巻物', injectRarity(scrollData));

// ===== 武器・防具 =====
const _weapons = ITEMS.filter(i => i.type === 'weapon');
const _armors  = ITEMS.filter(i => i.type === 'armor');
const _specialWeapons = [CAT_CLAW_T, EXCALIBUR_T, TRIELEM_SWORD_T, ALLBANE_SWORD_T];
const _specialArmors  = [TRIELEM_ARMOR_T, DIVINE_SHIELD_T];

const weaponArmorData = [['種類', 'ATK/DEF', 'ability', 'rarity', 'sellPrice', '説明']];
weaponArmorData.push(['【武器】装備時に呪いあり→外せない。+値で攻撃力上昇', '', '', '', '', '']);
for (const w of _weapons) {
  weaponArmorData.push([w.name, w.atk, w.ability ?? '-', w.rarity, w.sellPrice, w.desc]);
}
weaponArmorData.push(['【武器・合成限定】', '', '', '', '', '']);
for (const w of _specialWeapons) {
  weaponArmorData.push([w.name, w.atk, (w.abilities ?? [w.ability]).join('/'), '合成', '-', w.desc]);
}
weaponArmorData.push(['【防具】装備時に呪いあり→外せない。+値で防御力上昇', '', '', '', '', '']);
for (const a of _armors) {
  weaponArmorData.push([a.name, a.def, a.ability ?? '-', a.rarity, a.sellPrice, a.desc]);
}
weaponArmorData.push(['【防具・合成限定】', '', '', '', '', '']);
for (const a of _specialArmors) {
  weaponArmorData.push([a.name, a.def, (a.abilities ?? [a.ability]).join('/'), '合成', '-', a.desc]);
}

addSheet('04_武器防具', weaponArmorData);

// ===== 指輪（Ring）=====
const ringData = [['指輪名', 'effect', 'rarity', 'sellPrice', '説明']];
for (const r of RINGS) {
  ringData.push([r.name, r.effect, r.rarity, r.sellPrice, r.desc]);
}

addSheet('05_指輪', ringData);

// ===== 壺（Pot）=====
const potData = [['壺名', 'potEffect', '容量', 'rarity', 'sellPrice', '説明']];
for (const p of POTS) {
  potData.push([p.name, p.potEffect, p.capacity, p.rarity, p.sellPrice, p.desc]);
}

addSheet('06_壺', potData);

// ===== ペン・魔方陣（Pen/Pentacle）=====
const penData = [
  ['ペン名', 'effect', '通常効果', '祝福効果', '呪い効果'],

  ['聖域のペン', 'sanctuary', 'モンスター通過・攻撃不可。プレイヤー戦闘時に敵ダメージ軽減', '敵ダメージ軽減（通常同様）', '描いた直後、プレイヤー隣接8マスのいずれかに弾き出される'],
  ['脆弱のペン', 'vulnerability', '部屋内で全員の受けるダメージ2倍', 'フロア全体でダメージ4倍', 'ダメージ半減（1/2）'],
  ['魔封じのペン', 'magic_seal', '部屋内で一切の魔法が無効', 'フロア全体で一切の魔法が無効', '部屋内の魔法ダメージ2倍'],
  ['雷のペン', 'thunder_trap', '描いた瞬間プレイヤー・敵が25ダメージ。毎ターン25ダメージ', '描いた瞬間プレイヤー・敵が50ダメージ。毎ターン50ダメージ', '描いた瞬間プレイヤーが25HP回復'],
  ['遠投のペン', 'farcast', '部屋内で投げたもの・矢が壁まで貫通', 'フロア全体で投げたもの・矢が壁まで貫通', '部屋内で投げたもの・矢が1マスで止まる'],
  ['明かりのペン', 'light', 'その部屋全体が可視化（常時）', 'フロア全体が可視化（常時）', '部屋内視界が1マスに制限'],
  ['テレポートのペン', 'teleport_trap', '描いた瞬間TP。その後毎ターン10%でTP、ブロック不可', '描いた瞬間TP。その後毎ターン10%でTP、ブロック不可', '描いた瞬間TPなし。呪いTP存在時はTP無効化'],
  ['罠のペン', 'trap_gen', '毎ターン10%で部屋内に罠配置', '毎ターン10%でフロア内に罠配置', '毎ターン10%でフロア内の罠を1つ削除'],
  ['石飛ばしのペン', 'stone_throw', '毎ターン25%で部屋内に5-10ダメージの石飛ぶ', '毎ターン25%で部屋内に10-20ダメージの石飛ぶ（2倍）', '毎ターン25%で部屋内に石が飛んで回復。アンデッドには逆効果'],
  ['吹き飛ばしのペン', 'knockback_aura', '近接攻撃ヒット時、敵が5マス吹き飛ぶ', '近接攻撃ヒット時、敵が壁に当たるまで吹き飛ぶ', '近接攻撃ヒット時、敵が1マス吹き飛ぶ'],
  ['爆発のペン', 'explosion', '敵倒時、その場で敵現HP3/4ダメージの爆発。壁・罠・大箱破壊', 'フロア全体で敵倒時に爆発', '呪いTP存在時は全爆発を打ち消す'],
  ['ただのペン', 'plain', '何も起こらない', '何も起こらない', '何も起こらない'],
  ['重力のペン', 'gravity', '部屋内で浮遊敵が罠にかかる。水上の浮遊敵を陸に弾き出す', 'フロア全体で浮遊敵が罠にかかる。水上の浮遊敵を陸に弾き出す', '部屋内全員が浮遊状態に（常時）'],
  ['みかわしのペン', 'dodge', '部屋内で投げたもの・矢・石が100%外れる', 'フロア全体で投げたもの・矢・石が100%外れる', '部屋内で投げたもの・矢・石が100%命中（sure hit）'],
  ['等速のペン', 'equal_speed', '部屋内で全員が1ターンに1回しか行動できない', '部屋内で全員が1ターンに2回行動（haste）', '部屋内で全員が鈍足（2ターンに1回しか行動不可）'],
  ['回復のペン', 'heal_aura', '毎ターン部屋内全員が5HP回復。アンデッドには5ダメージ', '毎ターン部屋内全員が10HP回復。アンデッドには10ダメージ', '毎ターン部屋内全員が5ダメージ。アンデッドには逆効果'],
];

addSheet('07_ペン', injectRarity(penData));

// ===== マーカーペン・魔法書 =====
const otherData = [
  ['アイテム', '説明'],

  ['マーカーペン', MAGIC_MARKER.desc],
  ['', '祝福時：書き込まれたアイテムに blessed=true'],
  ['', '呪い時：書き込まれたアイテムに cursed=true'],

  ['魔法書', '未習得(通常)→習得Lv.1　未習得(祝福)→習得Lv.2　未習得(呪い)→別の魔法習得'],
  ['', '習得済(通常)→LvUP+1　習得済(祝福)→LvUP+2　習得済(呪い)→別魔法習得/LvUP　最大Lv時消費しない'],

  ['', ''],
  ['【魔法書一覧】', ''],
  ['魔法書名', '習得魔法 id / rarity / sellPrice / 説明'],
];
const _spellMap = new Map(SPELLS.filter(s => !s.debug).map(s => [s.id, s]));
for (const sb of SPELLBOOKS) {
  const sp = _spellMap.get(sb.spell);
  otherData.push([sb.name, `${sb.spell} / ${sb.rarity} / ${sb.sellPrice}G / ${sp ? sp.desc : ''}`]);
}

addSheet('08_マーカーペン魔法書', otherData);

// ===== 状態異常 =====
const statusData = [
  ['状態異常', 'プレイヤー効果', 'モンスター効果', '原因'],

  ['毒（poisoned）', '攻撃力が低下', 'ダメージ + 攻撃力半減', '毒薬飲用・浴びせかけ'],
  ['眠り（sleepTurns）', '行動不可', '行動不可', '睡眠薬・巻物'],
  ['混乱（confusedTurns）', '移動方向がランダム', '攻撃対象がランダム', '混乱薬・巻物'],
  ['鈍足（slowTurns）', '速度×0.5', '速度×0.5', '鈍足の薬・鈍足の杖・鈍足の罠・封印の薬（祝福）'],
  ['金縛り（paralyzeTurns）', 'ターン数の間、移動不可', 'ターン数の間、行動不可', '金縛りの薬・金縛りの杖・金縛りの巻物'],
  ['加速（hasteTurns）', '速度×2（2回行動）', '速度UP', '鈍足の杖（呪い）・特定効果'],
  ['暗闇（darknessTurns）', '視界が1マスに', '認識不可・直進移動', '暗闇の薬・暗闇の杖・暗闇の罠'],
  ['幻惑（bewitchedTurns）', '周囲の見た目がおかしく', 'フロアから逃げ出す', '惑わしの薬・惑わしの杖・惑わしの罠'],
  ['MP封印（mpCooldownTurns）', 'MP回復不可・魔法使用不可', 'MP封印（特技使用不可）', '封印の薬・マナ回復薬（呪い）・封印の杖・封印の罠'],
  ['状態異常免疫（statusImmune）', '状態異常を受けない', '状態異常を受けない', '金縛りの杖（呪い）'],
  ['必中（sureHitTurns）', '攻撃・投擲が外れない', '-', '混乱の薬（呪い）'],
  ['浮遊', '罠にかからない。階段が降りられない', '浮遊状態の敵特性', 'ペン（重力-呪い）'],
  ['油まみれ', '炎ダメージが2倍', '炎ダメージが2倍', '壺（油系）破裂'],
];

addSheet('09_状態異常', statusData);

// ===== 罠（Trap）=====
const trapData = [['罠名', 'effect', 'タイル']];
for (const t of TRAPS) {
  trapData.push([t.name, t.effect, t.tile]);
}

addSheet('10_罠', trapData);

// ===== モンスター図鑑 =====
// モンスターの特性を取得するヘルパー
function monTraits(m) {
  const t = [];
  if (m.float) t.push('浮遊');
  if (m.waterOnly) t.push('水タイルのみ');
  if (m.subtype === 'watergunner') t.push('水鉄砲攻撃');
  if (m.elemWeak) t.push(`${m.elemWeak}弱点`);
  if (m.kind === 'undead') t.push('アンデッド');
  if (m.kind === 'dragon') t.push('ドラゴン');
  if ((m.speed || 1) >= 2) t.push('倍速');
  if ((m.speed || 1) <= 0.5) t.push('遅い');
  if (m.maxAttacks >= 3) t.push('3回攻撃');
  else if (m.maxAttacks >= 2) t.push('2回攻撃');
  if (m.subtype) {
    const st = { itemblaster:'アイテム弾き', stealthrower:'アイテム盗んで投げる', runner:'攻撃しない高速逃走', slime:'討伐時に分裂', bombslime:'死亡時爆発', bombgoblin:'体当たり自爆', crystalslime:'物理ダメ固定1', rockspirit:'壁抜け移動', archer:'遠距離矢攻撃', thief:'アイテム盗む', rustbug:'攻撃で装備錆', wizard:'雷の杖使用', walldigger:'壁破壊移動', trapmaster:'隣接に罠設置', trapthrower:'罠を投げる', witchdoc:'呪いの杖使用', disarmer:'装備を剥ぐ', monsterthrow:'敵を投げる', shaman:'周囲モンスターにATK+3', barriermage:'バリア1回持ち', windmage:'吹き飛ばし杖', confusemage:'混乱の杖使用', puller:'プレイヤーを引き寄せる', sleepmage:'眠りの杖使用', firedemon:'炎吸収回復', warpmage:'テレポート杖', grabber:'プレイヤーを掴む', charger:'直線突進', reflector:'物理攻撃反射', knocker:'壁まで吹き飛ばす', magicreflector:'魔法・杖反射', potionthrower:'薬を投げる', icedragon:'氷ブレス' };
    if (st[m.subtype]) t.push(st[m.subtype]);
  }
  return t.join('・') || '基本敵';
}

const monsterData = [
  ['名前', 'Lv', 'HP', '攻撃', '防御', '経験値', '速度', 'baseKind', 'minFloor', 'maxFloor', '特性'],
  ['─── 通常モンスター ───', '', '', '', '', '', '', '', '', '', ''],
];

for (const m of MONS) {
  const spd = m.speed ?? 1;
  monsterData.push([m.name, 1, m.hp, m.atk, m.def, m.exp, spd, m.baseKind, m.minFloor, m.maxFloor, monTraits(m)]);
  if (m.levels) {
    for (let i = 0; i < m.levels.length; i++) {
      const lv = m.levels[i];
      monsterData.push([lv.name, i + 2, lv.hp, lv.atk, lv.def, lv.exp, spd, m.baseKind, '', '', '']);
    }
  }
}

const bossTiers = ['B5F','B10F','B15F','B20F','B25F','B30F','B35F','B40F','B45F','B50F'];
monsterData.push(['', '', '', '', '', '', '', '', '', '', '']);
monsterData.push(['─── ボス ───', '', '', '', '', '', '', '', '', '', '']);
for (let i = 0; i < BOSSES.length; i++) {
  const b = BOSSES[i];
  monsterData.push([b.name, '-', b.hp, b.atk, b.def, b.exp, b.speed ?? 1, b.baseKind, bossTiers[i] ?? '-', '', monTraits(b)]);
}

addSheet('11_モンスター', monsterData);

// ===== 杖（Wand）=====
const WAND_DETAILS = {
  knockback:    { normal:'対象を5マス先まで吹き飛ばす。壁激突ダメ5', blessed:'50マス先まで吹き飛ばす。壁激突ダメ10', cursed:'対象を自分の手前に引き寄せる' },
  lightning:    { normal:'rng(20,30)雷撃ダメ', blessed:'rng(40,60)ダメ（×2）', cursed:'対象HP+rng(20,30)回復（アンデッドには20-30ダメ）' },
  slow:         { normal:'敵の速度を半減(10T) / 自分は2倍速10T', blessed:'速度半減+金縛り10T付与', cursed:'対象を2倍速にする（プレイヤーは2倍速10T）' },
  transform:    { normal:'敵をランダムな別モンスターに変化 / アイテムをランダム品に変化', blessed:'同上', cursed:'同上' },
  swap:         { normal:'対象と位置を交換（移動封じ解除）', blessed:'交換後に対象が金縛りになる', cursed:'対象の1マス手前に飛びつく（飛びつきの杖効果）' },
  dig:          { normal:'rng(10,18)ダメ / 壁に当てると一直線に掘り進む', blessed:'rng(20,36)ダメ（×2）', cursed:'1マス先に壊せる壁(BWALL)を生成' },
  leap:         { normal:'対象の目の前にテレポート（移動封じ解除）', blessed:'同上', cursed:'対象をランダムテレポート / 自分に当たれば自分がランダムテレポート' },
  warp:         { normal:'対象をランダムテレポート', blessed:'対象を下り階段の上にテレポート+金縛り10T', cursed:'1マスだけ移動（振った方向に1歩）' },
  paralyze:     { normal:'敵を金縛り（ボスは10T）', blessed:'2回アクションが必要な強金縛り（ボスは20T）', cursed:'対象が200T状態異常免疫を得る' },
  sleep:        { normal:'6T眠り', blessed:'12T眠り（×2）', cursed:'フロアの敵が全て見え続ける（透視）' },
  bless_wand:   { normal:'アイテム1個祝福 / 所持品なら1個祝福 / 敵はHP+rng(10,20)（アンデッドはダメ）', blessed:'アイテム2個祝福', cursed:'アイテムを呪う / 所持品1個呪う / 敵に鈍足' },
  curse_wand:   { normal:'アイテム1個呪う / 所持品1個呪う / 敵に鈍足', blessed:'アイテム2個呪う / 所持品2個呪う', cursed:'効果が反転し祝福（アイテム祝福 / 所持品1個祝福 / 敵HP回復）' },
  levelup:      { normal:'敵をレベルアップ / 自分はレベルアップ', blessed:'敵を2レベルアップ / 自分は2レベルアップ', cursed:'敵はレベルダウン / 自分は1階上へ飛ばされる' },
  confuse:      { normal:'敵を20T混乱 / 自分は5T混乱', blessed:'敵を40T混乱 / 自分は10T混乱', cursed:'敵の混乱を解除 / プレイヤーは必中状態100T' },
  darkness:     { normal:'敵を50T暗闇（ボス25T）/ 自分は20T暗闇（視界1マス）', blessed:'敵は永続暗闇 / 自分は50T暗闇', cursed:'フロア全体が探索済みになる（透視）' },
  bewitch:      { normal:'敵を50T幻惑（逃げ回る）/ 自分は50T幻惑', blessed:'敵は永続幻惑 / 自分は100T幻惑', cursed:'フロアの罠が全て見える' },
  seal:         { normal:'敵を封印（特技封じ）/ 自分はMP封印50T', blessed:'敵に鈍足も追加 / 自分はさらに鈍足10T', cursed:'敵の特技使用率100% / 自分のMP封印を解除' },
  soften:       { normal:'敵の防御を半減 / アイテム・罠・大箱を破壊 / 壁→ランダム食料', blessed:'防御を1/4に', cursed:'1マス先に壊せる壁(BWALL)を生成' },
  fire_wand:    { normal:'rng(20,30)炎ダメ（油まみれ×2）', blessed:'rng(40,60)ダメ（×2）', cursed:'対象HP+rng(20,30)回復（アンデッドには20-30ダメ）' },
  ice_wand:     { normal:'rng(15,25)氷ダメ+5T移動封じ', blessed:'rng(30,50)ダメ+10T移動封じ（×2）', cursed:'対象HP最大20回復+移動封じ解除' },
  vitality_swap:  { normal:'対象と現在HPを入れ替える', blessed:'交換後に相手HP→1', cursed:'交換後に自分HP→1' },
  sage:           { normal:'アイテム・大箱を識別 / 壁に跳ね返ると手持ち1個ランダム識別', blessed:'同上', cursed:'対象が未識別に戻る' },
  godsparkwand:   { normal:'対象に100ダメージ', blessed:'対象に200ダメージ（×2）', cursed:'対象HP+100回復' },
};

const wandData = [['杖名', 'チャージ', 'レア度', '売値', '通常効果', '祝福効果', '呪い効果', '説明']];
for (const w of [...WANDS, GODSPARKWAND_T]) {
  const d = WAND_DETAILS[w.effect] || {};
  wandData.push([w.name, w.charges, w.rarity, w.sellPrice, d.normal||'', d.blessed||'', d.cursed||'', w.desc]);
}

addSheet('12_杖', wandData);

// ===== 食べ物（Food）=====
const foodItemData = [['カテゴリ', '項目', '値/効果', '備考']];

// 食べ物効果
foodItemData.push([`食べ物効果（${FOOD_EFFECTS.length}種）`, '効果ラベル（effect）', '説明', 'rarity']);
for (const ef of FOOD_EFFECTS) {
  foodItemData.push(['', `${ef.l}（${ef.e}）`, FOOD_DESCS[ef.e] ?? '', ef.rarity]);
}

// サイズ（生食料）
foodItemData.push(['', '', '', '']);
foodItemData.push(['サイズ（生食料）', 'ラベル', '満腹度（生は÷2）', '重み']);
for (const sz of RAW_SIZES) {
  foodItemData.push(['', sz.l, `満腹度+${sz.v}（生→${Math.floor(sz.v/2)}）`, sz.w]);
}
foodItemData.push(['', '超特大', '満腹度+120（生→60）※満腹の大箱で特大を強化した場合のみ', '-']);

// サイズ（調理済み）
foodItemData.push(['', '', '', '']);
foodItemData.push(['サイズ（調理済み）', 'ラベル', '満腹度', '重み']);
for (const sz of COOKED_SIZES) {
  foodItemData.push(['', sz.l, `満腹度+${sz.v}`, sz.w]);
}
foodItemData.push(['', '爆盛り', '満腹度+120 ※満腹の大箱で特盛りを強化した場合のみ', '-']);

// 特殊状態（静的）
foodItemData.push(['', '', '', '']);
foodItemData.push(['特殊状態', '腐った食料', '満腹度×0.3 + ダメージrng(5,10) + 毒', '毒消し指輪で毒は防げる']);
foodItemData.push(['', '焼いた食料', '満腹度×2。生食料を炎の薬/炎の杖/加熱の壺で調理', '']);
foodItemData.push(['', '焦げた食料', '満腹度÷2。調理済みに再度炎が当たる', '']);
foodItemData.push(['', '祝福食料', '満腹度通常（効果は変わらない）', '']);
foodItemData.push(['', '呪い食料', '満腹度通常（効果は変わらない）', '']);

addSheet('13_食べ物', foodItemData);

// ===== 大箱（BigBox）=====
const bigboxData = [['大箱名', 'kind', '容量（rng）', 'レア', '効果']];
for (const b of BB_TYPES) {
  bigboxData.push([b.name, b.kind, String(b.cap()), b.rare ? '★レア' : '', b.desc]);
}

addSheet('14_大箱', bigboxData);

// ===== 泉（Spring）=====
const springData = [
  ['項目', '内容', '備考'],

  ['基本仕様', '種類は1種類のみ', 'フロアに複数配置。容量4（5個目で強制干上がり）'],
  ['', '使用ごとに25%の確率で干上がる', '干上がると中のアイテムが現れる'],
  ['', '', ''],

  ['飲む（良い効果）', 'HP+rng(5,15)', '15%'],
  ['', '攻撃力+1', '7%'],
  ['', '防御力+1', '6%'],
  ['', '最大HP+3（現HPも+3）', '6%'],
  ['', '満腹度+20', '5%'],
  ['', 'MP+10（MP0のキャラは「清らかな水」）', '6%'],
  ['', '水の瓶が隣のマスに飛び出す', '7%'],
  ['', '金貨rng(15,60)枚が隣のマスに飛び出す', '6%'],
  ['', 'ランダムな所持品が祝福される', '5%'],
  ['', 'ランダムな未識別アイテムが識別される', '5%'],
  ['飲む（悪い効果）', '混乱10ターン', '8%'],
  ['', 'rng(3,8)ダメージ', '8%（苦い）'],
  ['', '毒状態になる', '6%'],
  ['', 'ランダムな所持品が呪われる', '5%'],
  ['', '泉からわてりが出現（水なし→動けない）', '5%'],
  ['', '', ''],

  ['浸す・投げ込む（武器/防具）', 'plus-1に錆びる。呪いは解除', '通常'],
  ['', '錆びない。呪いは解除', '不錆(no_degrade)能力持ち'],
  ['', 'エクスカリバーに変化（plus維持）', 'ロングソード限定・5%の確率'],
  ['', '金の斧に変化（plus維持）', 'バトルアクス/戦神の斧限定・20%の確率'],
  ['', '', ''],

  ['浸す・投げ込む（その他）', '空き瓶 → 水（HP+10）', '祝福/呪い状態を引き継ぐ'],
  ['', '巻物 → 白紙の巻物', '白紙に浸しても何も起こらない'],
  ['', '魔法書 → 白紙の魔法書', '白紙に浸しても何も起こらない'],
  ['', '薬 → 水になる（落とした場合）', '投げ込んだ際'],
  ['', '火薬壺 → 保存の壺（中身保持）', '浸す/落とす両方'],
  ['', '呪われたアイテム → 呪いが解除される', 'それ以外は何も起こらない'],
];

addSheet('15_泉', springData);

XLSX.writeFile(wb, '/home/user/Rogue/ローグゲーム完全実装ガイド.xlsx');
console.log('✅ Complete game guide updated: ローグゲーム完全実装ガイド.xlsx');
console.log('   - 薬・食べ物への薬・巻物・武器防具・指輪・壺・マーカーペン魔法書・状態異常');
console.log('   - ペン・魔方陣（16種）- 通常・祝福・呪い時効果を追加');
console.log('   - 罠（19種）を追加');
console.log('   - モンスター図鑑を追加');
