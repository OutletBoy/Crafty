// ---- Bowl meter (r14) ----
// Research, sources and the full design: docs/bowl-meter-design.md in the project folder (kept off the site).
// One number per bowl, D ("how drained", natural-log units), sets every temperature level at once:
// - Hotter drains faster: x1.26 per 5 °F step. THC's vapor pressure rises about 2.3x per 10 °C (NIST, Lovestead & Bruno 2017).
// - Each puff takes a share of what's left (Carrara et al. 2020, Mighty at 210 °C), so a level runs out gradually.
// - A level is spent when D reaches its done line, which sits a step higher for each hotter level. That's why a bowl
//   that's spent at 365 still gives vapor at 390.
// The Crafty doesn't report draws, so time at the chamber's real temperature stands in for them. The "No more vapor"
// tap corrects the bowl on screen and teaches the page your pace.
const BMC = {
  ref: (370 - 32) / 1.8,      // 370 °F, the level the starting pace is set at
  slope: Math.log(2.3) / 10,  // per °C, from THC's vapor pressure
  done0: Math.log(10),        // spent when vapor is down to a tenth of a fresh bowl's (an assumption; taps correct it)
  defMin: 6,                  // a fresh bowl held at 370 °F reads spent after about 6 minutes, until taps say otherwise
  floor: 150,                 // °C; below this next to nothing comes off, so it isn't counted
  reheat: 3 * 60000,          // heating up again within 3 minutes carries the bowl on (unless its level was spent)
  keep: 15 * 60000            // a saved bowl older than this isn't picked up again after a reload
};
// The levels shown: 360 to 410 °F in 5° steps (410 °F is the Crafty's 210 °C top). Display only: the model is continuous.
const BANDS = [360, 365, 370, 375, 380, 385, 390, 395, 400, 405, 410].map(f => Math.min(LIM.MAX, (f - 32) / 1.8));

// What the meter has learned about your pace (k: how fast D grows per minute at 370 °F), checked against sensible ranges
const BML0 = { k: BMC.done0 / BMC.defMin, taps: 0, log: [] };
function cleanMeter(j) {
  const m = { ...BML0, log: [] };
  if (!j || typeof j !== "object") return m;
  m.k = num(j.k, m.k, 0.05, 3); m.taps = Math.round(num(j.taps, 0, 0, 1e5));
  if (Array.isArray(j.log)) m.log = j.log.filter(x => x && isFinite(x.T) && isFinite(x.E) && isFinite(x.ts)).slice(-50)
    .map(x => ({ T: num(x.T, BMC.ref, LIM.MIN, LIM.MAX), E: num(x.E, 1, 0, 600), ts: x.ts, kind: x.kind === "still" ? "still" : "spent" }));
  return m;
}
let BL = cleanMeter(store.json(KEY.meter));
const saveMeter = () => store.set(KEY.meter, BL);
// Before your first tap, your usual session length (once there are 3) sets the pace, minus about a minute of heat-up
const paceK = () => BL.taps || M.sessions < 3 ? BL.k : clamp(BMC.done0 / clamp(M.sessMin - 1, 3, 15), 0.05, 3);
// Strains and batches (r15) learn their own pace on top of this one. Each level leans on the one above it until it has
// taps of its own: with n taps it counts n/(n+3), so a new batch starts on its strain's pace, and a new strain on yours.
const blendK = (own, n, parent) => n > 0 ? Math.exp((n / (n + 3)) * Math.log(own) + (3 / (n + 3)) * Math.log(parent)) : parent;
const strainPace = s => s ? blendK(s.k, s.taps, paceK()) : paceK();
const batchPace = (s, b) => b ? blendK(b.k, b.taps, strainPace(s)) : strainPace(s);
const paceNow = () => { const { s, b } = activeSB(); return batchPace(s, b); };

// The bowl in the chamber. E: minutes of use at 370 °F pace (what learning compares against). spent: levels already announced.
const BM = { D: 0, E: 0, rough: false, endedAt: 0, spent: [] };
{
  const b = store.json(KEY.bowl), m = b && b.meter;
  if (m && typeof m === "object" && isFinite(b.ts) && nowMs() - b.ts < BMC.keep) {
    BM.D = num(m.D, 0, 0, 50); BM.E = num(m.E, 0, 0, 600); BM.rough = m.rough === true;
    BM.endedAt = num(m.endedAt, 0, 0, b.ts); BM.spent = Array.isArray(m.spent) ? m.spent.filter(x => isFinite(x)).slice(0, BANDS.length) : [];
  }
}
const bmSaved = () => ({ D: +BM.D.toFixed(4), E: +BM.E.toFixed(4), rough: BM.rough, endedAt: BM.endedAt, spent: BM.spent });
const rateAt = Tc => Math.exp(BMC.slope * (Tc - BMC.ref));
const doneLine = Tc => Math.max(0.2, BMC.done0 + BMC.slope * (Tc - BMC.ref));
const levelFill = Tc => clamp(BM.D / doneLine(Tc), 0, 1);
const spentTo = () => BMC.ref + (BM.D - BMC.done0) / BMC.slope; // °C: the hottest level that's spent
const bandNear = Tc => BANDS.reduce((best, b, i) => Math.abs(b - Tc) < Math.abs(BANDS[best] - Tc) ? i : best, 0);

// Every second the heater's on, from fcTick. Heat-up counts too, at its lower rate, because the reading is the real temperature.
function bmTick(dt) {
  if (!F.heaterOn || S.current == null || S.current < BMC.floor) return;
  const r = rateAt(Math.min(S.current, LIM.MAX + 5));
  BM.E += r * dt; BM.D += paceNow() * r * dt;
  bmNotice();
}
// The page slept with the heater on: count the gap at the last temperature, up to 10 minutes, and say the meter is rough
function bmGap(dt) {
  if (!F.heaterOn || S.current == null || S.current < BMC.floor) return;
  const r = rateAt(Math.min(S.current, LIM.MAX + 5)), m = Math.min(dt, 10);
  BM.E += r * m; BM.D += paceNow() * r * m; BM.rough = true;
  bmNotice();
}
// Says once per level per bowl when the level you're at runs out
function bmNotice() {
  if (S.target == null) return;
  const T = effTarget(), i = bandNear(T);
  if (levelFill(T) < 1 || BM.spent.includes(i)) return;
  BM.spent.push(i);
  if (followOwns()) return; // Follow the bowl steps up and says so itself
  const up = BANDS.find(b => b > T + 0.5);
  toast(up ? `${fmt(T)}° is about spent. Go up to ${fmt(up)}° for more.` : `${fmt(T)}° is about spent, and that's the top. Time for a new bowl.`, 5000);
  buzz([8, 60, 8]);
}
function freshBowl() { BM.D = 0; BM.E = 0; BM.rough = false; BM.endedAt = 0; BM.spent = []; }
// Says whether this heat-up is a new bowl (true) or the same one carried on (false)
// Heater on: a new bowl, unless it's a quick reheat of a bowl whose level isn't spent yet
function bmHeater(on, t) {
  if (!on) { BM.endedAt = t; return false; }
  const quick = BM.endedAt && t - BM.endedAt < BMC.reheat && BM.D > 0;
  if (quick && S.target != null && levelFill(effTarget()) < 1) {
    BM.endedAt = 0;
    toast("Same bowl carried on.", 5000, { label: "New bowl", fn: bmNewBowl });
    return false;
  }
  freshBowl();
  return true;
}
// In Follow the bowl, a new bowl also goes back to the start temp (and Undo goes back to where you were)
function bmNewBowl() {
  const old = { ...BM, spent: [...BM.spent] }, oldT = S.target, fol = following();
  freshBowl(); if (fol) freshClimb(); fcSave(); render();
  toast("New bowl.", 5000, { label: "Undo", fn: () => { Object.assign(BM, old); if (fol && oldT != null) setTarget(oldT, 0); fcSave(); render(); } });
}
// One tap's update to a pace, in log space so a tap can't swing it more than 4x, and never outside 0.05 to 3
function learnStep(k0, seen, weight) {
  const s = clamp(seen, k0 / 4, k0 * 4);
  return clamp(Math.exp((1 - weight) * Math.log(k0) + weight * Math.log(s)), 0.05, 3);
}
// A tap teaches your overall pace, and the strain and batch in use (each starting from what it leaned on before)
function learnPace(seen, weight) {
  const { s, b } = activeSB(), ps = s && strainPace(s), pb = b && batchPace(s, b);
  BL.k = learnStep(paceK(), seen, weight);
  if (s) { s.k = learnStep(ps, seen, weight); s.taps++; }
  if (b) { b.k = learnStep(pb, seen, weight); b.taps++; }
  if (s) saveStrains();
}
const bmSnapshot = () => ({ BL: JSON.parse(JSON.stringify(BL)), BM: { ...BM, spent: [...BM.spent] }, ST: JSON.stringify(ST) });
const bmRestore = s => { BL = s.BL; Object.assign(BM, s.BM); ST = cleanStrains(JSON.parse(s.ST)); saveMeter(); saveStrains(); fcSave(); render(); };
function bmLog(T, kind) { BL.taps++; BL.log.push({ T: +T.toFixed(1), E: +BM.E.toFixed(3), ts: nowMs(), kind }); if (BL.log.length > 50) BL.log.shift(); }
// "No more vapor": the level you're at is spent right now
function bmSpent(confirmed) {
  if (!S.connected || S.target == null) return;
  if (!F.heaterOn) { toast("Turn the heater on first. The meter learns from a bowl in use.", 3500); return; }
  if (BM.E < 0.5 && !confirmed) { toast("This bowl has only just started. Mark it spent anyway?", 6000, { label: "Spent", fn: () => bmSpent(true) }); return; }
  const T = effTarget(), line = doneLine(T), snap = bmSnapshot();
  learnPace(line / Math.max(BM.E, 0.05), 0.3);
  bmLog(T, "spent");
  BM.D = line; BM.rough = false;
  for (let i = 0; i < BANDS.length; i++) if (BANDS[i] <= T + 0.5 && !BM.spent.includes(i)) BM.spent.push(i);
  saveMeter(); fcSave(); render(); buzz(8);
  const up = BANDS.find(b => b > T + 0.5);
  toast(`Got it, ${fmt(T)}° is spent.` + (up ? ` Up to ${fmt(up)}° for more.` : ""), 7000, { label: "Undo", fn: () => bmRestore(snap) });
}
// "Still vapor": the meter says this level is spent but it isn't yet. Follow the bowl's "Not yet" lands here too (quiet).
function bmStill() {
  if (!S.connected || S.target == null || !F.heaterOn) return;
  bmStillAt(effTarget(), false);
}
function bmStillAt(T, quiet) {
  const line = doneLine(T);
  if (BM.D < line) return;
  const snap = bmSnapshot();
  learnPace((line - 0.1) / Math.max(BM.E, 0.05), 0.15);
  bmLog(T, "still");
  BM.D = line - 0.1; BM.rough = false;
  BM.spent = BM.spent.filter(i => BANDS[i] < T - 0.5);
  saveMeter(); fcSave(); render(); buzz(6);
  if (!quiet) toast(`Got it, ${fmt(T)}° still has some left.`, 6000, { label: "Undo", fn: () => bmRestore(snap) });
}

// The Bowl tile: what's spent, a segment per level, and the level you're at
function renderBowl() {
  const on = S.connected, bands = $("bmBands");
  if (!bands.children.length) bands.replaceChildren(...BANDS.map(() => document.createElement("i")));
  const T = S.target == null ? null : effTarget(), cur = T == null ? -1 : bandNear(T);
  BANDS.forEach((b, i) => {
    const el = bands.children[i], f = levelFill(b);
    put(el, "--f", f.toFixed(3));
    put(el, "class", (f >= 1 ? "done" : "") + (i === cur ? " cur" : ""));
  });
  put($("bmLo"), "text", fmt(BANDS[0]) + "°"); put($("bmHi"), "text", fmt(BANDS[BANDS.length - 1]) + "°");
  const to = spentTo();
  put($("bmMain"), "text", BM.D <= 0 ? "Fresh" : to < BANDS[0] - 0.4 ? "Nothing spent yet" : to >= LIM.MAX - 0.3 ? "Spent at every level" : `Spent to ${fmt(to)}°`);
  const pct = T == null ? null : Math.floor(levelFill(T) * 100);
  put($("bmSub"), "text", !on ? "Connect to track the bowl"
    : T == null ? "Reading the Crafty…"
    : !F.heaterOn && BM.D <= 0 ? "Heat up a bowl to start"
    : `${fmt(T)}° level ${pct}%` + (pct >= 100 ? " · go up for more" : "") + (BM.rough ? " · rough after a gap" : ""));
  put($("bmConf"), "hidden", BL.taps >= 3);
  put($("bmSpent"), "disabled", !on || T == null || !F.heaterOn);
  put($("bmStill"), "hidden", !on || T == null || !F.heaterOn || levelFill(T) < 1);
  put($("bmNew"), "disabled", !on || BM.D <= 0);
  renderStrBtn();
}
