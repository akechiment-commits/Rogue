import fs from "fs";

/** [name, rarity, weight] */
const CHANGES = [
  ["罠のペン", "C", 4],
  ["石飛ばしのペン", "C", 4],
  ["明かりのペン", "C", 4],
  ["テレポートの巻物", "D", 8],
  ["壁崩しの巻物", "C", 4],
  ["護盗の鎧", "C", 4],
  ["武器強化の巻物", "B", 2],
  ["防具強化の巻物", "B", 2],
  ["収納上手の巻物", "B", 2],
  ["自爆の巻物", "B", 2],
  ["プレートメイル", "B", 2],
  ["変換の巻物", "B", 2],
  ["透視の指輪", "A", 1],
  ["感知の指輪", "A", 1],
  ["買い物上手の指輪", "A", 1],
  ["聖域のペン", "A", 1],
  ["囮のペン", "A", 1],
  ["下手投げの指輪", "E", 12],
  ["魔物呼びの指輪", "D", 8],
  ["呪いの杖", "A", 1],
  ["呪いの壺", "A", 1],
  ["保存の壺", "C", 4],
  ["壁抜けの魔法書", "A", 1],
  ["透明の魔法書", "A", 1],
  ["識別の魔法書", "C", 4],
  // 据え置き確認用コメント:
  // 物知りの杖 D, 識別の巻物 D, 爆発の指輪 A
];

let s = fs.readFileSync("items.js", "utf8");

for (const [name, r, w] of CHANGES) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let ok = false;
  // name:"X" ... rarity:"Y", weight:N  (same line or within 250 chars)
  s = s.replace(
    new RegExp(`(name:"${esc}"[\\s\\S]{0,280}?rarity:")[A-Z]+(",\\s*weight:)[0-9.]+`),
    (m, a, b) => {
      ok = true;
      return `${a}${r}${b}${w}`;
    },
  );
  if (!ok) {
    s = s.replace(
      new RegExp(`(name:"${esc}"[\\s\\S]{0,280}?weight:)[0-9.]+(,\\s*rarity:")[A-Z]+`),
      (m, a, b) => {
        ok = true;
        return `${a}${w}${b}${r}`;
      },
    );
  }
  // name: "X" with spaces (rings)
  if (!ok) {
    s = s.replace(
      new RegExp(`(name:\\s*"${esc}"[\\s\\S]{0,280}?rarity:")[A-Z]+(",\\s*weight:)[0-9.]+`),
      (m, a, b) => {
        ok = true;
        return `${a}${r}${b}${w}`;
      },
    );
  }
  console.log(ok ? `OK ${name} → ${r}/${w}` : `FAIL ${name}`);
}

fs.writeFileSync("items.js", s);

// verify
const { ITEMS, WANDS, RINGS, POTS, SPELLBOOKS, RARITY_WEIGHT } = await import("../items.js");
const all = [...ITEMS, ...WANDS, ...RINGS, ...POTS, ...SPELLBOOKS];
const bad = all.filter((i) => i.rarity && RARITY_WEIGHT[i.rarity] !== i.weight);
console.log("weight mismatches", bad.map((i) => `${i.name}:${i.rarity}:${i.weight}`));
for (const [name, r, w] of CHANGES) {
  const it = all.find((i) => i.name === name);
  if (!it) console.log("missing", name);
  else if (it.rarity !== r || it.weight !== w) console.log("wrong", name, it.rarity, it.weight);
  else console.log("check", name, "ok");
}
