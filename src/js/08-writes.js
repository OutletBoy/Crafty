// ---- Writes (debounced so dragging doesn't flood Bluetooth) ----
let tTimer = null;
function setTarget(c, delay = 350) {
  if (!S.connected) return;
  S.target = snapC(c);
  render();
  clearTimeout(tTimer);
  tTimer = setTimeout(async () => {
    tTimer = null;
    try {
      await write("target", rawTarget(S.target));
      // The official app rewrites the boost offset after every target change so the device keeps it
      if (S.boost != null) await write("boost", rawBoost(S.boost));
    } catch (e) { fail("Couldn't set the temperature: " + e.message + "."); }
  }, delay);
}
let bTimer = null;
function setBoost(c) {
  if (!S.connected || S.boost == null) return;
  S.boost = clamp(Math.round(c * 10) / 10, 0, LIM.BOOST_MAX);
  render();
  clearTimeout(bTimer);
  bTimer = setTimeout(() => write("boost", rawBoost(S.boost)).catch(e => fail("Couldn't set boost: " + e.message + ".")), 350);
}
const nudge = dir => { if (S.target != null) { handSet(); setTarget(fromU(Math.round(toU(S.target)) + dir)); } };
async function toggleHeater() {
  const on = !(S.project & BIT.HEATER);
  S.pending = on ? "on" : "off"; buzz(10); render();
  try {
    await write(on ? "heaterOn" : "heaterOff", enc16(0));
    await new Promise(r => setTimeout(r, 600));
    apply("project", await read("project"), "read");
    if (on && !(S.project & BIT.HEATER)) fail("The Crafty didn't start heating. It may refuse while charging or asleep; press its button once and try again.");
  } catch (e) { fail("Couldn't switch the heater: " + e.message + "."); }
  S.pending = false; render();
}
async function findDevice() {
  try { const v = await read("status2"); await write("status2", enc16((v ? u16(v) : S.status2) | BIT.FIND)); toast("Your Crafty should be buzzing now.", 3000); }
  catch (e) { fail("Find didn't work: " + e.message + "."); }
}
let lTimer = null;
function setLed(v) {
  S.led = +v; render();
  clearTimeout(lTimer);
  lTimer = setTimeout(() => write("led", enc16(S.led)).catch(e => fail("Couldn't set brightness: " + e.message + ".")), 250);
}

