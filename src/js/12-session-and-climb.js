// ---- Session ----
// A session runs from heater on to heater off. Whether a heat-up is the same bowl or a new one is the bowl meter's call
// (bmHeater); a new bowl starts Follow the bowl from its start temp.
function fcConnected() {
  const t = nowMs();
  F.last = t; F.pred = 0; F.valid = false; F.prevBatt = S.battery;
  const heating = !!(S.project & BIT.HEATER);
  // Carry on a session held through a dropout or a page reload if the heater is still on and it wasn't long ago
  if (F.sess && heating && t - S.lostAt < CFG.resumeWindow) { F.heaterOn = true; F.atTemp = false; }
  else {
    if (F.sess) logSession(S.lostAt || t, heating ? "connection lost" : "");
    F.heaterOn = heating;
    if (heating) { F.sessStart = t; F.sess = newSess(t); }
  }
  clearInterval(fcTimer);
  fcTimer = setInterval(fcLoop, 1000);
}
async function fcLoop() {
  if (!S.connected) return;
  // The Crafty pushes temperature changes, but a steady temperature sends nothing, so read it every few seconds
  // if nothing came in.
  const stale = nowMs() - (S.seen.current || 0);
  if (!S.dragging && stale > 4000) { try { apply("current", await read("current"), "read"); } catch (e) {} }
  if (REC.on) recPollDiag();
  fcTick();
  keepTick();
  render();
}
const charging = () => !!(S.power & 1);
function fcTick() {
  const t = nowMs(), dt = (t - F.last) / 60000; F.last = t;
  if (dt <= 0) return;
  if (dt > 10 / 60) { bmGap(dt); saveSoon(); F.valid = false; F.pred = 0; return; } // the page was asleep: the battery can't use this stretch
  if (!F.heaterOn || S.target == null) return;
  bmTick(dt); followTick(dt); saveSoon();
  const goal = effTarget(), T = S.current;
  if (F.sess) { F.sess.tMin = Math.min(F.sess.tMin, S.target); F.sess.tMax = Math.max(F.sess.tMax, S.target); }
  if (!F.atTemp && T != null && T >= goal - 3) F.atTemp = true;
  if (!F.atTemp) return; // heat-up is charged as one lump when the heater turns on
  F.pred += holdRate(goal) * dt;
}
function fcHeater(on) {
  if (!S.connected || on === F.heaterOn) return; // while connecting, fcConnected sets the starting state
  const t = nowMs();
  F.heaterOn = on; F.atTemp = false;
  const fresh = bmHeater(on, t);
  if (on) {
    F.sessStart = t;
    F.sess = newSess(t);
    F.pred += heatUpCost(effTarget(), S.current == null ? AMB : S.current);
    F.last = t;
    if (fresh) freshClimb();
  } else {
    const mins = (t - F.sessStart) / 60000;
    if (F.sessStart && mins >= 1.5) {
      M.sessMin = clamp(M.sessMin * 0.7 + mins * 0.3, 2, 20);
      M.sessions++;
    }
    logSession(t, "");
    fcSave();
  }
}
function freshClimb() {
  followReset();
  const pr = activeProfile();
  if (pr.mode === "climb" && S.connected) setTarget(TP ? terpOf(TP).c : startOf(pr), 0); // a new bowl starts from the bottom
}
