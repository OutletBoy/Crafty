// ---- Guided pull test ----
// Calls out six pulls of different strength and length, with a countdown and a buzz to start and stop each one,
// and rest in between so the chamber recovers. Each pull is labelled in the recording, so the detector can be
// checked against what you really did.
const GT_STEPS = [["Soft", 3], ["Soft", 6], ["Normal", 4], ["Hard", 3], ["Hard", 6], ["Hard", 10]];
const GT_LEAD = 10000, GT_REST = 25000;
const GT = { on: false, i: 0, phase: "", until: 0, timer: null, counted: [], starts: [], win: [], dev0: 0 };
const gtBlock = () => GT.on ? "Running now." : LB.open ? "Close pull labeling first." : !S.connected ? "Connect to your Crafty first." : !heatingNow() ? "Turn the heater on first." : "";
let gtDone = !!(store.json(KEY.pd) || {}).gtDone;
function gtStart() {
  const why = gtBlock();
  if (why) { if (!GT.on) toast(why.replace(".", ", then start the test."), 3500); buzz(20); return; }
  setRec(true);
  Object.assign(GT, { on: true, i: 0, phase: "wait", until: 0, counted: [], starts: [], win: [], dev0: DEV.uses.length });
  rec("guide", "auto-climb paused for the test");
  rec("guide", "test start", GT_STEPS.map(s => s.join(" ")).join(", "));
  closeSheets();
  clearInterval(GT.timer); GT.timer = setInterval(gtTick, 250);
  gtTick();
}
function gtStop(why) {
  if (!GT.on) return;
  clearInterval(GT.timer); GT.on = false;
  rec("guide", "test stopped", why || "by you");
  $("guide").hidden = true;
  if (why) fail(`Guided test stopped: ${why}. The recording so far is kept.`);
  render();
}
let gtLastSec = null;
function gtTick() {
  if (!GT.on) return;
  if (!S.connected) return gtStop("the Crafty disconnected");
  if (!heatingNow() && GT.phase !== "done") return gtStop("the heater turned off");
  const t = nowMs(), left = Math.max(0, GT.until - t), sec = Math.ceil(left / 1000), step = GT_STEPS[GT.i];
  const g = { k: `Pull ${Math.min(GT.i + 1, GT_STEPS.length)} of ${GT_STEPS.length}`, title: "", count: "", sub: "", go: false };
  if (GT.phase === "wait") {
    g.title = "Getting ready"; g.sub = REC.probing ? "Reading your Crafty's sensors first, about 45 seconds. Don't pull yet." : "Waiting for the temperature to hold steady. Don't pull yet.";
    if (PD.settled && !REC.probing) { GT.phase = "rest"; GT.until = t + GT_LEAD; return gtTick(); }
  } else if (GT.phase === "rest") {
    g.title = `Next: ${step[0].toLowerCase()} pull, ${step[1]} s`; g.count = String(sec); g.sub = "Get ready. Start pulling when it buzzes.";
    if (sec !== gtLastSec && sec <= 3 && sec > 0) buzz(40);
    if (left <= 0) { GT.phase = "pull"; GT.until = t + step[1] * 1000; buzz(300); rec("guide", "pull start", `${step[0]} ${step[1]} s`); GT.win.push([t, t + step[1] * 1000]); return gtTick(); }
  } else if (GT.phase === "pull") {
    g.title = `${step[0]} pull`; g.count = String(sec); g.sub = "Keep pulling until it buzzes."; g.go = true;
    if (left <= 0) {
      buzz([120, 80, 120]); rec("guide", "pull end", `${step[0]} ${step[1]} s`);
      GT.i++;
      if (GT.i >= GT_STEPS.length) { GT.phase = "done"; GT.until = t + 12000; rec("guide", "test done"); gtDone = true; store.set(KEY.pd, { sens: pdSens, gtDone }); }
      else { GT.phase = "rest"; GT.until = t + GT_REST; }
      return gtTick();
    }
  } else if (GT.phase === "done") {
    g.k = "Guided test"; g.title = "All done"; g.sub = gtSummary() + " Tap Share to send the recording.";
    if (PD.inHit) GT.until = t + 5000; // let a last pull finish being measured
  }
  gtLastSec = sec;
  const box = $("guide");
  box.hidden = false; box.className = "guide" + (g.go ? " go" : "");
  put($("gStep"), "text", g.k); put($("gTitle"), "text", g.title); put($("gCount"), "text", g.count); put($("gSub"), "text", g.sub);
  put($("gShare"), "hidden", GT.phase !== "done"); put($("gStop"), "text", GT.phase === "done" ? "Close" : "Stop test");
}
// Counted pulls are noted against the test so the end screen can say how many it caught
const gtNote = (s, start) => { if (GT.on && GT.phase !== "wait") { GT.counted.push(s); GT.starts.push(start); } };
// Which of the six pulls each method saw: a pull counts as seen if it started between the buzz and 12 s after the
// stop buzz (the temperature reacts late)
function gtCaught(starts) { return GT.win.filter(([a, b]) => starts.some(x => x >= a - 1000 && x <= b + 12000)).length; }
function gtSummary() {
  const n = GT.win.length, tc = gtCaught(GT.starts), dc = gtCaught(DEV.uses.slice(GT.dev0));
  const dev = DEV.last != null ? ` The Crafty itself sensed ${dc} of ${n}.` : "";
  const tip = tc < n ? " For pulls it can't see, tap + Pull beside the heater button." : "";
  return `The page counted ${tc} of ${n} pulls.${dev}${tip}`;
}

