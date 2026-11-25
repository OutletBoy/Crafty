// ---- Pull labeling ----
// You press and hold Soft, Medium or Hard for as long as each pull lasts. Every reading and detector decision during
// the session is kept alongside your holds and saved on this phone as you go, so a page reload or a dropout loses
// nothing, and Share makes one file. Each label also shows whether the page's own detector caught that pull.
// After each pull the buttons lock until the Crafty has settled, so the next pull can't run into this one: Outlet's
// first labeled session (r9) showed a pull's dip arriving 2 to 9 s after letting go and recovering 3 to 9 s after
// that, while the next pull often started 4 to 7 s after letting go. Pull detection itself is unchanged.
const LB_KINDS = [["soft", "Soft", "lbSoft"], ["medium", "Medium", "lbMedium"], ["hard", "Hard", "lbHard"]];
const LB_NAME = { soft: "Soft", medium: "Medium", hard: "Hard" };
const LB_MIN_HOLD = 400;    // shorter is a slip of the thumb, not a pull
const LB_MAX_HOLD = 60000;  // longer is a stuck finger or a forgotten button: the label ends and is saved at 60 s
const LB_LATE = 12000;      // the chamber reacts late, so a detection up to 12 s after you let go still matches
const LB_MAX_ROWS = 20000;  // about 2 hours of readings; your labels are always kept, even past this
// The wait after a pull. The chamber reacts late, so it never ends before LB_WAIT_MIN, then waits for the temperature
// to be back near the steady level (within half the detector's threshold) and stay there for LB_WAIT_HOLD.
const LB_WAIT_MIN = 8000;    // the r9 session's dips showed up as late as 8.5 s after letting go
const LB_WAIT_HOLD = 3000;   // back near steady this long counts as settled
const LB_WAIT_BLIND = 12000; // no steady level known yet (still heating, just reconnected): a fixed, careful wait
const LB_WAIT_MAX = 45000;   // never trapped: the lock lifts by itself here, and Go anyway shows after LB_WAIT_MIN
const LB_WAIT_STALE = 6000;  // the Crafty reports about every 2.5 s; nothing for this long means no fresh reading
// One test temperature for the whole session, so every pull is measured the same way. Picked on the labeling screen
// before the first pull (370 °F unless you picked another last time), then held: nothing on the page can change it.
const LB_TEMP_DEFAULT = (370 - 32) * 5 / 9;
const LBKEY = { meta: "crafty-label", rows: "crafty-label-rows", done: "crafty-label-done", temp: "crafty-label-temp" };
let lbDone = store.raw(LBKEY.done) === "1";
// Saved data is checked piece by piece, so a damaged save can't break the page or the file
(function lbLoad() {
  const m = store.json(LBKEY.meta);
  if (!m || m.v !== 1 || typeof m.t0 !== "number" || !isFinite(m.t0) || m.t0 <= 0) return;
  const okT = x => typeof x === "number" && isFinite(x);
  LB.t0 = m.t0;
  LB.labels = (Array.isArray(m.labels) ? m.labels : []).filter(l => l && LB_NAME[l.kind] && okT(l.a) && okT(l.b) && l.b > l.a && okT(l.n))
    .map(l => ({ n: l.n, kind: l.kind, a: l.a, b: l.b }));
  LB.n = LB.labels.reduce((a, l) => Math.max(a, l.n), num(m.n, 0, 0, 1e6));
  LB.auto = (Array.isArray(m.auto) ? m.auto : []).filter(x => Array.isArray(x) && okT(x[0]) && okT(x[1]));
  LB.dev = (Array.isArray(m.dev) ? m.dev : []).filter(okT);
  LB.trimmed = num(m.trimmed, 0, 0, 1e9);
  if (okT(m.temp) && m.temp >= LIM.MIN && m.temp <= LIM.MAX) LB.temp = m.temp;
  LB.page = typeof m.page === "string" ? m.page.slice(0, 40) : ""; // which version of this page made the session
  LB.sharedKey = typeof m.shared === "string" ? m.shared.slice(0, 80) : "";
  LB.devName = typeof m.devName === "string" ? m.devName.slice(0, 40) : ""; LB.fw = typeof m.fw === "string" ? m.fw.slice(0, 20) : ""; LB.devF = !!m.devF;
  // A wait that was running when the page closed carries on, so a reload can't skip it
  if (m.wait && okT(m.wait.from) && nowMs() - m.wait.from >= 0 && nowMs() - m.wait.from < LB_WAIT_MAX) LB.wait = { from: m.wait.from, n: okT(m.wait.n) ? m.wait.n : "" };
  const r = store.json(LBKEY.rows);
  LB.rows = (Array.isArray(r) ? r : []).filter(x => Array.isArray(x) && x.length === 6 && okT(x[0])).slice(0, LB_MAX_ROWS);
})();
function lbSave(rowsToo = true) {
  clearTimeout(LB.saveT); LB.saveT = null;
  if (!LB.t0) return;
  store.set(LBKEY.meta, { v: 1, t0: LB.t0, n: LB.n, labels: LB.labels, auto: LB.auto, dev: LB.dev, trimmed: LB.trimmed, devName: LB.devName, fw: LB.fw, devF: LB.devF, wait: LB.wait, temp: LB.temp, page: LB.page || VERSION, shared: LB.sharedKey });
  if (rowsToo) store.set(LBKEY.rows, LB.rows, lbMakeRoom);
}
// Readings are saved every few seconds (and when you leave the page); labels are saved the moment you make them
const lbSaveSoon = () => { if (!LB.saveT) LB.saveT = setTimeout(lbSave, 5000); };
// Phone storage full: the diagnostics read every 10 s go first, so chamber readings and the detector's notes stay
function lbMakeRoom() {
  const n = LB.rows.length; let j = 0;
  for (const r of LB.rows) if (r[1] !== "poll") LB.rows[j++] = r;
  LB.rows.length = j; LB.trimmed += n - j;
  return j < n;
}
function lbRow(row) {
  if (LB.rows.length >= LB_MAX_ROWS) LB.trimmed++; else LB.rows.push(row);
  lbSaveSoon();
}
// The page's detector counted a pull: kept to compare with your labels. Still listened for in the 12 s after the
// last label if you close the screen straight away, so a late detection of that pull isn't missed.
const lbListening = () => LB.open || (LB.labels.length > 0 && nowMs() - LB.labels[LB.labels.length - 1].b < LB_LATE);
function lbNote(s, start, end) { if (lbListening()) { LB.auto.push([start, end, +s.toFixed(3)]); lbSave(false); } }
const lbNear = (x, l) => x >= l.a - 1000 && x <= l.b + LB_LATE;
// Which label a detection (or a use the Crafty sensed) belongs to: the latest one that had started by then, if it's
// still within reach. One detection can only ever match one label, even when two labels' windows overlap.
function lbOwner(x) {
  let best = null;
  for (const l of LB.labels) if (lbNear(x, l) && (!best || l.a > best.a)) best = l;
  return best;
}
// "caught", "missed", or "checking" while a late detection could still arrive
const lbSeen = (l, t = nowMs()) => LB.auto.some(([x]) => lbOwner(x) === l) ? "caught" : t < l.b + LB_LATE ? "checking" : "missed";
const lbExtra = () => LB.auto.filter(([x]) => !lbOwner(x)).length;
const lbBlock = () => GT.on ? "The guided pull test is running." : !S.connected ? "Connect to your Crafty first." : !heatingNow() ? "Turn the heater on first." : "";
const lbSecs = ms => (ms / 1000).toFixed(1) + " s";
const lbPulls = n => `${n} ${n === 1 ? "pull" : "pulls"}`;
// Each test starts fresh (r12). A session saved by another version of this page is an old test: it never carries on
// by itself, and New test is the main choice. Continue is still there for it, on purpose.
const lbOld = () => !!LB.t0 && LB.page !== VERSION;
// Which labels the last shared file held, so New test can ask before throwing away pulls you never shared
const lbShareKey = () => { const L = LB.labels, l = L[L.length - 1]; return L.length ? `${L.length}:${l.n}:${l.b}` : ""; };
const lbUnshared = () => LB.labels.length > 0 && lbShareKey() !== LB.sharedKey;
function lbMsg(text) { LB.msg = text; LB.msgAt = nowMs(); render(); }

// ---- The test temperature ----
const lbTempPick = () => num(parseFloat(store.raw(LBKEY.temp)), LB_TEMP_DEFAULT, LIM.MIN, LIM.MAX);
const lbTempOff = () => LB.temp != null && S.connected && S.target != null && !tTimer && Math.abs(S.target - LB.temp) > 0.3;
// Sets the Crafty to the test temperature. The only way the page changes the target while labeling.
function lbApplyTemp(why) {
  if (LB.temp == null || !S.connected || (S.target != null && Math.abs(S.target - LB.temp) <= 0.3)) return;
  LB.applying = true; setTarget(LB.temp, 0); LB.applying = false;
  LB.tempOff = false;
  rec("label", "test temperature set", +LB.temp.toFixed(2), S.unit, why);
}
function lbTempStep(dir) {
  if (!LB.open || LB.temp == null) return;
  if (LB.labels.length) { lbMsg("The test temperature stays the same for the whole session. To test another, share this one, then tap New test."); buzz(20); return; }
  const c = clamp(fromU(Math.round(toU(LB.temp)) + dir), LIM.MIN, LIM.MAX);
  if (Math.abs(c - LB.temp) < 0.01) return;
  LB.temp = c; store.set(LBKEY.temp, String(+c.toFixed(3)));
  lbApplyTemp("you picked it before the first pull");
  lbSave(false); render();
}
// The Crafty's target moved anyway (its own buttons): noted once each way, with a button to set it back
function lbTempWatch() {
  if (!S.connected || S.target == null || tTimer) return; // nothing new to judge while disconnected or mid-write
  const off = lbTempOff();
  if (off === LB.tempOff) return;
  LB.tempOff = off;
  if (off) { rec("label", "target changed on the Crafty", +S.target.toFixed(2), +LB.temp.toFixed(2), "not the test temperature"); buzz([20, 60, 20]); }
  else rec("label", "target back at the test temperature", +S.target.toFixed(2), +LB.temp.toFixed(2));
}

function lbOpen() {
  if (LB.open) return;
  if (GT.on) { toast("Finish or stop the guided pull test first.", 3500); buzz(20); return; }
  const why = lbBlock();
  if (!LB.t0 && why) { toast(why.replace(/\.$/, ", then start labeling."), 3500); buzz(20); return; }
  const fresh = !LB.t0, madeBy = LB.page;
  if (fresh) Object.assign(LB, { t0: nowMs(), n: 0, labels: [], rows: [], auto: [], dev: [], trimmed: 0, sharedKey: "" });
  LB.page = VERSION; // carrying on an old test on purpose makes it this version's from now on
  LB.open = true; LB.msg = ""; LB.listKey = "";
  // Reuse an open sheet's Back step, so the phone's Back button closes this panel instead of leaving the page
  if (openSh) hideSheet(openSh);
  if (!histPushed) { try { history.pushState({ craftySheet: 1 }, ""); histPushed = true; } catch (e) {} }
  LB.recWas = REC.on; setRec(true); // the raw recorder runs for the session (it also reads the Crafty's own use sensor)
  rec("label", fresh ? "session start" : "session resumed", S.target == null ? "" : +S.target.toFixed(1), S.current == null ? "" : +S.current.toFixed(2), "target and chamber °C");
  if (!fresh && madeBy !== VERSION) rec("label", "old session continued", madeBy || "?", VERSION, "made by another version of this page");
  // A new session takes the test temperature you used last (370 °F the first time). One saved before r11 has none:
  // it keeps whatever the Crafty is set to now, so its labels stay comparable from here on.
  if (fresh) LB.temp = snapC(lbTempPick());
  else if (LB.temp == null && S.target != null) { LB.temp = S.target; rec("label", "test temperature kept", +LB.temp.toFixed(2), S.unit, "session from before r11"); }
  LB.tempOff = false;
  lbApplyTemp(fresh ? "test temperature for this session" : "set again on continuing");
  $("lab").hidden = false; $("toast").hidden = true;
  lbSave(); render();
}
function lbClose(fromBack) {
  if (!LB.open) return;
  lbCancelHold("closed");
  if (LB.wait) lbWaitEnd("screen closed");
  rec("label", "session paused");
  LB.open = false;
  if (!LB.recWas) setRec(false);
  $("lab").hidden = true;
  if (!fromBack && histPushed) { histPushed = false; try { history.back(); } catch (e) {} }
  lbSave(); render();
}
function lbStop() { LB.hold = null; clearInterval(LB.tick); LB.tick = null; }
function lbDown(kind, el, id) {
  if (!LB.open || LB.hold) return; // one pull at a time: a second finger is ignored
  const why = lbBlock();
  if (why) { lbMsg(why.replace(/\.$/, ", then hold a button for each pull.")); buzz(20); return; }
  if (LB.wait) { lbWaitNudge(); return; }
  LB.hold = { kind, a: nowMs(), id };
  if (typeof id === "number") { try { el.setPointerCapture(id); } catch (e) {} } // a thumb that slides off keeps the hold
  clearInterval(LB.tick); LB.tick = setInterval(lbTick, 100);
  buzz(15); render();
}
function lbTick() {
  const h = LB.hold;
  if (!h) { lbStop(); return; }
  if (nowMs() - h.a >= LB_MAX_HOLD) { lbEnd(h.a + LB_MAX_HOLD); lbMsg("Stopped at 60 seconds and saved. If you're still pulling, let go and press again."); return; }
  render();
}
function lbUp(id) {
  const h = LB.hold;
  if (!h || id !== h.id) return;
  if (lbBlock()) return lbCancelHold(S.connected ? "heater" : "disconnect");
  const t = nowMs();
  if (t - h.a < LB_MIN_HOLD) {
    lbStop(); rec("label", "hold too short", h.kind, t - h.a, "not saved");
    lbMsg("Too quick to count. Hold the button for the whole pull."); buzz([10, 40, 10]); return;
  }
  lbEnd(t);
}
function lbEnd(t) {
  const h = LB.hold; lbStop();
  const l = { n: ++LB.n, kind: h.kind, a: h.a, b: Math.min(t, h.a + LB_MAX_HOLD) };
  LB.labels.push(l);
  buzz(30);
  lbWaitStart(l.n, l.b);
  lbSave(false); lbSaveSoon();
  lbMsg(`${LB_NAME[l.kind]} pull saved, ${lbSecs(l.b - l.a)}.`);
}
const LB_CUT = {
  cancel: "The phone cut that hold off, so it wasn't saved. Press again and keep your thumb still.",
  disconnect: "The Crafty disconnected mid-hold, so that one wasn't saved.",
  heater: "The heater went off mid-hold, so that one wasn't saved.",
  hidden: "The page went to the background mid-hold, so that one wasn't saved."
};
function lbCancelHold(reason, id) {
  const h = LB.hold;
  if (!h || (id !== undefined && id !== h.id)) return;
  lbStop();
  rec("label", "hold cancelled", h.kind, nowMs() - h.a, reason);
  // The pull itself probably still happened, so the next one waits all the same
  if ((reason === "cancel" || reason === "hidden") && nowMs() - h.a >= LB_MIN_HOLD) { lbWaitStart("", nowMs()); lbSave(false); }
  if (LB_CUT[reason]) { lbMsg(LB_CUT[reason]); buzz([10, 40, 10]); } else render();
}
// ---- The wait after a pull ----
function lbWaitStart(n, from) {
  LB.wait = { from, n };
  rec("label", "wait start", n, "", "letting the Crafty settle");
  clearInterval(LB.waitT); LB.waitT = setInterval(lbWaitCheck, 250);
}
// How the wait stands: { done, how } once it's over, otherwise { phase } for what it's waiting on
function lbWaitState(t = nowMs()) {
  const w = LB.wait; if (!w) return { done: true, how: "" };
  const el = t - w.from;
  if (el >= LB_WAIT_MAX) return { done: true, how: "timed out at 45 s" };
  if (!PD.settled) return el >= LB_WAIT_BLIND ? { done: true, how: "no steady level, waited 12 s" } : { phase: "blind" };
  if (PD.inHit) return { phase: "pull" };
  if (!PD.lastAt || t - PD.lastAt > LB_WAIT_STALE) return { phase: "reading" };
  // The last reading since letting go that sat below the band, and the first one back above it after that
  const band = PD.base - pdThr() / 2, tr = PD.trace;
  let low = -1;
  for (let i = tr.length - 1; i >= 0 && tr[i][0] >= w.from; i--) if (tr[i][1] < band) { low = i; break; }
  if (low >= 0 && (!tr[low + 1] || t - tr[low + 1][0] < LB_WAIT_HOLD)) return { phase: "temp" };
  if (el < LB_WAIT_MIN) return { phase: "min" };
  return { done: true, how: "settled" };
}
function lbWaitCheck() {
  if (!LB.wait) { clearInterval(LB.waitT); LB.waitT = null; return; }
  if (!LB.open) return;
  const st = lbWaitState();
  if (st.done) lbWaitEnd(st.how); else render();
}
function lbWaitEnd(how) {
  const w = LB.wait; if (!w) return;
  LB.wait = null; clearInterval(LB.waitT); LB.waitT = null;
  rec("label", "wait end", w.n, nowMs() - w.from, how);
  lbSave(false);
  if (how === "screen closed") return;
  if (how === "go anyway") { lbMsg("Okay, go ahead. This pull may blend with the last one."); buzz(15); return; }
  buzz([40, 80, 40]);
  lbMsg(how === "timed out at 45 s" ? "Ready. It hadn't fully settled after 45 s, so this pull may blend with the last one." : "Ready for the next pull.");
}
function lbGoAnyway() { if (LB.wait && nowMs() - LB.wait.from >= LB_WAIT_MIN) lbWaitEnd("go anyway"); }
function lbWaitNudge() { lbMsg("Wait for the Crafty to settle first, so this pull doesn't run into the last one."); buzz(20); }
const LB_WAIT_WHY = {
  min: "So this pull doesn't run into the next one.",
  blind: "The temperature isn't steady yet, so this takes a little longer.",
  pull: "The temperature is still recovering from that pull.",
  temp: "Waiting for the temperature to come back up.",
  reading: "Waiting for a fresh reading from the Crafty."
};

function lbUndo() {
  if (LB.hold) return;
  const l = LB.labels.pop(); if (!l) return;
  if (l.n === LB.n) LB.n--;
  rec("label", "label undone", l.kind, l.b - l.a, `label ${l.n}`);
  lbSave(false);
  lbMsg(`Took back the last label: ${l.kind}, ${lbSecs(l.b - l.a)}.`);
}
// New test: a fresh session. Pulls that were never shared are offered for sharing first; anything else is cleared
// straight away, with Undo for as long as the new test has no pulls of its own.
function lbNew() {
  if (LB.hold || LB.asking) return;
  if (GT.on) { toast("Finish or stop the guided pull test first.", 3500); buzz(20); return; }
  if (!LB.t0) { lbOpen(); return; }
  if (lbUnshared()) { lbAskShow(); return; }
  lbFresh();
}
function lbWaitDrop() { LB.wait = null; clearInterval(LB.waitT); LB.waitT = null; }
function lbFresh() {
  if (!LB.t0 || LB.hold) return;
  const old = { t0: LB.t0, n: LB.n, labels: LB.labels, rows: LB.rows, auto: LB.auto, dev: LB.dev, trimmed: LB.trimmed, temp: LB.temp,
    page: LB.page, sharedKey: LB.sharedKey, devName: LB.devName, fw: LB.fw, devF: LB.devF };
  const N = old.labels.length, inside = LB.open;
  lbWaitDrop();
  Object.assign(LB, { t0: 0, n: 0, labels: [], rows: [], auto: [], dev: [], trimmed: 0, temp: null, tempOff: false, page: "", sharedKey: "", msg: "", listKey: "" });
  if (!store.readOnly) { try { localStorage.removeItem(LBKEY.meta); localStorage.removeItem(LBKEY.rows); } catch (e) {} }
  if (inside) {
    // Already on the labeling screen: the new test starts right here
    LB.t0 = nowMs(); LB.page = VERSION;
    rec("label", "session start", S.target == null ? "" : +S.target.toFixed(1), S.current == null ? "" : +S.current.toFixed(2), "target and chamber °C");
    LB.temp = snapC(lbTempPick());
    lbApplyTemp("test temperature for this session");
    lbSave();
  } else if (!lbBlock()) lbOpen();
  render();
  const started = !!LB.t0, gone = N ? (started ? ` Your last one's ${lbPulls(N)} are cleared.` : `Cleared ${lbPulls(N)}.`) : "";
  const msg = started ? `New test started.${gone}` : `${gone} Start the new test once your Crafty is heating.`.trim();
  toast(msg, N ? 7000 : 3500, N ? { label: "Undo", fn: () => lbUnfresh(old) } : null);
}
function lbUnfresh(old) {
  if (LB.labels.length) { toast("You've labeled pulls in the new test, so the old one can't come back.", 3500); return; }
  lbWaitDrop();
  Object.assign(LB, old, { tempOff: false, listKey: "" });
  if (LB.open) {
    // Back on the old test with the screen open: you're carrying it on, so it holds its own temperature again
    LB.page = VERSION;
    if (LB.temp == null && S.target != null) LB.temp = S.target;
    rec("label", "new test undone", old.labels.length, "", "carried on with this session");
    lbApplyTemp("set again after Undo");
  }
  lbSave(); render();
}
// "Share these pulls first?" Share, Discard or Cancel
function lbAskShow() {
  const n = LB.labels.length;
  LB.asking = true;
  $("lbAskT").textContent = `Share ${n === 1 ? "this pull" : `these ${n} pulls`} first?`;
  $("lbAskWhy").textContent = `${n === 1 ? "It hasn't" : "They haven't"} been shared yet. A new test clears ${n === 1 ? "it" : "them"} from this phone.`;
  for (const id of ["lbAskShare", "lbAskDrop", "lbAskNo"]) $(id).disabled = false;
  $("lbAsk").hidden = false; buzz(15);
}
function lbAskHide() { LB.asking = false; $("lbAsk").hidden = true; }
async function lbAskShare() {
  for (const id of ["lbAskShare", "lbAskDrop", "lbAskNo"]) $(id).disabled = true;
  const r = await lbShare(true);
  if (r === "shared" || r === "saved") { lbAskHide(); lbFresh(); return; }
  for (const id of ["lbAskShare", "lbAskDrop", "lbAskNo"]) $(id).disabled = false; // closed the share sheet: choose again
}
function lbAskDrop() { lbAskHide(); lbFresh(); }
function lbCsv() {
  const L = LB.labels.slice().sort((x, y) => x.a - y.a), cnt = k => L.filter(l => l.kind === k).length;
  const seen = L.map(l => lbSeen(l)), caught = seen.filter(x => x === "caught").length;
  const owned = new Set(LB.dev.map(lbOwner)), dev = L.filter(l => owned.has(l)).length;
  const waits = LB.rows.filter(r => r[1] === "label" && r[2] === "wait end"), wms = waits.map(r => +r[4]).filter(isFinite).sort((a, b) => a - b);
  const howN = h => waits.filter(r => r[5] === h).length;
  const head = [
    `# Crafty Remote labeled pulls, page ${VERSION}`,
    `# started ${new Date(LB.t0).toISOString()}, ${L.length} labels (${cnt("soft")} soft, ${cnt("medium")} medium, ${cnt("hard")} hard), ${LB.rows.length} readings${LB.trimmed ? `, ${LB.trimmed} readings not kept (phone storage limit)` : ""}`,
    LB.temp == null ? "# test temperature: not set (session started before r11)" : `# test temperature ${fmt(LB.temp)} °${S.unit} (${LB.temp.toFixed(1)} °C), held by the page; changes on the Crafty itself are logged as "target changed on the Crafty"`,
    `# device ${LB.devName || "?"}, firmware ${LB.fw || "?"}, device unit ${LB.devF ? "F" : "C"}, page unit ${S.unit}, sensitivity ${pdSens}`,
    `# learned: usual pull ${M.typArea.toFixed(2)} °C·s over ${M.pulls} pulls`,
    `# page detector caught ${caught} of ${L.length} labeled pulls and counted ${lbExtra()} that weren't labeled; the Crafty's own use sensor caught ${dev}`,
    `# browser ${navigator.userAgent || "?"}`,
    wms.length ? `# waits after pulls: ${wms.length}, middle ${lbSecs(wms[wms.length >> 1])} (shortest ${lbSecs(wms[0])}, longest ${lbSecs(wms[wms.length - 1])}); ${howN("settled")} settled, ${howN("go anyway")} go anyway, ${howN("timed out at 45 s")} timed out, ${howN("no steady level, waited 12 s")} without a steady level` : "# waits after pulls: none",
    `# label rows: kind label, what "<soft|medium|hard> start" or "... end", raw = label number, value = held ms, note = whether the page caught it`,
    `# wait rows: kind label, what "wait start" (when you let go) or "wait end" (buttons unlocked), raw = label number, value = ms waited, note = how it ended`,
    "ms,time,kind,what,raw,value,note"
  ];
  const rows = LB.rows.slice();
  L.forEach((l, i) => {
    const note = seen[i] === "caught" ? "page caught it" : seen[i] === "checking" ? "page still checking" : "page missed it";
    rows.push([l.a, "label", l.kind + " start", l.n, l.b - l.a, note], [l.b, "label", l.kind + " end", l.n, l.b - l.a, note]);
  });
  // Stable: a label lands after a reading taken in the same millisecond, but before the wait it starts
  const ws = r => r[1] === "label" && r[2] === "wait start" ? 1 : 0;
  rows.sort((x, y) => x[0] - y[0] || ws(x) - ws(y));
  return head.concat(rows.map(r => [r[0] - LB.t0, new Date(r[0]).toISOString().slice(11, 23), r[1], r[2], r[3], r[4], r[5]].map(csvCell).join(","))).join("\n") + "\n";
}
async function lbShare(quiet) {
  if (!LB.labels.length) return "";
  lbSave();
  const r = await shareCsv(`crafty-labels-${stamp(LB.t0)}.csv`, lbCsv(), "Crafty labeled pulls", "labels");
  if (r !== "shared" && r !== "saved") return r;
  lbDone = true; store.set(LBKEY.done, "1");
  LB.sharedKey = lbShareKey(); lbSave(false);
  if (quiet) return r;
  lbMsg(r === "saved" ? "Saved to your Downloads. Keep labeling, or tap Close when you're done." : "File ready. Keep labeling, or tap Close when you're done.");
  return r;
}
function renderLab() {
  const L = LB.labels, n = L.length, block = lbBlock();
  const old = lbOld();
  const hint = LB.open || GT.on ? "" : old ? (heatingNow() ? "Start a new labeling test" : "")
    : n ? `Continue labeling pulls (${n} saved)` : heatingNow() && gtDone && !lbDone ? "Not seeing your pulls? Label a few" : "";
  put($("lbMain"), "hidden", !hint); if (hint) put($("lbMain"), "text", hint);
  // With a saved test, New test is the main button and Continue the second one
  put($("lbBtn"), "text", LB.t0 ? "New test" : "Start");
  put($("lbBtn"), "@aria-disabled", String(GT.on || (!LB.t0 && !!block)));
  put($("lbCont"), "hidden", !LB.t0 || LB.open);
  put($("lbCont"), "@aria-disabled", String(GT.on));
  put($("lbWhy"), "text", GT.on ? "Finish the guided test first."
    : old ? `Old test from an earlier version of this page, ${lbPulls(n)}. New test starts fresh.`
    : LB.t0 ? `${lbPulls(n)} labeled so far, saved on this phone.`
    : block || "Hold Soft, Medium or Hard for each pull you take. Makes one file to tune pull detection.");
  if (LB.t0 && S.connected) { LB.devName = (S.device && S.device.name || "").slice(0, 40); LB.fw = S.fw || LB.fw; LB.devF = S.devF; }
  if (!LB.open) return;
  const t = nowMs(), h = LB.hold, cnt = k => L.filter(l => l.kind === k).length;
  lbTempWatch();
  const ws = LB.wait ? lbWaitState(t) : null;
  if (ws && ws.done) { lbWaitEnd(ws.how); return; } // ends the wait; its message asks for the next frame
  const at = LB.temp == null ? "" : ` · at ${fmt(LB.temp)}°`;
  put($("lbCount"), "text", (n ? `${n} labeled · ${cnt("soft")} soft, ${cnt("medium")} medium, ${cnt("hard")} hard` : "None yet") + at);
  put($("lbStat"), "text", h ? `Holding ${h.kind} for ${lbSecs(t - h.a)}. Let go when the pull ends.`
    : S.reconnecting ? "Connection dropped, reconnecting. Your labels are saved."
    : !S.connected ? "Not connected. Your labels are saved. Connect to keep going."
    : !heatingNow() ? "The heater is off. Turn it on to keep labeling."
    : LB.tempOff ? `Your Crafty was changed to ${fmt(S.target)}°. Set it back to the test temperature, ${fmt(LB.temp)}°, so every pull is measured the same way.`
    : LB.wait ? `Letting the Crafty settle at ${fmt(S.current)}°. The buttons come back when it's ready.`
    : !PD.settled ? `Heating, now ${fmt(S.current)}°. Best to wait until it holds steady, then hold a button for each pull.`
    : `Ready at ${fmt(S.current)}°. Hold a button for the whole pull and let go when you stop.`);
  put($("lbMsg"), "text", LB.msg && t - LB.msgAt < 6000 ? LB.msg : "");
  for (const [k, , id] of LB_KINDS) {
    const on = !!h && h.kind === k;
    put($(id), "class", `hold ${k === "medium" ? "med" : k}${on ? " on" : ""}${block || ws ? " off" : ""}`);
    put($(id), "@aria-disabled", String(!!block || !!ws));
    put($(id), "@aria-pressed", String(on));
    put($(id + "T"), "text", on ? `${lbSecs(t - h.a)} · let go when you stop` : h ? "One pull at a time" : "Press and hold");
  }
  put($("lbWait"), "hidden", !ws);
  if (ws) {
    const el = Math.max(0, t - LB.wait.from), need = ws.phase === "blind" ? LB_WAIT_BLIND : LB_WAIT_MIN;
    put($("lbWait"), "class", `lwait${ws.phase === "min" || ws.phase === "blind" ? "" : " temp"}`);
    put($("lbRing"), "strokeDashoffset", (175.93 * (1 - Math.min(1, el / need))).toFixed(1) + "px");
    put($("lbWaitN"), "text", Math.floor(el / 1000) + " s");
    put($("lbWaitWhy"), "text", LB_WAIT_WHY[ws.phase]);
    put($("lbGo"), "hidden", el < LB_WAIT_MIN);
  }
  put($("lbUndo"), "disabled", !n || !!h);
  put($("lbNew"), "disabled", !n || !!h);
  put($("lbShare"), "disabled", !n);
  const act = !S.connected ? (S.connecting ? "Connecting…" : "Connect") : S.chars.heaterOn && !heatingNow() ? (S.pending ? "Starting…" : "Heater on")
    : LB.tempOff ? `Back to ${fmt(LB.temp)}°` : "";
  put($("lbAct"), "hidden", !act);
  if (act) { put($("lbAct"), "text", act); put($("lbAct"), "disabled", S.connecting || !!S.pending); }
  // Under the buttons: how the page is doing, then your last three labels
  const seen = L.map(l => lbSeen(l, t)), caught = seen.filter(x => x === "caught").length, checking = seen.filter(x => x === "checking").length, extra = lbExtra();
  const lines = [];
  if (!store.ok || store.full || store.readOnly) lines.push("This phone isn't saving the labels, so share before you close the page.");
  // Before the first pull, the test temperature can still be picked here
  const pick = !n && LB.temp != null;
  if (pick) { put($("lbTVal"), "text", fmt(LB.temp) + "°"); put($("lbTMinus"), "disabled", LB.temp <= LIM.MIN + 0.01); put($("lbTPlus"), "disabled", LB.temp >= LIM.MAX - 0.01); }
  if (n) lines.push(`Page caught ${caught} of ${n}${checking ? ", checking the last" : ""}${extra ? ` · it also counted ${extra} you didn't label` : ""}`);
  else if (!pick) lines.push("Each pull you label shows here, with whether the page caught it.");
  for (let i = n - 1; i >= Math.max(0, n - 3); i--) lines.push(`${L[i].n}. ${LB_NAME[L[i].kind]}, ${lbSecs(L[i].b - L[i].a)} · ${seen[i] === "caught" ? "page caught it" : seen[i] === "checking" ? "checking…" : "page missed it"}`);
  if (LB.trimmed) lines.push("Phone storage is filling up, so share soon.");
  const key = (pick ? "pick\n" : "") + lines.join("\n");
  if (key !== LB.listKey) { LB.listKey = key; $("lbList").replaceChildren(...(pick ? [$("lbTemp")] : []), ...lines.map(x => { const d = document.createElement("div"); d.textContent = x; return d; })); }
}

