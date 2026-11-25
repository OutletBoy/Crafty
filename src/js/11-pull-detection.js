// ---- Pull detection ----
// A pull draws cool air through the chamber, so its temperature dips and then recovers as the heater catches up.
// The detector doesn't assume the reading sits exactly on the target: it waits for the temperature to hold steady
// for 5 s, takes that as the steady level, and counts a pull when the reading drops below it by more than the
// sensor's normal wobble (at least 1.5 °C at Normal sensitivity). Pull strength = the area of the dip (how deep x
// how long), which is roughly the heat the airflow carried off.
const SENS = { low: { k: 1.5, label: "Low" }, normal: { k: 1, label: "Normal" }, high: { k: 0.6, label: "High" } };
let pdSens = "normal";
{ const j = store.json(KEY.pd); if (j && SENS[j.sens]) pdSens = j.sens; }
const PD = { goal: null, settled: false, win: [], base: 0, noise: 0.4, inHit: false, hitStart: 0, area: 0, peak: 0, pend: 0, pendAt: 0, offAt: 0, lastT: null, lastAt: 0, trace: [] };
const pdThr = () => Math.max(0.8, clamp(3 * PD.noise, 1.5, 6) * SENS[pdSens].k);
const liveStrength = () => PD.inHit ? PD.area / (M.typArea || Math.max(PD.area, 1e-6)) : 0;
function pdUnsettle() { if (PD.inHit) pdEnd(nowMs(), false); PD.settled = false; PD.win = []; PD.pend = 0; PD.pendAt = 0; PD.offAt = 0; }
function pdSample(T, t) {
  if (!F.heaterOn || S.target == null) { if (PD.settled || PD.inHit) pdUnsettle(); PD.lastAt = 0; PD.goal = null; return; }
  const goal = effTarget();
  // A new target (yours, a climb step, boost) means heating or cooling, not a pull: wait for it to settle again.
  // Any change counts: one step on a °F Crafty is only 0.56 °C, and Outlet's second test showed a small step
  // leaving the steady level 1 °C too low for the whole test, so nothing was ever counted.
  if (PD.goal == null || Math.abs(goal - PD.goal) > 0.05) { pdUnsettle(); PD.goal = goal; }
  const dt = PD.lastAt ? (t - PD.lastAt) / 1000 : 0, prev = PD.lastT == null ? T : PD.lastT;
  PD.lastAt = t; PD.lastT = T;
  if (dt > 15) pdUnsettle(); // a long gap in readings: start over
  PD.trace.push([t, T, PD.settled ? PD.base : null, PD.inHit]);
  while (PD.trace.length && t - PD.trace[0][0] > 95000) PD.trace.shift();
  if (S.dragging) return;
  if (!PD.settled) {
    PD.win.push([t, T]);
    while (PD.win.length && t - PD.win[0][0] > 8000) PD.win.shift();
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (const [, v] of PD.win) { lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; }
    if (PD.win.length >= 3 && t - PD.win[0][0] >= 5000 && hi - lo <= 2 && T >= goal - 15 && T <= goal + 10) {
      PD.settled = true; PD.base = sum / PD.win.length;
      PD.noise = clamp(PD.win.reduce((a, [, v]) => a + Math.abs(v - PD.base), 0) / PD.win.length, 0.3, 2);
      PD.win = [];
      rec("det", "steady", +PD.base.toFixed(2), +pdThr().toFixed(2), "steady level found");
    }
    return;
  }
  const dip = PD.base - T, thr = pdThr();
  const a = dt * (Math.max(0, PD.base - prev) + Math.max(0, dip)) / 2; // dip area since the last reading
  if (PD.inHit) {
    PD.area += a; PD.peak = Math.max(PD.peak, dip);
    if (dip <= thr * 0.35 || t - PD.hitStart > 45000) pdEnd(t, true);
    return;
  }
  // Small dips are kept track of, so a real pull is measured from its very start
  if (dip > 0.3) { if (!PD.pendAt) PD.pendAt = t - dt * 1000; PD.pend += a; } else { PD.pend = 0; PD.pendAt = 0; }
  if (dip >= thr) {
    PD.inHit = F.inHit = true; PD.hitStart = PD.pendAt || t; PD.area = PD.pend; PD.peak = dip;
    rec("det", "pull start", +dip.toFixed(2), +thr.toFixed(2));
  } else if (Math.abs(dip) < thr / 2) {
    // Follow slow drift (battery sag, room temperature) while nobody's pulling
    PD.base += (T - PD.base) * Math.min(1, dt / 20);
    PD.noise = clamp(PD.noise + (Math.abs(dip) - PD.noise) * Math.min(1, dt / 30), 0.3, 2);
    PD.offAt = 0;
  } else {
    // Readings sitting off the steady level without a pull (above it, or a little below for a long time) mean
    // the level itself moved, which the slow drift above can't follow. Find it again rather than stay wrong.
    if (!PD.offAt) PD.offAt = t;
    if (t - PD.offAt > (dip < 0 ? 10000 : 30000)) { rec("det", "steady level moved", +T.toFixed(2), +PD.base.toFixed(2), "finding it again"); pdUnsettle(); }
  }
}
function pdEnd(t, count) {
  const area = PD.area, dur = t - PD.hitStart, peak = PD.peak, thr = pdThr();
  PD.inHit = F.inHit = false; PD.area = 0; PD.pend = 0; PD.pendAt = 0;
  if (!count) { rec("det", "pull dropped", +area.toFixed(2), "", "interrupted"); return; }
  // Too short and shallow to be a real pull (a bump, a single bad reading)
  if (!(area >= thr * 0.8 && (dur >= 1000 || peak >= 2 * thr))) { rec("det", "pull ignored", +area.toFixed(2), +peak.toFixed(2), `${dur} ms`); return; }
  pullDone(area, t, dur, peak);
}
function pullDone(area, t, dur = 0, peak = 0) {
  const first = !M.typArea, s = first ? 1 : area / M.typArea;
  // Your usual pull: a slow-moving average (on a log scale, so one huge pull can't swamp it)
  M.typArea = first ? area : clamp(Math.exp(Math.log(M.typArea) * 0.85 + Math.log(area) * 0.15), 0.05, 1e4);
  M.pulls++;
  const goal = effTarget();
  // You already tapped Pull for this one: keep it as one pull, now with its measured strength instead of "usual"
  if (TAP.at && !TAP.merged && t - dur >= TAP.at - SAME_PULL && t - dur <= TAP.at + 5000) {
    TAP.merged = true;
    B.p += (s - 1) * extract(goal);
    if (F.sess) { F.sess.pulls += s - 1; F.sess.best = Math.max(F.sess.best, s); }
    F.lastPull = s; F.lastPullAt = t; F.autoAt = t;
    rec("det", "pull counted", +area.toFixed(2), +s.toFixed(2), `${dur} ms, same pull you tapped`);
    lbNote(s, t - dur, t);
    saveSoon(); climbCheck();
    return;
  }
  F.autoAt = t;
  B.hits++; F.sessHits++; F.pred += hitCost(goal);
  B.p += s * extract(goal);
  F.lastPull = s; F.lastPullAt = t; F.lastWasBest = false;
  if (F.sess) { F.sess.pulls += s; F.sess.best = Math.max(F.sess.best, s); }
  if (area > M.bestArea) { const had = M.bestArea > 0; M.bestArea = area; M.bestAt = t; F.lastWasBest = had; }
  rec("det", "pull counted", +area.toFixed(2), +s.toFixed(2), `${dur} ms, deepest ${peak.toFixed(1)} °C`);
  buzz(5);
  gtNote(s, t - dur);
  lbNote(s, t - dur, t);
  saveSoon();
  climbCheck();
}
