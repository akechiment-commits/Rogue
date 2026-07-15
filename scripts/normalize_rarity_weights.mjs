import fs from "fs";

/** weight → { rarity, weight }  同 weight 同 rarity */
function mapRW(w) {
  if (w == null || Number.isNaN(w)) return null;
  if (w <= 0.1) return { rarity: "S", weight: 0.05 };
  if (w < 1.5) return { rarity: "A", weight: 1 };
  if (w < 3) return { rarity: "B", weight: 2 };
  if (w < 6) return { rarity: "C", weight: 4 }; // 4, 5
  if (w < 10) return { rarity: "D", weight: 8 }; // 6, 8
  return { rarity: "E", weight: 12 }; // 12+
}

let src = fs.readFileSync("items.js", "utf8");
let count = 0;

src = src.replace(/rarity\s*:\s*"([A-Z])"\s*,\s*weight\s*:\s*([0-9.]+)/g, (m, r, w) => {
  const nw = mapRW(parseFloat(w));
  count++;
  return `rarity:"${nw.rarity}", weight:${nw.weight}`;
});

src = src.replace(/weight\s*:\s*([0-9.]+)\s*,\s*rarity\s*:\s*"([A-Z])"/g, (m, w, r) => {
  const nw = mapRW(parseFloat(w));
  count++;
  return `weight:${nw.weight}, rarity:"${nw.rarity}"`;
});

const leftovers = [];
for (const line of src.split("\n")) {
  if (!line.includes("rarity:") || !line.includes("weight:")) continue;
  const rm = line.match(/rarity\s*:\s*"([^"]+)"/);
  const wm = line.match(/weight\s*:\s*([0-9.]+)/);
  if (rm && wm) {
    const expected = mapRW(parseFloat(wm[1]));
    if (expected && (rm[1] !== expected.rarity || Math.abs(parseFloat(wm[1]) - expected.weight) > 0.001)) {
      leftovers.push({ line: line.trim().slice(0, 120), expected });
    }
  }
}

fs.writeFileSync("items.js", src);
console.log("replacements", count);
console.log("mismatches", leftovers.length);
leftovers.slice(0, 30).forEach((l) => console.log(JSON.stringify(l)));
