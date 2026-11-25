#!/usr/bin/env node
// Makes src/js/19a-strain-data.js, the strain list built into the page (r17). Node only, no packages to install.
//   node src/tools/make-strain-data.js <ci-strains-pro raw-data.csv> <kushy strains csv>
// Sources (both free to share; the credits below go into the page and the site README):
//   Cannabis Intelligence Database by Shannon Goddard, https://github.com/Shannon-Goddard/ci-strains-pro, CC BY 4.0
//     (raw-data.csv). Seed-bank listings: effects, flavors and terpenes, often several listings per strain.
//   Kushy Cannabis Dataset, https://github.com/kushyapp/cannabis-dataset, MIT, (c) 2016-present Kushy
//     (Dataset/Strains/strains-kushy_api.2017-11-14.csv). Effects and flavors for about 1,000 strains.
// What changes from the sources: free text is reduced to a fixed word list (below), listings of the same strain are
// merged (a word must come up in enough of them to count), side effects (dry mouth, paranoid...) are left out because
// nearly every strain lists them, and strains with no effects, flavors or terpenes at all are dropped.
// The raw CSVs are not kept in the repository (14 MB); only the packed result is.
'use strict';
const fs = require('fs'), path = require('path');

// ---- The word lists. Order is the order of the index letters, so only add to the end. ----
// [shown word, pattern that finds it in the source text]
const EFFECTS = [
  ['Happy', /\bhapp(y|iness)\b/], ['Relaxed', /\b(relax(ed|ing|ation)?|calm(ing)?|soothing|chill)\b/], ['Euphoric', /\beuphori(a|c)\b/],
  ['Uplifted', /\buplift(ed|ing)?\b/], ['Energetic', /\benerg(etic|izing|ising|y)\b/], ['Creative', /\bcreativ(e|ity)\b/],
  ['Focused', /\bfocus(ed)?\b/], ['Sleepy', /\b(sleep(y)?|sedat(ed|ing|ive|ion))\b/], ['Hungry', /\b(hungry|munchies|appetite)\b/],
  ['Talkative', /\b(talkative|sociable|social|chatty)\b/], ['Giggly', /\bgiggl(y|e|es|ing)\b/], ['Tingly', /\btingl(y|e|ing)\b/],
  ['Aroused', /\b(arous(ed|al)|horny)\b/], ['Couch-lock', /\bcouch[- ]?lock(ed)?\b/], ['Cerebral', /\b(cerebral|heady)\b/],
];
const FLAVORS = [
  ['Earthy', /\bearth(y)?\b/], ['Sweet', /\b(sweet|sugary)\b/], ['Citrus', /\b(citrus|citric)\b/], ['Lemon', /\blemon(y)?\b/],
  ['Lime', /\blime\b/], ['Orange', /\b(orange|tangerine|mandarin)\b/], ['Grapefruit', /\bgrapefruit\b/], ['Berry', /\b(berry|berries)\b/],
  ['Blueberry', /\bblueberr(y|ies)\b/], ['Strawberry', /\bstrawberr(y|ies)\b/], ['Grape', /\bgrapes?\b/], ['Pine', /\b(pine|piney|forest)\b/],
  ['Pineapple', /\bpineapple\b/], ['Skunky', /\bskunk(y)?\b/], ['Diesel', /\b(diesel|fuel|gas(sy)?|chem)\b/], ['Peppery', /\bpepper(y)?\b/],
  ['Spicy', /\bspic(y|e|es)\b/], ['Herbal', /\b(herbal|herbs?|grassy|sage)\b/], ['Woody', /\b(wood(y)?|sandalwood|cedar)\b/],
  ['Floral', /\b(floral|flowery|flowers?)\b/], ['Fruity', /\bfruit(y|s)?\b/], ['Tropical', /\btropical\b/], ['Mango', /\bmango\b/],
  ['Sour', /\b(sour|tart|acidic)\b/], ['Pungent', /\b(pungent|dank|funk(y)?)\b/], ['Cheese', /\bchees(e|y)\b/], ['Chocolate', /\bchocolate\b/],
  ['Coffee', /\bcoffee\b/], ['Vanilla', /\bvanilla\b/], ['Mint', /\b(mint(y)?|menthol)\b/], ['Honey', /\bhoney\b/], ['Lavender', /\blavender\b/],
  ['Rose', /\brose\b/], ['Cherry', /\bcherr(y|ies)\b/], ['Apple', /\bapples?\b/], ['Peach', /\bpeach(y|es)?\b/], ['Banana', /\bbananas?\b/],
  ['Melon', /\bmelon\b/], ['Candy', /\b(candy|bubble ?gum)\b/], ['Creamy', /\bcream(y)?\b/], ['Nutty', /\bnut(ty|s)?\b/], ['Hash', /\bhash(y)?\b/],
  ['Tea', /\btea\b/], ['Tobacco', /\btobacco\b/], ['Ammonia', /\bammonia\b/], ['Chemical', /\bchemical\b/], ['Butter', /\bbutter(y)?\b/],
  ['Caramel', /\bcaramel\b/], ['Cinnamon', /\bcinnamon\b/], ['Pear', /\bpears?\b/], ['Plum', /\bplums?\b/], ['Coconut', /\bcoconut\b/],
  ['Incense', /\bincense\b/], ['Musky', /\bmusk(y)?\b/], ['Garlic', /\bgarlic\b/], ['Papaya', /\bpapaya\b/],
];
const TERPENES = [
  ['Myrcene', /\bmyrcene\b/], ['Caryophyllene', /caryophyll?ene\b/], ['Limonene', /\blimonene\b/], ['Pinene', /\bpinene\b/],
  ['Linalool', /\blinalool\b/], ['Humulene', /\bhumulene\b/], ['Terpinolene', /\bterpinolene\b/], ['Ocimene', /\bocimene\b/],
  ['Phellandrene', /\bphellandrene\b/], ['Carene', /\b(delta[- ]?3[- ]?)?carene\b/], ['Camphene', /\bcamphene\b/], ['Bisabolol', /\bbisabolol\b/],
  ['Valencene', /\bvalencene\b/], ['Sabinene', /\bsabinene\b/], ['Geraniol', /\bgeraniol\b/], ['Terpineol', /\bterpineol\b/],
  ['Nerolidol', /nerolidol\b/], ['Eucalyptol', /\beucalyptol\b/], ['Borneol', /\bborneol\b/], ['Pulegone', /\bpulegone\b/],
];
const CAP = { effects: 6, flavors: 6, terps: 5 };
// One letter per word in a list, so a list of up to 62 words packs into one character each
const LETTERS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
for (const L of [EFFECTS, FLAVORS, TERPENES]) if (L.length > LETTERS.length) throw new Error('A word list is longer than the letters to index it');

// Must stay the same as dataKey() in src/js/20-strains.js (tests check every name in the list finds itself)
const VARIANT = new Set(['auto', 'autos', 'autoflower', 'autoflowering', 'automatic', 'feminized', 'feminised', 'fem', 'fems', 'regular', 'reg',
  'fast', 'version', 'flowering', 'photoperiod', 'f1', 'seeds', 'seed', 'strain', 'xl']);
function dataKey(name) {
  const w = String(name || '').toLowerCase().normalize('NFKD').replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
  while (w.length > 1 && VARIANT.has(w[w.length - 1])) w.pop();
  return w.join('');
}

// A small CSV reader (quotes, doubled quotes and line breaks inside quotes)
function readCsv(file) {
  const t = fs.readFileSync(file, 'utf8'), rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const real = v => typeof v === 'string' && v.trim() && !/^(null|nan|none|n\/a|\[\]|0)$/i.test(v.trim()) && /[a-z]/i.test(v);
// The words of a list found in a piece of source text, in the order they appear
function wordsIn(list, text) {
  if (!real(text)) return [];
  const t = text.toLowerCase().replace(/[_]/g, ' ');
  return list.map(([w, re], i) => { const m = t.match(re); return m ? { i, at: m.index } : null; }).filter(Boolean).sort((a, b) => a.at - b.at).map(x => x.i);
}
function cleanName(n) { return String(n || '').replace(/[<>`\\|~\n\r\t"]/g, '').replace(/\s+/g, ' ').trim(); }

function main([ciFile, kushyFile, outFile]) {
  if (!ciFile || !kushyFile) { console.log('Usage: node src/tools/make-strain-data.js <ci raw-data.csv> <kushy strains csv> [out.js]'); process.exit(1); }
  const out = outFile || path.join(__dirname, '..', 'js', '19a-strain-data.js');
  const by = new Map(); // key -> { names: Map(display -> count), rows: { effects: [], flavors: [], terps: [] }, plain: bool }
  const add = (name, eff, fla, ter, weight) => {
    const disp = cleanName(name), key = dataKey(disp);
    if (!key || disp.length > 40 || !/[a-z]/i.test(disp)) return;
    const e = wordsIn(EFFECTS, eff), f = wordsIn(FLAVORS, fla), t = wordsIn(TERPENES, ter);
    if (!e.length && !f.length && !t.length) return;
    let s = by.get(key);
    if (!s) by.set(key, s = { names: new Map(), lists: { effects: [], flavors: [], terps: [] } });
    // A name without "Auto", "Feminized"... is preferred for showing
    const plain = dataKey(disp) === String(disp).toLowerCase().normalize('NFKD').replace(/&/g, ' and ').replace(/[^a-z0-9]/g, '');
    s.names.set(disp, (s.names.get(disp) || 0) + (plain ? 10 : 1) * weight);
    for (const [k, v] of [['effects', e], ['flavors', f], ['terps', t]]) if (v.length) for (let w = 0; w < weight; w++) s.lists[k].push(v);
  };
  const kushy = readCsv(kushyFile), ci = readCsv(ciFile);
  for (const r of kushy) add(r.name, r.effects, r.flavor, r.terpenes, 2); // Kushy first: its order wins ties
  for (const r of ci) add(r.strain_name_display || r.strain_name_original, r.effects, r.flavors, r.terpenes, 1);
  // Merge each strain's listings: a word counts when it comes up in enough of them, most-mentioned first
  const merge = (lists, cap) => {
    const n = lists.length, count = new Map(), first = new Map();
    lists.forEach((l, li) => l.forEach((x, p) => { count.set(x, (count.get(x) || 0) + 1); if (!first.has(x)) first.set(x, li * 100 + p); }));
    const need = n >= 5 ? Math.ceil(n * 0.15) : 1;
    return [...count].filter(([, c]) => c >= need).sort((a, b) => b[1] - a[1] || first.get(a[0]) - first.get(b[0])).slice(0, cap).map(([x]) => x);
  };
  const entries = [];
  for (const [key, s] of by) {
    const name = [...s.names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const e = merge(s.lists.effects, CAP.effects), f = merge(s.lists.flavors, CAP.flavors), t = merge(s.lists.terps, CAP.terps);
    if (!e.length && !f.length && !t.length) continue;
    entries.push({ key, line: [name, e.map(i => LETTERS[i]).join(''), f.map(i => LETTERS[i]).join(''), t.map(i => LETTERS[i]).join('')].join('|') });
  }
  entries.sort((a, b) => a.key.localeCompare(b.key));
  const data = entries.map(x => x.line).join('\n');
  const js = `// ---- The built-in strain list (r17), made by src/tools/make-strain-data.js; don't edit by hand ----
// ${entries.length} strains: effects, flavors and terpenes, so a strain's boxes fill in with nothing sent anywhere.
// Sources, reduced to fixed word lists and merged (see the tool for exactly what changed):
//   Cannabis Intelligence Database by Shannon Goddard, https://github.com/Shannon-Goddard/ci-strains-pro,
//   licensed under CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
//   Kushy Cannabis Dataset, https://github.com/kushyapp/cannabis-dataset, MIT License, Copyright (c) 2016-present, Kushy.
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
//   rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
//   persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice
//   and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS
//   PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
// Each line: name|effects|flavors|terpenes, each list one letter per word, the letter's place in SD_WORDS.
const SD_WORDS = ${JSON.stringify({ effects: EFFECTS.map(x => x[0]), flavors: FLAVORS.map(x => x[0]), terps: TERPENES.map(x => x[0]) })};
const SD_VARIANT = ${JSON.stringify([...VARIANT])};
const SD_DATA = ${JSON.stringify(data)};
`;
  if (/<\/script/i.test(js)) throw new Error('The data would end the page script early');
  fs.writeFileSync(out, js);
  console.log(`${entries.length} strains, ${(Buffer.byteLength(js) / 1024).toFixed(1)} KB -> ${out}`);
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { dataKey, readCsv, wordsIn };
