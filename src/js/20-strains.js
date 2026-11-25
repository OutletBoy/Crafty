// ---- Strains and batches (r15) ----
// Kept on this phone only (localStorage, photos in IndexedDB), never in the page itself: the page is public, your strains aren't.
// One strain per name: names match ignoring case, spaces and punctuation, so "Sour Kush" and "sour-kush" are the same strain.
// A strain holds batches (a new bag of the same strain), each with its own THC %, date and photo. THC % is a label only:
// it barely changes how long a bowl lasts (design notes, section 5), so each strain and batch learns its pace from your
// taps instead, leaning on the level above until it has taps of its own (see blendK in the bowl meter).
const STR = { maxStrains: 60, maxBatches: 30, name: 40, label: 24, item: 24, items: 12, list: 20 };
const strKey = n => String(n || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const cleanText = (v, n) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, n) : "";
const okDate = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.trim()) ? d.trim() : "";
const todayStr = () => { const d = new Date(nowMs()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const thcOf = v => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace("%", "").replace(",", ".")); return isFinite(x) && x >= 0 && x <= 100 ? Math.round(x * 100) / 100 : null; };
const newId = p => p + nowMs().toString(36) + Math.random().toString(36).slice(2, 6);
// A list of short words from whatever shape it came in (an array, "a, b, c", or an object of arrays), de-duplicated
function listOf(v) {
  const a = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]/) : v && typeof v === "object" ? Object.values(v).flat() : [];
  const out = [];
  for (let x of a) {
    if (x && typeof x === "object") x = x.name || x.title || "";
    x = cleanText(typeof x === "string" ? x : "", STR.item);
    if (x && !out.some(y => y.toLowerCase() === x.toLowerCase())) out.push(x);
    if (out.length >= STR.items) break;
  }
  return out;
}
function cleanBatch(b, i) {
  return { id: typeof b.id === "string" && b.id ? b.id.slice(0, 40) : newId("b"), label: cleanText(b.label, STR.label) || `Batch ${i + 1}`,
           thc: b.thc == null ? null : thcOf(b.thc), date: okDate(b.date), k: num(b.k, BML0.k, 0.05, 3), taps: Math.round(num(b.taps, 0, 0, 1e5)), photo: b.photo === true };
}
// Each saved strain is checked field by field; a second strain with the same name (by key) is dropped
function cleanStrains(j) {
  const out = { active: { s: null, b: null }, list: [] };
  if (!j || typeof j !== "object" || !Array.isArray(j.list)) return out;
  const keys = new Set(), ids = new Set();
  for (const x of j.list) {
    if (!x || typeof x !== "object" || out.list.length >= STR.maxStrains) continue;
    const name = cleanText(x.name, STR.name), key = strKey(name);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    const bs = [];
    for (const b of Array.isArray(x.batches) ? x.batches : []) {
      if (!b || typeof b !== "object" || bs.length >= STR.maxBatches) continue;
      const c = cleanBatch(b, bs.length); if (ids.has(c.id)) c.id = newId("b"); ids.add(c.id); bs.push(c);
    }
    let id = typeof x.id === "string" && x.id ? x.id.slice(0, 40) : newId("s"); if (ids.has(id)) id = newId("s"); ids.add(id);
    out.list.push({ id, name, effects: listOf(x.effects), terps: listOf(x.terps), flavors: listOf(x.flavors), src: x.src === "StrainAPI" ? "StrainAPI" : "",
                    k: num(x.k, BML0.k, 0.05, 3), taps: Math.round(num(x.taps, 0, 0, 1e5)), batches: bs });
  }
  const a = j.active && typeof j.active === "object" ? j.active : {}, s = out.list.find(x => x.id === a.s);
  if (s) out.active = { s: s.id, b: s.batches.some(b => b.id === a.b) ? a.b : null };
  return out;
}
let ST = cleanStrains(store.json(KEY.strains));
const saveStrains = () => store.set(KEY.strains, ST);
const strainOf = id => ST.list.find(x => x.id === id) || null;
const findStrain = name => { const k = strKey(name); return k ? ST.list.find(x => strKey(x.name) === k) || null : null; };
function activeSB() { const s = strainOf(ST.active.s); return { s, b: (s && s.batches.find(b => b.id === ST.active.b)) || null }; }
const latestBatch = s => (s && s.batches[s.batches.length - 1]) || null;
const thcText = b => b && b.thc != null ? `${b.thc}% THC` : "";
const sbName = () => { const { s, b } = activeSB(); return s ? s.name + (b ? " · " + b.label : "") : ""; };
const newBatch = (s, it = {}) => cleanBatch({ label: `Batch ${s.batches.length + 1}`, thc: it.thc, date: it.date || todayStr() }, s.batches.length);
function newStrain(name, it = {}) {
  const s = { id: newId("s"), name: cleanText(name, STR.name), effects: [], terps: [], flavors: [], src: "", k: BML0.k, taps: 0, batches: [] };
  s.batches.push(newBatch(s, it));
  return s;
}

// Pick the strain (and batch, the newest unless you pick one) you're vaping, or none
function useStrain(sid, bid) {
  const s = strainOf(sid);
  ST.active = s ? { s: s.id, b: (bid && s.batches.some(b => b.id === bid) ? bid : (latestBatch(s) || {}).id) || null } : { s: null, b: null };
  saveStrains();
  if (F.sess) F.sess.strain = sbName();
  render();
}

// ---- Look up a strain on the web ----
// Only the strain's name is sent, to StrainAPI (strainapi.com, a free strain database), and only when you add a strain
// by typing its name or tap Look up. No account, nothing else from the phone. What comes back fills in empty boxes only,
// so it never overwrites anything you typed, and you can edit it all.
const LOOKUP = "https://www.strainapi.com/wp-json/strainapi/v1/search?q=";
let lookSeq = 0;
// Finds the entry whose name matches (same key) in whatever list shape the reply has
function pickHit(j, key) {
  const items = Array.isArray(j) ? j : j && typeof j === "object"
    ? (["data", "results", "strains", "items"].map(k => j[k]).find(Array.isArray) || (j.name ? [j] : Object.values(j).filter(x => x && typeof x === "object")))
    : [];
  for (const it of items.slice(0, 200)) {
    if (!it || typeof it !== "object") continue;
    let name = it.name ?? it.title ?? it.strain; if (name && typeof name === "object") name = name.rendered;
    if (typeof name !== "string" || strKey(name) !== key) continue;
    const hit = { effects: listOf(it.effects ?? it.effect ?? it.feelings), terps: listOf(it.terpenes ?? it.terps ?? it.terpene), flavors: listOf(it.flavors ?? it.flavor ?? it.taste) };
    return hit.effects.length || hit.terps.length || hit.flavors.length ? hit : { empty: true };
  }
  return null;
}
const STFIELDS = [["effects", "stEff"], ["terps", "stTerps"], ["flavors", "stFlav"]];
function lookNote(id, msg) { if (stEdit === id && stView === "strain") $("stLookNote").textContent = msg; }
async function lookUp(id) {
  const s = strainOf(id); if (!s) return;
  if (typeof fetch !== "function") { lookNote(id, "This browser can't look strains up. Fill these in yourself."); return; }
  const seq = ++lookSeq, key = strKey(s.name);
  lookNote(id, `Looking up ${s.name}…`);
  let hit = null, err = false;
  const ctl = typeof AbortController === "function" ? new AbortController() : null, tm = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
  try {
    const r = await fetch(LOOKUP + encodeURIComponent(s.name), { method: "GET", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: ctl ? ctl.signal : undefined });
    if (!r.ok) throw new Error("status " + r.status);
    hit = pickHit(await r.json(), key);
  } catch (e) { err = true; }
  clearTimeout(tm);
  const now = strainOf(id);
  if (seq !== lookSeq || !now) return; // a newer look-up started, or the strain was deleted meanwhile
  if (err) { lookNote(id, "Couldn't reach StrainAPI. Fill these in yourself, or tap Look up again later."); return; }
  if (!hit || hit.empty) { lookNote(id, hit ? `StrainAPI has ${now.name} but no details for it. Fill these in yourself.` : `StrainAPI doesn't know ${now.name}. Fill these in yourself.`); return; }
  let filled = 0;
  const open = stEdit === id && stView === "strain";
  for (const [f, el] of STFIELDS) {
    if (!hit[f].length) continue;
    if (!now[f].length) { now[f] = hit[f]; filled++; }
    if (open && !$(el).value.trim()) { $(el).value = hit[f].join(", "); }
  }
  if (filled) { now.src = "StrainAPI"; saveStrains(); }
  lookNote(id, filled ? "Filled in from StrainAPI. It can be wrong, so edit anything that's off and tap Save." : "Found it on StrainAPI, but you've filled these in already. Clear a box to take StrainAPI's.");
  renderStrain();
}

// ---- Adding a list of strains: a private link or pasted text ----
// Format: Name|THC|date, separated by ";" or new lines, for example "Sour Kush|22.5|2026-11-25;Blue Dream|21".
// A link puts it after "#strains=". The part after # never leaves the phone (browsers don't send it to the website),
// so the list isn't in the page or on GitHub. The page asks before adding, then removes it from the address bar.
function parseStrainList(text) {
  let t = String(text || "").trim();
  try { t = decodeURIComponent(t.replace(/%(?![0-9a-f]{2})/gi, "%25")); } catch (e) {} // a bare "%" (as in 22.5%) is kept as text
  t = t.replace(/^#/, "").replace(/^strains=/i, "");
  const out = [], seen = new Set();
  for (const part of t.split(/[;\n]/)) {
    const [n, thc, date] = part.split("|");
    const name = cleanText(n, STR.name), key = strKey(name), it = { name, thc: thcOf(thc), date: okDate(date) };
    const same = key + "|" + it.thc + "|" + it.date; // the same name again is another batch of it; an exact repeat is skipped
    if (!key || seen.has(same)) continue;
    seen.add(same);
    out.push(it);
    if (out.length >= STR.list) break;
  }
  return out;
}
// A name you already have becomes a new batch of it, unless a batch with that THC % (and date, if given) is already there
function addStrainList(items) {
  let added = 0, batches = 0;
  for (const it of items) {
    const s = findStrain(it.name);
    if (s) {
      if (s.batches.length >= STR.maxBatches || s.batches.some(b => b.thc === it.thc && (!it.date || !b.date || b.date === it.date))) continue;
      s.batches.push(newBatch(s, it)); batches++;
    } else if (ST.list.length < STR.maxStrains) { ST.list.push(newStrain(it.name, it)); added++; }
  }
  return { added, batches };
}
function importStrains(items) {
  const snap = JSON.stringify(ST), r = addStrainList(items);
  clearHash();
  if (!r.added && !r.batches) { toast("You have all of those already.", 3000); return; }
  saveStrains(); renderStrList(); render();
  const msg = [r.added && `${r.added} strain${r.added === 1 ? "" : "s"}`, r.batches && `${r.batches} batch${r.batches === 1 ? "" : "es"}`].filter(Boolean).join(" and ");
  toast(`Added ${msg}.`, 7000, { label: "Undo", fn: () => { ST = cleanStrains(JSON.parse(snap)); saveStrains(); renderStrList(); render(); } });
}
function clearHash() { try { if (/^#strains=/i.test(location.hash || "")) history.replaceState(history.state, "", location.pathname + location.search); } catch (e) {} }
function offerImport() {
  let h = ""; try { h = location.hash || ""; } catch (e) {}
  if (!/^#strains=/i.test(h)) return;
  const items = parseStrainList(h);
  if (!items.length) { clearHash(); return; }
  const uniq = items.filter((x, i) => items.findIndex(y => strKey(y.name) === strKey(x.name)) === i), u = uniq.length;
  const names = uniq.slice(0, 3).map(x => x.name).join(", ") + (u > 3 ? ` and ${u - 3} more` : "");
  toast(`Add ${u} strain${u === 1 ? "" : "s"}${items.length > u ? ` (${items.length} batches)` : ""} from this link? ${names}.`, 20000, { label: "Add", fn: () => importStrains(items) });
}
window.addEventListener("hashchange", offerImport);
function pasteStrains() {
  const items = parseStrainList($("strPaste").value);
  if (!items.length) { toast("Nothing to add. Write Name|THC|date, one strain per line.", 4000); return; }
  $("strPaste").value = "";
  importStrains(items);
}

// ---- The Strains sheet: a list, one strain, one batch ----
let stView = "list", stEdit = null, btEdit = null;
function showStrView(v) {
  stView = v;
  $("strListView").hidden = v !== "list"; $("strView").hidden = v !== "strain"; $("batView").hidden = v !== "batch";
  const s = strainOf(stEdit);
  $("strTitle").textContent = v === "list" ? "Strains" : v === "strain" ? (s ? s.name : "Strain") : "Batch";
}
function openStrains() { renderStrList(); showStrView("list"); showSheet("str"); }
// The newest batch with a photo stands for the strain
const strainPhoto = s => [...s.batches].reverse().find(b => b.photo) || null;
function thumbEl(b) {
  const img = document.createElement("img"); img.className = "thumb"; img.alt = ""; img.hidden = true;
  if (b && b.photo) phUrl(b.id).then(u => { if (u) { img.src = u; img.hidden = false; } });
  return img;
}
function pickRow(on, title, sub, thumb, onPick, onEdit) {
  const row = document.createElement("div"); row.className = "prow" + (on ? " on" : "");
  const pick = document.createElement("button"); pick.className = "pick";
  const dot = document.createElement("i"), txt = document.createElement("span");
  const b = document.createElement("b"); b.textContent = title;
  const sm = document.createElement("small"); sm.textContent = sub;
  txt.append(b, sm); pick.append(dot); if (thumb) pick.append(thumb); pick.append(txt);
  pick.addEventListener("click", onPick);
  row.append(pick);
  if (onEdit) { const ed = document.createElement("button"); ed.className = "btn"; ed.textContent = "Open"; ed.addEventListener("click", onEdit); row.append(ed); }
  return row;
}
function renderStrList() {
  const act = ST.active.s;
  $("strList").replaceChildren(
    pickRow(!act, "No strain", "The bowl meter uses your overall pace", null, () => { useStrain(null); renderStrList(); }, null),
    ...ST.list.map(s => {
      const lb = latestBatch(s);
      const sub = [s.batches.length > 1 ? `${s.batches.length} batches` : "", lb ? [lb.label, thcText(lb)].filter(Boolean).join(" · ") : "No batches", s.taps ? `learned from ${s.taps} tap${s.taps === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
      return pickRow(s.id === act, s.name, sub, thumbEl(strainPhoto(s)), () => { useStrain(s.id); renderStrList(); toast(`Using ${sbName()}.`, 2500); }, () => openStrain(s.id));
    }));
}
function addStrain() {
  const name = cleanText($("strNewName").value, STR.name);
  if (!strKey(name)) { toast("Type the strain's name first.", 2500); return; }
  const have = findStrain(name);
  if (have) { $("strNewName").value = ""; openStrain(have.id); toast(`You already have ${have.name}. Add a new batch to it here.`, 5000); return; }
  if (ST.list.length >= STR.maxStrains) { toast(`That's the limit of ${STR.maxStrains} strains. Delete one first.`, 4000); return; }
  const s = newStrain(name); ST.list.push(s); saveStrains();
  $("strNewName").value = "";
  openStrain(s.id);
  lookUp(s.id); // you typed the name to add it, so it's looked up straight away (name only)
}
function openStrain(id) {
  const s = strainOf(id);
  if (!s) { renderStrList(); showStrView("list"); return; }
  stEdit = id;
  $("stName").value = s.name;
  for (const [f, el] of STFIELDS) $(el).value = s[f].join(", ");
  $("stLookNote").textContent = "";
  renderStrain(); showStrView("strain");
}
// Where a listed terpene is one of the page's terpene picks, say where it boils
function terpHint(list) {
  const hits = TERPS.filter(t => list.some(x => strKey(x).includes(strKey(t.name)) || (t.id === "caryo" && /caryophyl/i.test(x))));
  return hits.length ? "Boils near " + hits.map(t => `${t.name.toLowerCase()} ${fmt(t.c)}°`).join(", ") + ". Starting a little below a terpene's boiling point brings its flavor out first." : "";
}
function renderStrain() {
  const s = strainOf(stEdit);
  if (!s) return;
  $("stSrc").textContent = s.src ? "Effects, terpenes and flavors came from StrainAPI (strainapi.com) and may be wrong. Edit anything that's off." : "";
  $("stSrc").hidden = !s.src;
  $("stTerpHint").textContent = terpHint(listOf($("stTerps").value));
  const act = ST.active;
  $("stBatches").replaceChildren(...[...s.batches].reverse().map(b => pickRow(act.s === s.id && act.b === b.id, b.label,
    [thcText(b), b.date, b.taps ? `learned from ${b.taps} tap${b.taps === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "No details yet",
    thumbEl(b), () => { useStrain(s.id, b.id); renderStrain(); toast(`Using ${sbName()}.`, 2500); }, () => openBatch(s.id, b.id))));
}
function saveStrain() {
  const s = strainOf(stEdit); if (!s) { renderStrList(); showStrView("list"); return; }
  const name = cleanText($("stName").value, STR.name);
  if (!strKey(name)) { toast("A strain needs a name.", 2500); return; }
  const other = findStrain(name);
  if (other && other.id !== s.id) { toast(`You already have ${other.name}. Use a different name, or add a batch to that one.`, 5000); return; }
  s.name = name;
  for (const [f, el] of STFIELDS) s[f] = listOf($(el).value);
  saveStrains(); renderStrList(); showStrView("list"); render();
}
function deleteStrain() {
  const idx = ST.list.findIndex(x => x.id === stEdit); if (idx < 0) return;
  const snap = JSON.stringify(ST), gone = ST.list[idx];
  ST.list.splice(idx, 1);
  if (ST.active.s === gone.id) ST.active = { s: null, b: null };
  saveStrains(); renderStrList(); showStrView("list"); render();
  toast(`Deleted ${gone.name}.`, 7000, { label: "Undo", fn: () => { ST = cleanStrains(JSON.parse(snap)); saveStrains(); renderStrList(); render(); } });
}
function addBatch() {
  const s = strainOf(stEdit); if (!s) return;
  if (s.batches.length >= STR.maxBatches) { toast(`That's the limit of ${STR.maxBatches} batches. Delete an old one first.`, 4000); return; }
  const b = newBatch(s); s.batches.push(b);
  if (ST.active.s === s.id) ST.active.b = b.id; // a new bag of the strain you're using is the one you'll vape next
  saveStrains(); openBatch(s.id, b.id);
}
function openBatch(sid, bid) {
  const s = strainOf(sid), b = s && s.batches.find(x => x.id === bid);
  if (!b) { openStrain(sid); return; }
  stEdit = sid; btEdit = bid;
  $("btLabel").value = b.label; $("btThc").value = b.thc == null ? "" : String(b.thc); $("btDate").value = b.date;
  $("btPhotoNote").textContent = "";
  renderBatchPhoto(); showStrView("batch");
}
const editBatch = () => { const s = strainOf(stEdit); return { s, b: s && s.batches.find(x => x.id === btEdit) }; };
function saveBatch() {
  const { s, b } = editBatch(); if (!b) { openStrain(stEdit); return; }
  const raw = $("btThc").value.trim(), thc = raw ? thcOf(raw) : null;
  if (raw && thc == null) { toast("THC is a percent from 0 to 100, like 23.45.", 3500); return; }
  b.label = cleanText($("btLabel").value, STR.label) || b.label; b.thc = thc; b.date = okDate($("btDate").value);
  saveStrains(); openStrain(s.id); render();
}
function deleteBatch() {
  const { s, b } = editBatch(); if (!b) return;
  const snap = JSON.stringify(ST);
  s.batches.splice(s.batches.indexOf(b), 1);
  if (ST.active.b === b.id) ST.active.b = (latestBatch(s) || {}).id || null;
  saveStrains(); openStrain(s.id); render();
  toast(`Deleted ${b.label}.`, 7000, { label: "Undo", fn: () => { ST = cleanStrains(JSON.parse(snap)); saveStrains(); if (stView === "strain") openStrain(s.id); render(); } });
}
// The strain line on the Bowl tile
let strThumbFor = "";
function renderStrBtn() {
  const { s, b } = activeSB();
  put($("strName"), "text", s ? s.name + (b ? ` · ${b.label}` + (b.thc != null ? ` · ${b.thc}%` : "") : "") : "Pick a strain");
  const pb = s ? (b && b.photo ? b : strainPhoto(s)) : null, want = pb ? pb.id + (PH.ver[pb.id] || 0) : "";
  if (want !== strThumbFor) {
    strThumbFor = want; $("strThumb").hidden = true;
    if (pb) phUrl(pb.id).then(u => { if (u && strThumbFor === want) { $("strThumb").src = u; $("strThumb").hidden = false; } });
  }
}
