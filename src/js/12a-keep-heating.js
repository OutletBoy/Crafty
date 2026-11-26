// ---- Keep heating (r19) ----
// The Crafty switches its heater off by itself when it hasn't sensed use for its auto-off time (240 s on the Crafty+
// we've recorded). It counts that down on autoOff (0x71, seconds left) and starts again from the full time when it senses
// a draw or a button press. Gentle draws often aren't sensed, so it can shut off mid-bowl.
// While "Keep heating" is on, the page restarts that countdown before it runs out. First it sends the Crafty its own
// temperature setting again, unchanged. The countdown shows whether that worked; if it didn't, the page does what people
// do by hand instead: the setting goes down one degree and straight back. Either way the setting ends where it was.
// Backstops: nothing is sent unless this tab is connected, on screen and the heater is on, and it stops after KEEP.cap
// of heating. Whenever nobody is watching (page closed or hidden, disconnected), the Crafty's own shut-off is back.
const KEEP = {
  cap: 30 * 60000,     // longest stretch of heating it keeps going without being asked again
  lead: [20, 90],      // restart the countdown when this many seconds are left (40% of the auto-off time, within these)
  blindEvery: 120000,  // no countdown to watch: restart this often (at most half the auto-off time)
  gap: 20000,          // never closer together than this
  check: 7000,         // how long the countdown has to show the restart
  dipMs: 800,          // how long the setting sits one degree down before it goes back
  dipTries: 2          // missed restarts with the down-and-back before it gives up
};
const K = {
  on: store.raw(KEY.keep) === "1", onAt: 0, // onAt: when you switched it on in this page (0: it was already on)
  left: null, leftAt: 0, setting: null,     // the countdown and the Crafty's auto-off time, as read
  method: "same", lastAt: 0, verify: null, fails: 0, busy: false,
  broken: false, capped: false, owed: null
};
const keepHeating = () => S.connected && !!(S.project & BIT.HEATER);
const keepTotal = () => K.setting || 240;
const keepSees = () => K.left != null && nowMs() - K.leftAt < 15000; // the countdown is being reported right now
const keepFrom = () => Math.max(F.sessStart || nowMs(), K.onAt);
const keepActive = () => K.on && keepHeating() && !K.capped && !K.broken && !!S.chars.target && document.visibilityState === "visible";

function keepSet(on) {
  K.on = !!on; store.set(KEY.keep, on ? "1" : "0");
  K.onAt = on ? nowMs() : 0; K.capped = false; K.broken = false; K.fails = 0; K.method = "same"; K.verify = null; K.lastAt = 0;
  if (on) toast(`Keep heating on. The Crafty won't shut itself off while this page is open and connected, for up to ${KEEP.cap / 60000} minutes of heating.`, 6000);
  else toast("Keep heating off. The Crafty's own shut-off is back.", 3500);
  buzz(6); render();
}
// A countdown reading from the Crafty. A jump back up after a restart confirms the restart worked.
function keepHeard(v) {
  K.left = v; K.leftAt = nowMs();
  if (K.verify && v >= K.verify.need) { K.verify = null; K.fails = 0; }
}
function keepMissed() {
  const m = K.verify.method; K.verify = null; K.lastAt = 0;
  if (m === "same") { K.method = "dip"; K.fails = 0; return; } // this Crafty wants a real change: try the down-and-back
  if (++K.fails < KEEP.dipTries) return;
  K.broken = true;
  fail("Keep heating couldn't restart the Crafty's shut-off timer, so it has stopped. Turning the temperature down and back up on the Crafty still works by hand.");
}
// Runs every second while connected (from fcLoop)
function keepTick() {
  const t = nowMs(), heating = keepHeating();
  if (!heating) { K.capped = false; K.verify = null; } // the cap is per heating session
  if (S.connected && K.owed && !K.busy) { keepRepay(); return; }
  if (K.verify && t > K.verify.by) keepMissed();
  if (!keepActive() || K.busy) return;
  if (t - keepFrom() >= KEEP.cap) {
    K.capped = true;
    toast(`Keep heating stopped after ${KEEP.cap / 60000} minutes of heating, so the Crafty's own shut-off is back. Switch Keep heating off and on to carry on.`, 0);
    render(); return;
  }
  // Notifications may not come on every firmware, so ask for the countdown when it's gone quiet
  if (S.chars.autoOff && t - K.leftAt > 5000) read("autoOff").then(v => apply("autoOff", v, "read")).catch(() => {});
  if (S.dragging || tTimer || K.verify) return; // you're setting a temperature: that write restarts the countdown anyway
  const total = keepTotal(), sees = keepSees() && K.left > 0;
  const due = sees ? K.left <= clamp(total * 0.4, KEEP.lead[0], KEEP.lead[1])
                   : t - (K.lastAt || keepFrom()) >= Math.min(KEEP.blindEvery, total * 500);
  if (due && t - K.lastAt >= Math.min(KEEP.gap, total * 250)) keepNudge(sees);
}
const keepWait = ms => new Promise(r => setTimeout(r, ms));
async function keepNudge(sees) {
  K.busy = true; K.lastAt = nowMs();
  const method = sees ? K.method : "dip"; // with no countdown to check, use the way that's known to work by hand
  const before = sees ? K.left : null;
  try {
    // Work from what the Crafty holds now, in its own unit, so a change made on the Crafty itself is never undone
    const tv = await read("target"); if (!tv || !tv.byteLength) return;
    const raw = u16(tv);
    if (!sane("target", raw / 10 > LIM.MAX ? fToC(raw / 10) : raw / 10)) return;
    const bv = S.chars.boost ? await read("boost") : null;
    if (S.dragging || tTimer || !keepActive()) return;
    if (method === "same") await write("target", enc16(raw));
    else {
      const f = S.devF || raw / 10 > LIM.MAX, low = f ? Math.round((LIM.MIN * 1.8 + 32) * 10) : LIM.MIN * 10;
      const dip = raw - 10 >= low ? raw - 10 : raw + 10; // one degree in the Crafty's unit, up instead at the very bottom
      K.owed = { raw, dip };
      await write("target", enc16(dip));
      await keepWait(KEEP.dipMs);
      await keepRepay(true);
    }
    if (bv && bv.byteLength) await write("boost", enc16(u16(bv))); // the Crafty keeps its boost after a target write
    if (sees) K.verify = { by: nowMs() + KEEP.check, need: Math.min(before + 15, keepTotal() - 15), method };
  } catch (e) { /* a dropout: K.owed puts the setting back when it reconnects */ }
  finally { K.busy = false; render(); }
}
// Puts the setting back after the down step. Skipped when you've set a new temperature since: yours goes out and wins.
async function keepRepay(inNudge = false) {
  const o = K.owed; if (!o) return;
  if (tTimer || S.dragging) { K.owed = null; return; }
  if (!inNudge) K.busy = true;
  try {
    const now = await read("target");
    if (now && now.byteLength && u16(now) === o.dip) await write("target", enc16(o.raw));
    K.owed = null; // put back, or changed since by you or on the Crafty, which then stands
  } catch (e) { if (inNudge) throw e; /* still owed: tried again on the next tick, or after a reconnect */ }
  finally { if (!inNudge) K.busy = false; }
}
function drawKeep() {
  const on = S.connected, heating = keepHeating();
  let txt = "Keep heating: Off";
  if (K.on) {
    if (K.broken) txt = "Keep heating: stopped, the Crafty didn't respond";
    else if (K.capped) txt = `Keep heating: stopped after ${KEEP.cap / 60000} min`;
    else if (!heating) txt = "Keep heating: On";
    else txt = `Keep heating: On · ${Math.max(1, Math.ceil((KEEP.cap - (nowMs() - keepFrom())) / 60000))} min left`;
  }
  put($("keepLine"), "text", txt);
  put($("keepLine"), "hidden", !on);
  put($("keepLine"), "class", "keep" + (K.on && !K.broken && !K.capped ? " on" : ""));
  put($("keepLine"), "@aria-pressed", String(K.on));
  put($("keepBtn"), "@aria-checked", String(K.on));
}
