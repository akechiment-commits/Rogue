const MAIN_DUNGEON_TYPES = new Set(["beginner", "intermediate", "advanced", "legend"]);

export const FIRST_ENCOUNTER_TIPS = Object.freeze({
  unidentified_item: { title: "正体不明の道具", trigger: "未識別の薬・巻物・杖・指輪・ペン・壺・魔法書を拾う", text: ["薬・巻物・杖などは、冒険ごとに見た目と正体の対応が変わる。", "使うか鑑定すると正体が判明し、同じ見た目の道具も識別される。"] },
  trap: { title: "隠れた罠", trigger: "隠れた罠が作動する、罠探しで発見する、または足元から罠を起動する", text: ["罠は普段見えず、踏むと作動して姿を現す。発見済みの罠は通常歩行では作動しない。", "Sキー（モバイルは「罠探し」）で周囲の罠を探せる。怪しい場所では立ち止まって調べよう。"] },
  shop: { title: "ダンジョン内の店", trigger: "ダンジョン内の店へ入る", text: ["商品は拾った時点では未払い。店の出口を守る店主に代金を払う必要がある。", "未払いのまま店の外へ出ると泥棒扱いになる。自分の道具を店内に置けば売却もできる。"] },
  spring: { title: "泉", trigger: "足元・正面・フロア一覧から泉を調べる", text: ["泉では水を飲むか、持ち物を浸せる。結果は道具の種類によって変わる。", "利用するたびに泉が干上がることがあるので、何に使うか考えよう。"] },
  bigbox: { title: "大箱", trigger: "足元・正面・フロア一覧から大箱を調べる", text: ["大箱へ道具を投げ入れると、箱の種類に応じた効果が起きる。", "中身は直接取り出せない。さらに入れて容量オーバーさせるか、箱を壊して回収する。"] },
  monster_house: { title: "モンスターハウス", trigger: "モンスターハウスへ入り、部屋が起動する", text: ["部屋の敵が一斉に目覚めた。囲まれたまま戦うのは危険だ。", "入口へ戻って一対一にするか、杖・巻物などでまとめて対処しよう。逃げる判断も有効だ。"] },
  goal_item: { title: "目標アイテム", trigger: "ダンジョンの目標アイテムを拾う", text: ["目標アイテムは拾っただけではクリアにならない。", "来た道をB1Fまで戻り、上り階段から地上へ持ち帰ろう。"] },
  low_hp: { title: "瀕死", trigger: "HPが最大値の25%以下になる", text: ["HPが危険域に入った。敵から離れ、満腹なら歩いて自然回復できる。", "薬・食料・杖で立て直せない時は、階段や通路へ逃げる判断を優先しよう。"] },
  hunger: { title: "空腹", trigger: "満腹度が25以下になる", text: ["満腹度が0になると、歩くたびにHPが減り始める。自然回復も当てにできない。", "食料の大きさや状態で回復量が変わる。余裕があるうちに食べよう。"] },
  inventory_full: { title: "持ち物がいっぱい", trigger: "所持数が上限に達する", text: ["持ち物が満杯だと新しい道具を拾えない。使う・置く・投げるなどで空きを作ろう。", "Fキーの足元一覧なら、床の道具を確認してから整理できる。"] },
  cursed_equipment: { title: "呪われた装備", trigger: "呪いが判明した武器・防具・矢・指輪を装備している", text: ["呪われた装備は普通の操作では外せない。装備交換も妨げられる。", "解呪効果や祝福などで呪いを解いてから外そう。ゴミ箱へ捨てる方法もある。"] },
  poison: { title: "毒", trigger: "毒状態になる", text: ["毒の間は毎ターンHPが減り、自然回復が止まる。付与時に下がった攻撃力は毒が切れても残る。", "解毒効果や毒消しの指輪なら、毒と攻撃力低下をまとめて治せる。"] },
  confusion: { title: "混乱", trigger: "混乱状態になる", text: ["混乱中は移動や攻撃の方向が乱れる。敵の隣で無理に動くのは危険だ。", "道具の使用や待機でやり過ごすか、回復手段があれば早めに治そう。"] },
  action_disabled: { title: "行動不能", trigger: "睡眠・金縛り状態になる", text: ["睡眠や金縛り中は自分で行動できず、ターンが自動で進む。敵に囲まれていると特に危険だ。", "対応する耐性防具や状態防止効果があれば、付与そのものを防げる。"] },
  slow: { title: "鈍足", trigger: "鈍足状態になる", text: ["鈍足中は2ターンに1回しか行動できない。普段の間合いでも敵に連続攻撃されやすい。", "通路へ退く、敵を止める、遠距離から対処するなど正面戦闘を避けよう。"] },
  immobile: { title: "移動不能・拘束", trigger: "移動封じ・凍結・敵の拘束を受ける", text: ["移動できなくても、攻撃や道具使用など別の行動はできる場合がある。", "テレポートや吹き飛ばしで位置が変わると解除できることもある。状況に合う脱出手段を探そう。"] },
  magic_seal: { title: "魔法封印", trigger: "封印状態またはMP封印状態になる", text: ["封印中は巻物・魔法書・魔法・杖などを使えない。試しても発動せずターンだけ失うことがある。", "物理攻撃、投擲、薬や食料など、魔法ではない手段へ切り替えよう。"] },
  darkness: { title: "暗闇", trigger: "暗闇状態になる", text: ["暗闇中は視界が1マスになり、巻物も読めない。見えていない敵へ不用意に近づくのは危険だ。", "壁沿いに退くか、治療・明かり・モンスター感知で状況を取り戻そう。"] },
  bewitch: { title: "幻惑", trigger: "幻惑状態になる", text: ["幻惑中は周囲の見た目や「見渡す」で得る情報が信用できなくなる。", "記憶している地形を頼りに安全な場所へ退くか、効果が切れるまで慎重に行動しよう。"] },
  floating: { title: "浮遊", trigger: "浮遊状態になる", text: ["浮遊中は床の罠と深い水を避けられる一方、階段を使えない。", "効果が水上で切れると危険なため、残りターンと着地点を確認しよう。"] },
  soaked: { title: "ずぶ濡れ", trigger: "ずぶ濡れ状態になる", text: ["ずぶ濡れ中は炎・爆発ダメージが半減するが、雷ダメージは2倍になる。", "水は巻物や魔法書を白紙にし、食料やペンにも被害を与えることがある。耐水防具で防げる。"] },
  oily: { title: "油まみれ", trigger: "油まみれ状態になる", text: ["油まみれ中は炎・爆発ダメージが2倍になる。小さな炎でも致命傷になり得る。", "水を浴びるなどして油を落とすか、炎を使う敵や罠から離れよう。"] },
  pot_confined: { title: "壺の中に閉じ込められた", trigger: "とじこめの壺へ入る", text: ["壺の中では残り容量に応じたターン数だけ動けないが、敵からは見つからない。", "深い水や泉に沈んだ壺では毎ターンダメージを受ける。水中呼吸がなければ非常に危険だ。"] },
  wall_walk: { title: "壁抜け", trigger: "壁抜け状態になる", text: ["壁抜け中は壁の中を移動できるが、効果が切れた時に壁内へ残るとHPを失う。", "残りターンを見て、切れる前に床へ戻ろう。壁の中からの攻撃は威力が落ちる。"] },
  reverse: { title: "ダメージと回復の逆転", trigger: "逆転状態になる", text: ["逆転中は受けるダメージが回復に、回復効果がダメージに変わる。", "普段安全な回復薬や回復の泉も危険になる。効果が切れるまで行動の意味を逆に考えよう。"] },
  deep_water: { title: "深い水", trigger: "深い水へ入る", text: ["深い水は、水中呼吸か浮遊がなければ安全に歩けない。水中呼吸なら水底の道具も拾える。", "水を歩くとずぶ濡れになり、炎に強く雷に弱くなる。所持品の水濡れにも注意しよう。"] },
  pentacle: { title: "魔方陣", trigger: "魔方陣の上へ乗る", text: ["魔方陣の効果は種類・祝福・呪いで大きく変わり、同じ部屋全体へ及ぶものもある。", "上に乗り続けると消耗する魔方陣もある。「見渡す」や説明で性質を確認しよう。"] },
  boss: { title: "ボス", trigger: "初めてボスを視界に入れる", text: ["ボスは高い能力と固有行動を持つ。正面から殴り続けるだけでは不利になりやすい。", "状態異常は効くが通常敵より短時間で切れることが多い。地形と道具を組み合わせよう。"] },
  special_floor: { title: "特殊なフロア", trigger: "通常と異なる構造のフロアへ初めて入る", text: ["この階は大部屋・迷路・洞窟など、通常とは違う構造になっている。", "敵の全滅は必須ではない。階段までの経路と退路を先に確保し、構造に合う戦い方を選ぼう。"] },
  statue: { title: "石像", trigger: "石像を調べる、または石像へ移動しようとする", text: ["石像は歩いてぶつかっても壊れない。投擲・矢・杖などの攻撃や有害効果で破壊できる。", "通常破壊では道具と敵が出るが、爆発で壊すと何も出ず消滅する。"] },
  vent: { title: "風穴", trigger: "風穴の上へ乗る", text: ["風穴の近くでは、矢・石・投げた道具などの物理飛び道具が風向きへ曲げられる。", "杖や魔法弾は風の影響を受けない。風向きを利用すれば、直線上にいない相手も狙える。"] },
  hidden_room: { title: "隠し部屋・宝物庫", trigger: "隠し部屋または宝物庫を発見する", text: ["隠し部屋には珍しい道具や金貨が置かれているが、罠や敵も潜んでいる。", "入口と退路を確認し、罠探しをしてから中身を回収しよう。"] },
  item_mimic: { title: "アイテムモドキ", trigger: "床の道具に化けた敵が正体を現す", text: ["床の道具に見えても、拾おうとした瞬間に襲ってくる敵がいる。正体を現したターンはその場で反撃する。", "離れた場所から攻撃や爆発を当てれば、偽物ごと先に処理できる。"] },
  item_lost: { title: "道具・金貨を奪われた", trigger: "敵や罠に道具・金貨を盗まれる、または弾き飛ばされる", text: ["奪われた道具や金貨は、盗んだ敵を倒すと取り戻せる場合がある。罠で飛んだ道具は同じ階のどこかにある。", "護盗の鎧は盗みや弾き飛ばしを防ぐ。大事な道具を失ったら階段を使う前に探そう。"] },
  item_destroyed: { title: "道具の消失・水濡れ", trigger: "炎・爆発・水などで所持品や床の道具が失われる、または白紙になる", text: ["炎・爆発・水・雷などは、直接ダメージだけでなく道具を壊したり変質させたりする。", "耐火・耐水・雷耐性の防具なら対応する所持品被害を防げる。危険属性に合わせて装備を替えよう。"] },
  time_bomb: { title: "時限爆弾", trigger: "時限爆弾の罠が作動する", text: ["時限爆弾は表示された残りターン後、中心から2マスの5×5範囲を爆破する。", "爆心地から離れるか、作動済みのマスへ薬液をかけて消火しよう。"] },
  reflection: { title: "反射", trigger: "投擲物・矢・杖・魔法などが反射される", text: ["一部の敵や装備は飛び道具・魔法を跳ね返す。強力な一撃ほど、攻撃者へ返った時の被害も大きい。", "敵の反射なら近接攻撃へ切り替えるか、封印して能力を止めよう。遠投中は反射されない攻撃もある。"] },
  revival: { title: "復活", trigger: "自分や敵が復活する、または復活する骨が残る", text: ["復活の魔方陣、残りMP、敵の骨など、HPが0になっても戻る手段がある。", "呪われた復活の魔方陣は同じ部屋の復活を封じる。敵の骨は上に立てば復活を先延ばしでき、投擲物や炎の杖などで壊せる。"] },
  fake_stair: { title: "偽階段", trigger: "階段に化けた罠を踏む", text: ["階段に見えていたものが罠へ変化した。本物の階段と同じ見た目の罠が紛れていることがある。", "怪しい階段は周囲から罠探しを行うか、遠距離の効果で確かめよう。"] },
  shop_theft: { title: "泥棒扱い", trigger: "未払いの商品を持って店外へ出る", text: ["未払いの商品を持って店を出たため、店主と警備員が敵対した。階を移動しても追跡は続く。", "通常の買い物には戻せない。逃げ切るか、戦う覚悟で出口を目指そう。"] },
  equipment_broken: { title: "装備の劣化・破損", trigger: "装備が錆びる、または耐久を使い切って壊れる", text: ["錆は武器・防具の＋値を下げる。穴掘り能力を持つ武器は壁を掘るたび耐久を消費する。", "劣化しない能力を持つ装備もある。予備装備を残し、重要な武器の耐久を使い切らないようにしよう。"] },
  long_stay: { title: "長居の危険", trigger: "同じ階に1000ターン以上滞在し、長居専用の強敵が現れる", text: ["同じ階に長く留まりすぎると、通常出現とは別に非常に強い追跡者が現れ続ける。", "稼ぎ続けるほど危険になる。目的を済ませたら次の階へ進もう。"] },
  forced_move: { title: "強制移動", trigger: "敵や罠に吹き飛ばされる、引き寄せられる、または位置を変えられる", text: ["吹き飛ばしや引き寄せは、壁への衝突や別の罠への着地を引き起こす。", "体幹の指輪は多くの強制移動を防ぐ。敵との向きや周囲の地形も意識しよう。"] },
  elemental_combat: { title: "属性弱点", trigger: "炎・氷・雷などの弱点特効を初めて発生させる", text: ["敵の弱点に合う属性はダメージを大きく増やす。反対に耐性を持つ敵には効きにくい。", "油まみれは炎を強化し、ずぶ濡れは炎を弱めて雷を強化する。状態と属性を組み合わせよう。"] },
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

const IDENTIFIED_TYPES = new Set(["potion", "scroll", "wand", "ring", "pen", "spellbook", "pot"]);

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

const SPECIAL_FLOOR_TYPES = new Set(["bigRoom", "middleRoom", "miniRoom", "shoppingMall", "spinFloor", "corridorFloor", "gridRoom", "treasureRoom", "ringCorridorFloor", "caveFloor"]);

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
  if ((p.sealedTurns || 0) > 0 || (p.mpCooldownTurns || 0) > 0 || (p.mpSealTurns || 0) > 0) keys.push("magic_seal");
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
  { key: "revival", pattern: /復活の魔方陣の力|として復活|骨から.*復活|骨が残った/ },
  { key: "statue", pattern: /石像がある/ },
  { key: "vent", pattern: /風穴がある/ },
  { key: "forced_move", pattern: /吹き飛ばされた|引き寄せられ|場所を入れ替えられ/ },
  { key: "elemental_combat", pattern: /弱点特効|弱点×|雷弱点！|油まみれ×2/ },
]);

export function getFirstEncounterMessageTipKeys(messages) {
  const text = (messages || []).map((message) => typeof message === "string" ? message : message?.text || "").join("\n");
  return FIRST_ENCOUNTER_MESSAGE_RULES.filter(({ pattern }) => pattern.test(text)).map(({ key }) => key);
}
