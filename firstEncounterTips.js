const MAIN_DUNGEON_TYPES = new Set(["beginner", "intermediate", "advanced", "legend"]);

export const FIRST_ENCOUNTER_TIPS = Object.freeze({
  unidentified_item: { title: "正体不明の道具", trigger: "未識別の薬・巻物・杖・指輪・ペン・壺・魔法書を拾う", text: ["未識別の道具は、見た目だけでは効果が分からない。", "使うか鑑定すると正体が分かる。"] },
  item_potion: { title: "薬", trigger: "初めて薬を拾う", text: ["薬は飲む・投げるほか、食料にかけて使えるものもある。", "未識別なら安全な場所で試そう。"] },
  item_scroll: { title: "巻物", trigger: "初めて巻物を拾う", text: ["巻物は読むと効果が発動する。", "未識別なら周囲を確認してから読もう。"] },
  item_weapon: { title: "武器", trigger: "初めて武器を拾う", text: ["装備すると攻撃力が上がる。", "＋値・能力・呪いを確認しよう。"] },
  item_armor: { title: "防具", trigger: "初めて防具を拾う", text: ["装備すると防御力が上がる。", "＋値・能力・呪いを確認しよう。"] },
  item_arrow: { title: "矢", trigger: "初めて矢を拾う", text: ["装備して遠くの敵を攻撃できる。", "使うほど数が減る。"] },
  item_wand: { title: "杖", trigger: "初めて杖を拾う", text: ["振った方向の対象に効果を与える。", "残り回数と反射に注意しよう。"] },
  item_pen: { title: "ペン", trigger: "初めてペンを拾う", text: ["足元に魔方陣を描く道具。", "種類と祝福・呪いで効果が変わる。"] },
  item_marker: { title: "魔法の筆", trigger: "初めて魔法の筆を拾う", text: ["白紙の巻物に魔法を書き込める。", "書き込みにはインクを使う。"] },
  item_ring: { title: "指輪", trigger: "初めて指輪を拾う", text: ["装備すると常時効果が働く。", "指輪は2個まで装備できる。"] },
  item_spellbook: { title: "魔法書", trigger: "初めて魔法書を拾う", text: ["読むと魔法を覚え、その場で発動する。", "MP不足なら反動があるので、未識別なら慎重に。"] },
  item_pot: { title: "壺", trigger: "初めて壺を拾う", text: ["道具を入れて使う壺がある。", "種類と容量を確認しよう。"] },
  item_food: { title: "食料", trigger: "初めて食料を拾う", text: ["食べると満腹度が回復する。", "空腹になる前に食べよう。"] },
  item_gem: { title: "宝石", trigger: "初めて宝石を拾う", text: ["宝石は店で売ると金貨になる。", "買った店から遠い階の店で売るほど高くなる。"] },
  item_bottle: { title: "空き瓶", trigger: "初めて空き瓶を拾う", text: ["空き瓶は泉で水をくんだり、敵に投げたりできる。", "投げて敵を倒すと、薬に変わる。"] },
  item_gold: { title: "金貨", trigger: "初めて金貨を拾う", text: ["拾った金貨は店で使える。", "持ち帰れば銀行に預けられる。"] },
  blessing_curse: { title: "祝福と呪い", trigger: "道具や魔方陣が祝福・呪いの影響を受ける", text: ["祝福や呪いは道具に影響する。", "未識別のまま使う時は注意しよう。"] },
  trap: { title: "隠れた罠", trigger: "隠れた罠が作動する、罠探しで発見する、または足元から罠を起動する", text: ["罠は普段は見えず、踏むと作動して見える。", "Sキー（モバイルは「罠探し」）で周囲を探せる。"] },
  shop: { title: "ダンジョン内の店", trigger: "ダンジョン内の店へ入る", text: ["店の道具は拾うと未払いになる。", "買わずに出ると泥棒扱い。"] },
  spring: { title: "泉", trigger: "初めて泉の上に乗る、または横から存在を調べる", text: ["泉では水を飲んだり道具を浸せる。", "使うと枯れることがある。"] },
  bigbox: { title: "大箱", trigger: "初めて大箱の上に乗る、または横から存在を調べる", text: ["道具を投げ入れると効果が起きる。", "中身は箱を壊すと取り出せる。"] },
  gacha_machine: { title: "ガチャマシーン", trigger: "足元・正面・フロア一覧からガチャマシーンを調べる", text: ["1000Gで景品が1個出る。", "店内の台を壊すと泥棒扱い。"] },
  dimensional_vault: { title: "次元宝物庫", trigger: "次元宝物庫の部屋へ入る", text: ["中の道具には消えるまでの時間がある。", "残りターンを見て急いで拾おう。"] },
  wandering_merchant: { title: "行商人", trigger: "行商人に話しかける", text: ["その場で道具を売買できる。", "攻撃すると敵対する。"] },
  altar: { title: "祭壇", trigger: "祭壇を調べる", text: ["食料を捧げると別の道具が返る。", "捧げるほど良い返礼品が出やすい。"] },
  monster_house: { title: "モンスターハウス", trigger: "モンスターハウスへ入り、部屋が起動する", text: ["部屋の敵が一斉に目覚める。", "入口へ戻るか、道具で切り抜けよう。"] },
  goal_item: { title: "目標アイテム", trigger: "ダンジョンの目標アイテムを拾う", text: ["拾っただけではクリアにならない。", "地上まで持ち帰ろう。"] },
  low_hp: { title: "瀕死", trigger: "HPが最大値の25%以下になる", text: ["HPが危険域。敵から離れよう。", "回復するか、無理なら逃げよう。"] },
  hunger: { title: "空腹", trigger: "満腹度が25以下になる", text: ["満腹度0で歩くたびHPが減る。", "食料は早めに食べよう。"] },
  inventory_full: { title: "持ち物がいっぱい", trigger: "所持数が上限に達する", text: ["満杯だと新しい道具を拾えない。", "道具欄（Xキー）の「足元」ページで整理できる。"] },
  cursed_equipment: { title: "呪われた装備", trigger: "呪いが判明した武器・防具・矢・指輪を装備している", text: ["呪われた装備は普通には外せない。", "解呪してから交換しよう。"] },
  poison: { title: "毒", trigger: "毒状態になる", text: ["毒は毎ターンHPを減らし、自然回復を止める。", "解毒手段で治そう。"] },
  confusion: { title: "混乱", trigger: "混乱状態になる", text: ["移動や攻撃の方向が乱れる。", "敵から離れて効果が切れるのを待とう。"] },
  action_disabled: { title: "行動不能", trigger: "睡眠・金縛り状態になる", text: ["睡眠・金縛り中は自分で動けない。", "敵から離れて回復を待とう。"] },
  slow: { title: "鈍足", trigger: "鈍足状態になる", text: ["鈍足中は2ターンに1回しか動けない。", "敵と距離を取ろう。"] },
  immobile: { title: "移動不能・拘束", trigger: "移動封じ・凍結・敵の拘束を受ける", text: ["移動できなくても攻撃や道具は使えることがある。", "テレポートなどで脱出しよう。"] },
  magic_seal: { title: "魔法封印", trigger: "魔法封印状態になる", text: ["魔法・杖・巻物などが使えない。", "物理攻撃や薬で対処しよう。"] },
  attack_seal: { title: "攻撃封印", trigger: "攻撃封印状態になる", text: ["通常攻撃ができない。", "杖や投擲などで対処しよう。"] },
  mp_recovery_block: { title: "MP回復禁止", trigger: "MP回復禁止状態になる", text: ["MP回復だけが封じられ、杖・巻物・魔法の使用自体は制限されない。", "効果が切れるまでMPを温存しよう。"] },
  darkness: { title: "暗闇", trigger: "暗闇状態になる", text: ["視界が1マスになり、巻物も読めない。", "敵に近づかず、明かりや治療を使おう。"] },
  bewitch: { title: "幻惑", trigger: "幻惑状態になる", text: ["見た目や見渡す情報が信用できない。", "地形を頼りに安全な場所へ退こう。"] },
  floating: { title: "浮遊", trigger: "浮遊状態になる", text: ["罠と深い水を避けて移動できる。", "階段は使えないので効果時間に注意。"] },
  soaked: { title: "ずぶ濡れ", trigger: "ずぶ濡れ状態になる", text: ["炎・爆発に強く、雷・氷に弱くなる。", "水の飛沫や水中歩行などで付与される。"] },
  oily: { title: "油まみれ", trigger: "油まみれ状態になる", text: ["炎・爆発のダメージが増える。", "水で油を落としてから戦おう。"] },
  pot_confined: { title: "壺の中に閉じ込められた", trigger: "とじこめの壺へ入る", text: ["壺の中では一定ターン動けない。", "水中なら毎ターンダメージを受ける。"] },
  wall_walk: { title: "壁抜け", trigger: "壁抜け状態になる", text: ["壁の中を移動できる。", "効果が切れる前に床へ戻ろう。"] },
  reverse: { title: "ダメージと回復の逆転", trigger: "逆転状態になる", text: ["ダメージと回復の効果が逆になる。", "回復薬も危険なので注意。"] },
  deep_water: { title: "深い水", trigger: "深い水へ入る", text: ["水中呼吸か浮遊がないと危険。", "水底の道具は水中呼吸中に拾える。"] },
  pentacle: { title: "魔方陣", trigger: "魔方陣の上へ乗る", text: ["魔方陣は種類や祝呪で効果が変わる。", "「見渡す」で性質を確認しよう。"] },
  boss: { title: "ボス", trigger: "初めてボスを視界に入れる", text: ["ボスは強力な固有行動を持つ。", "道具を組み合わせて戦い、豪華な専用報酬を狙おう。"] },
  special_floor: { title: "特殊なフロア", trigger: "通常と異なる構造のフロアへ初めて入る", text: ["通常と違う構造のフロア。", "階段と退路を先に確保しよう。"] },
  statue: { title: "石像", trigger: "石像を調べる、または石像へ移動しようとする", text: ["石像に歩いてぶつかっても、壊れずに止まる。", "攻撃して壊すと道具と強敵が出る。爆発なら中身ごと消える。"] },
  vent: { title: "風穴", trigger: "風穴の上へ乗る", text: ["近くでは物理飛び道具が風向きへ曲がる。", "杖や魔法弾には影響しない。"] },
  hidden_room: { title: "隠し部屋・宝物庫", trigger: "隠し部屋または宝物庫を発見する", text: ["隠し部屋には道具があるが、罠や敵もいる。", "罠探しをして退路を確保しよう。"] },
  item_mimic: { title: "アイテムモドキ", trigger: "床の道具に化けた敵が正体を現す", text: ["道具に化けた敵は拾おうとすると襲ってくる。", "離れて攻撃すると安全。"] },
  item_lost: { title: "道具・金貨を奪われた", trigger: "敵や罠に道具・金貨を盗まれる、または弾き飛ばされる", text: ["盗まれた道具は敵を倒すと戻ることがある。", "飛ばされた道具は同じ階を探そう。"] },
  item_destroyed: { title: "道具の消失・水濡れ", trigger: "炎・爆発・水などで所持品や床の道具が失われる、または白紙になる", text: ["炎・爆発・水などで道具は壊れる。", "耐性のある装備で守ろう。"] },
  wand_wall_reflect: { title: "杖の魔法弾の反射", trigger: "通常の杖の魔法弾が壁に当たって反射する", text: ["杖の魔法弾は壁で反射し、自分へ戻ってくることがある。", "振る前に弾道を確認しよう。"] },
  time_bomb: { title: "時限爆弾", trigger: "時限爆弾の罠が作動する", text: ["表示ターン後、周囲5×5を爆破する。", "爆心地から離れるか消火しよう。"] },
  reflection: { title: "反射", trigger: "投擲物・矢・杖・魔法などが反射される", text: ["飛び道具や魔法を跳ね返す敵・装備がある。", "近接攻撃や封印で対処しよう。"] },
  enemy_bone_revival: { title: "敵の骨", trigger: "敵を倒したあとに復活する骨が残る", text: ["骨から5ターン後に復活することがある。", "投擲物や炎の杖で骨を壊そう。"] },
  mp_revival: { title: "MPによる復活", trigger: "HPが0になったとき、残りMPで復活する", text: ["HP0時にMPがあれば、MPをHPにして復活する。", "復活後はMPが回復しない。"] },
  revival_pentacle: { title: "復活の魔方陣", trigger: "復活の魔方陣の力でHP全回復する", text: ["復活の魔方陣はHP0の対象を復活させる。", "呪われていると復活を封じる。"] },
  fake_stair: { title: "偽階段", trigger: "階段に化けた罠を踏む", text: ["階段に見える罠がある。", "罠探しや遠距離攻撃で確かめよう。"] },
  shop_theft: { title: "泥棒扱い", trigger: "未払いの商品を持って店外へ出る", text: ["未払いの商品を持って出ると泥棒扱い。", "店主や警備員から逃げるか戦おう。"] },
  equipment_broken: { title: "装備の劣化・破損", trigger: "装備が錆びる、または耐久を使い切って壊れる", text: ["錆で装備の＋値が下がる。", "耐久のある装備は使い切る前に交換しよう。"] },
  long_stay: { title: "長居の危険", trigger: "同じ階に1000ターン以上滞在し、長居専用の強敵が現れる", text: ["同じ階に長くいると追跡者が現れる。", "目的を済ませたら早めに進もう。"] },
  forced_move: { title: "強制移動", trigger: "敵や罠に吹き飛ばされる、引き寄せられる、または位置を変えられる", text: ["吹き飛ばしや引き寄せで位置を変えられる。", "壁や罠の位置に注意しよう。"] },
  elemental_combat: { title: "属性弱点", trigger: "炎・氷・雷などの弱点特効を初めて発生させる", text: ["敵の弱点属性は大ダメージになる。", "油・水濡れなど状態異常も活用しよう。"] },
});

export function getFirstEncounterTip(key, dungeonType, seenTips = []) {
  if (!MAIN_DUNGEON_TYPES.has(dungeonType)) return null;
  if (seenTips instanceof Set ? seenTips.has(key) : seenTips.includes(key)) return null;
  const tip = FIRST_ENCOUNTER_TIPS[key];
  return tip ? { key, ...tip } : null;
}

export function getSeenFirstEncounterTips(seenTips = []) {
  const seen = seenTips instanceof Set ? seenTips : new Set(seenTips || []);
  return Object.entries(FIRST_ENCOUNTER_TIPS)
    .filter(([key]) => seen.has(key))
    .map(([key, tip]) => ({ key, name: tip.title, ...tip }));
}

const IDENTIFIED_TYPES = new Set(["potion", "scroll", "wand", "ring", "pen", "marker", "spellbook", "pot"]);
const ITEM_PICKUP_TIP_KEYS = Object.freeze({
  potion: "item_potion",
  scroll: "item_scroll",
  weapon: "item_weapon",
  armor: "item_armor",
  arrow: "item_arrow",
  wand: "item_wand",
  pen: "item_pen",
  marker: "item_marker",
  ring: "item_ring",
  spellbook: "item_spellbook",
  pot: "item_pot",
  food: "item_food",
  gem: "item_gem",
  bottle: "item_bottle",
  gold: "item_gold",
});

export function isUnidentifiedEncounterItem(item, ident, allBcKnown = false) {
  if (!item || allBcKnown || item.fullIdent || !IDENTIFIED_TYPES.has(item.type)) return false;
  let identKey = null;
  if (item.type === "potion") identKey = `p:${item.effect}`;
  else if (item.type === "scroll" && item.effect !== "blank") identKey = `s:${item.effect}`;
  else if (item.type === "wand") identKey = `w:${item.effect}`;
  else if (item.type === "ring") identKey = `r:${item.effect}`;
  else if (item.type === "pen") identKey = `n:${item.effect}`;
  else if (item.type === "pot") identKey = `o:${item.potEffect}`;
  else if (item.type === "spellbook" && item.spell) identKey = `b:${item.spell}`;
  if (!identKey || identKey.endsWith(":undefined")) return false;
  return !(ident instanceof Set ? ident.has(identKey) : (ident || []).includes(identKey));
}

export function getFirstEncounterPickupTipKeys(item, ident, allBcKnown = false) {
  const keys = [];
  if (isUnidentifiedEncounterItem(item, ident, allBcKnown)) keys.push("unidentified_item");
  const itemTipKey = ITEM_PICKUP_TIP_KEYS[item?.type];
  if (itemTipKey) keys.push(itemTipKey);
  if (item?.blessed || item?.cursed) keys.push("blessing_curse");
  if (item?.type === "wand") keys.push("wand_wall_reflect");
  return keys;
}

const SPECIAL_FLOOR_TYPES = new Set(["bigRoom", "middleRoom", "miniRoom", "shoppingMall", "spinFloor", "corridorFloor", "gridRoom", "treasureRoom", "ringCorridorFloor", "caveFloor", "floodedFloor", "twinWingFloor"]);

export function getFirstEncounterStateTipKeys(session, { isDeepWater = false } = {}) {
  const p = session?.player;
  const dg = session?.dungeon;
  if (!p || !dg) return [];
  const keys = [];
  const equipped = [p.weapon, p.armor, p.arrow, ...(p.rings || [])].filter(Boolean);
  const hasKnownCurse = equipped.some((item) => item.cursed && (session.allBcKnown || item.fullIdent || item.bcKnown));
  const visibleBoss = (dg.monsters || []).some((monster) => monster.isBoss && dg.visible?.[monster.y]?.[monster.x]);
  if (p.hp > 0 && p.maxHp > 0 && p.hp <= p.maxHp * 0.25) keys.push("low_hp");
  if ((p.hunger ?? p.maxHunger ?? 100) <= 25) keys.push("hunger");
  if ((p.inventory?.length || 0) >= (p.maxInventory || 30)) keys.push("inventory_full");
  if (hasKnownCurse) keys.push("cursed_equipment");
  if (p.poisoned || (p.poisonedTurns || 0) > 0) keys.push("poison");
  if ((p.confusedTurns || 0) > 0) keys.push("confusion");
  if ((p.sleepTurns || 0) > 0 || (p.paralyzeTurns || 0) > 0) keys.push("action_disabled");
  if ((p.slowTurns || 0) > 0 || p.slowSkip) keys.push("slow");
  if ((p.immobileTurns || 0) > 0 || (p.frozenTurns || 0) > 0 || p.capturedBy) keys.push("immobile");
  if ((p.sealedTurns || 0) > 0) keys.push("magic_seal");
  if ((p.attackSealTurns || 0) > 0) keys.push("attack_seal");
  if ((p.mpSealTurns || 0) > 0) keys.push("mp_recovery_block");
  if ((p.darknessTurns || 0) > 0) keys.push("darkness");
  if ((p.bewitchedTurns || 0) > 0) keys.push("bewitch");
  if ((p.floatTurns || 0) > 0) keys.push("floating");
  if ((p.soakedTurns || 0) > 0) keys.push("soaked");
  if ((p.oilyTurns || 0) > 0) keys.push("oily");
  if ((p.potConfinedTurns || 0) > 0) keys.push("pot_confined");
  if ((p.wallWalkTurns || 0) > 0) keys.push("wall_walk");
  if ((p.reverseTurns || 0) > 0) keys.push("reverse");
  if (isDeepWater) keys.push("deep_water");
  if ((dg.pentacles || []).some((pc) => pc.x === p.x && pc.y === p.y)) keys.push("pentacle");
  if (visibleBoss) keys.push("boss");
  if (SPECIAL_FLOOR_TYPES.has(dg.floorType)) keys.push("special_floor");
  return keys;
}

export const FIRST_ENCOUNTER_MESSAGE_RULES = Object.freeze([
  { key: "fake_stair", pattern: /が罠に化けた！/ },
  { key: "shop_theft", pattern: /泥棒扱い|店から盗んで逃げた/ },
  { key: "long_stay", pattern: /長居しすぎたせいか/ },
  { key: "time_bomb", pattern: /時限爆弾の罠が作動！|時限爆弾の罠：あと/ },
  { key: "hidden_room", pattern: /隠し部屋を発見|宝物庫を発見/ },
  { key: "item_mimic", pattern: /アイテムモドキ.*正体を現した|強アイテムモドキ.*正体を現した|アイテムモドキ王.*正体を現した/ },
  { key: "item_lost", pattern: /を盗んだ！|金貨\d+枚を盗ん|どこかへ飛んでいった|弾き飛ばし/ },
  { key: "equipment_broken", pattern: /が錆びた！|が壊れてしまった！/ },
  { key: "item_destroyed", pattern: /燃えてなくなった|割れてなくなった|水に濡れて白紙になった|文字が消えた！→白紙/ },
  { key: "reflection", pattern: /跳ね返され|跳ね返した|跳ね返ってきた|反射された/ },
  { key: "revival_pentacle", pattern: /復活の魔方陣の力/ },
  { key: "mp_revival", pattern: /残りMP\d+でHP\d+として復活/ },
  { key: "enemy_bone_revival", pattern: /骨から.*復活|骨が残った/ },
  { key: "statue", pattern: /石像がある/ },
  { key: "vent", pattern: /風穴がある/ },
  { key: "forced_move", pattern: /吹き飛ばされた|引き寄せられ|場所を入れ替えられ/ },
  { key: "elemental_combat", pattern: /弱点特効|弱点×|雷弱点！|油まみれ×2/ },
]);

export function getFirstEncounterMessageTipKeys(messages) {
  const text = (messages || []).map((message) => typeof message === "string" ? message : message?.text || "").join("\n");
  return FIRST_ENCOUNTER_MESSAGE_RULES.filter(({ pattern }) => pattern.test(text)).map(({ key }) => key);
}
