// ---- Tap per pull ----
// Outlet's two guided tests (firmware V04.26) showed soft and short pulls barely move the chamber temperature: the
// Crafty holds it within about 1 °C, and its own use detector (the auto-off timer) missed the same pulls. So only
// firm pulls are counted by themselves, and the Pull button logs any other pull as one usual pull. A tap and an
// automatic count of the same pull are merged, never counted twice.
const SAME_PULL = 20000; // the temperature reacts about 8 s after a pull starts, so allow for that
const TAP = { at: 0, merged: false };
function pullTap() {
  if (!heatingNow() || GT.on) return;
  const t = nowMs();
  if (PD.inHit || (F.autoAt && t - F.autoAt < SAME_PULL)) { toast("Already counted that pull.", 2500); buzz(6); return; }
  const goal = effTarget();
  const snap = { p: B.p, hits: B.hits, sessHits: F.sessHits, pred: F.pred, sess: F.sess, pulls: F.sess ? F.sess.pulls : 0, mark: CL.mark };
  B.hits++; F.sessHits++; F.pred += hitCost(goal); B.p += extract(goal);
  if (F.sess) F.sess.pulls += 1;
  F.lastPull = 1; F.lastPullAt = t; F.lastWasBest = false;
  TAP.at = t; TAP.merged = false;
  rec("det", "pull tapped", "", 1, "logged by hand");
  buzz(8); saveSoon();
  toast("Pull logged.", 4000, { label: "Undo", fn: () => {
    // Only while nothing else has been counted since, so an undo can never take back a different pull
    if (TAP.merged) { toast("The Crafty confirmed that pull, so it stays counted.", 3000); return; }
    if (B.hits !== snap.hits + 1 || TAP.at !== t) { toast("Can't undo that one now.", 2500); return; }
    Object.assign(B, { p: snap.p, hits: snap.hits }); F.sessHits = snap.sessHits; F.pred = snap.pred; CL.mark = Math.min(CL.mark, snap.mark);
    if (F.sess && F.sess === snap.sess) F.sess.pulls = snap.pulls;
    TAP.at = 0; F.lastPullAt = 0;
    rec("det", "pull untapped", "", "", "undone by you");
    saveSoon(); render();
  } });
  climbCheck();
  render();
}
const bowlPct = () => clamp(100 * (B.p + liveStrength() * extract(effTarget())) / M.pFull, 0, 100);
const learning = () => M.bowls < 3 || M.pulls < 20;

function fcConnected() {
  const t = nowMs();
  F.last = t; F.pred = 0; F.valid = false; F.prevBatt = S.battery;
  const heating = !!(S.project & BIT.HEATER);
  // Carry on a session held through a dropout or a page reload if the heater is still on and it wasn't long ago
  if (F.sess && heating && t - S.lostAt < CFG.resumeWindow) { F.heaterOn = true; F.atTemp = false; }
  else {
    if (F.sess) logSession(S.lostAt || t, heating ? "connection lost" : "");
    F.heaterOn = heating;
    if (heating) { F.sessStart = t; F.sessHits = 0; F.sess = newSess(t); }
  }
  PD.goal = null; PD.lastAt = 0; pdUnsettle();
  clearInterval(fcTimer);
  fcTimer = setInterval(fcLoop, 1000);
}
async function fcLoop() {
  if (!S.connected) return;
  // The Crafty pushes temperature changes, but a steady temperature sends nothing. While heating, read it once a
  // second if nothing came in, so the detector always has fresh readings. Otherwise every few seconds is enough.
  const stale = nowMs() - (S.seen.current || 0);
  if (!S.dragging && stale > (F.heaterOn ? 1200 : 4000)) { try { apply("current", await read("current"), "read"); } catch (e) {} }
  if (REC.on) recPollDiag();
  fcTick();
  render();
}
const charging = () => !!(S.power & 1);
function fcTick() {
  const t = nowMs(), dt = (t - F.last) / 60000; F.last = t;
  if (dt <= 0) return;
  if (dt > 10 / 60) { F.valid = false; F.pred = 0; return; } // the page was asleep: this stretch can't be measured
  if (!F.heaterOn || S.target == null) return;
  const goal = effTarget(), T = S.current;
  if (F.sess) { F.sess.tMin = Math.min(F.sess.tMin, S.target); F.sess.tMax = Math.max(F.sess.tMax, S.target); }
  if (!F.atTemp && (PD.settled || (T != null && T >= goal - 3))) F.atTemp = true;
  if (!F.atTemp) return; // heat-up is charged as one lump when the heater turns on
  F.pred += holdRate(goal) * dt;
  B.p += dt * extract(goal) * IDLE;
  climbCheck();
  saveSoon();
}
function fcHeater(on) {
  if (!S.connected || on === F.heaterOn) return; // while connecting, fcConnected sets the starting state
  const t = nowMs();
  F.heaterOn = on; F.atTemp = false;
  if (PD.inHit) pdEnd(t, false);
  pdUnsettle(); PD.goal = null;
  if (on) {
    F.sessStart = t; F.sessHits = 0;
    F.sess = newSess(t);
    F.pred += heatUpCost(effTarget(), S.current == null ? AMB : S.current);
    F.last = t;
    // A fresh heat-up starts a new bowl, unless you're just reheating a bowl that's barely touched
    if (!(B.endedAt && t - B.endedAt < 3 * 60000 && B.p / M.pFull < 0.6)) newBowl(true);
    B.endedAt = 0;
  } else {
    const mins = (t - F.sessStart) / 60000;
    if (F.sessStart && mins >= 1.5) {
      M.sessMin = clamp(M.sessMin * 0.7 + mins * 0.3, 2, 20);
      M.hits = clamp(M.hits * 0.7 + F.sessHits * 0.3, 0, 40);
      M.sessions++;
      // Assume a session you end yourself finished the bowl, so the bar learns what "done" looks like
      if (F.sessHits >= 3 && mins >= 2) { M.pFull = clamp(M.pFull * 0.75 + B.p * 0.25, 4, 40); M.bowls++; }
    }
    logSession(t, "");
    B.endedAt = t;
    fcSave();
  }
}
function newBowl(fromHeater) {
  B.p = 0; B.hits = 0; B.endedAt = 0; CL.mark = 0; TAP.at = 0;
  const pr = activeProfile();
  if (pr.mode === "climb" && S.connected) setTarget(TP ? terpOf(TP).c : startOf(pr), 0); // a fresh climb starts from the bottom
  if (!fromHeater) { fcSave(); render(); }
}

