// ---- Connection ----
// Turns a browser or Bluetooth error into a plain-English reason and what to do. Returns null for "you cancelled".
function explain(e) {
  const n = e && e.name, m = (e && e.message) || "";
  if (n === "NotFoundError" && /cancel/i.test(m)) return null;
  if (n === "WrongDevice") return "That isn't a Crafty, or it's a different Storz & Bickel device. Tap Connect and pick the one named STORZ&BICKEL or Crafty.";
  if (n === "Busy") return "Your Crafty is already being controlled from another tab of this page. Use that tab, or close it and tap Connect here.";
  if (n === "TimeoutError") return "The Crafty didn't answer in time. Press its button once to wake it, keep it close, and tap Connect again.";
  if (n === "NotFoundError" && /adapter|off|not available|unavailable/i.test(m)) return "Bluetooth looks switched off on this phone. Turn it on, then tap Connect.";
  if (n === "NotFoundError") return "No Crafty showed up. Press its button once to wake it, keep it close, and make sure no other phone or the S&B web app is connected to it.";
  if (n === "SecurityError" && /^(file|content):$/.test(location.protocol)) return "Chrome won't use Bluetooth on a page opened as a saved file. Open the page from an https:// web address instead.";
  if (n === "SecurityError" || n === "NotAllowedError") return "Bluetooth isn't allowed for this page. In Chrome, tap the icon left of the address, allow Bluetooth (and Nearby devices if your phone asks), then try again.";
  if (n === "NetworkError" || /gatt|connection|disconnected/i.test(m)) return "The Crafty stopped answering. Keep it close and switched on, make sure nothing else is connected to it, then tap Connect.";
  return "Couldn't connect" + (m ? ": " + m : "") + ". Turn the Crafty off and on, then try again.";
}
// Why this browser has no Bluetooth at all, in plain English. Shown under the Connect button straight away.
function noBluetoothReason() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return "iPhones and iPads don't allow Bluetooth in web pages. On iPhone, a browser app made for it, such as Bluefy, can open this page.";
  if (/Firefox|FxiOS/.test(ua)) return "Firefox can't use Bluetooth, so it can't reach the Crafty. Open this page in Chrome instead.";
  if (!window.isSecureContext) return "Chrome only allows Bluetooth on secure pages, and it isn't treating this one as secure. Open the saved file from your Files app with Chrome, or from an https:// web address.";
  return "This browser can't use Bluetooth. Open the page in Chrome on Android (not Firefox, and not a viewer inside another app).";
}

// Only one tab may drive the Crafty, or two tabs would both log sessions and both step the climb.
// Uses the browser's lock service where there is one; without it, a single tab is assumed.
let releaseControl = null;
function takeControl() {
  if (releaseControl) return Promise.resolve(true);
  if (!navigator.locks || !navigator.locks.request) return Promise.resolve(true);
  return new Promise(res => {
    navigator.locks.request("crafty-control", { ifAvailable: true }, lock => {
      if (!lock) { res(false); return; }
      res(true);
      return new Promise(r => { releaseControl = () => { releaseControl = null; r(); }; });
    }).catch(() => res(true));
  });
}
const NOTIFY = ["current", "battery", "project", "status2", "power"];
// connect({auto}) is used for the Connect button and, with auto, for getting the Crafty back after a dropout.
// Returns true when connected. Auto attempts stay quiet; the reconnect loop reports the outcome.
async function connect(opts = {}) {
  const auto = !!opts.auto;
  if (S.connecting) return false;
  if (!auto) { $("toast").hidden = true; stopReconnect(); }
  if (!navigator.bluetooth) { fail(noBluetoothReason()); return false; }
  S.connecting = true; S.userDisc = false; render();
  try {
    if (!(await takeControl())) throw ERR("Busy");
    if (!S.device) {
      S.device = await navigator.bluetooth.requestDevice({
        // Named filters catch Crafties with their usual names; the service filter catches any device that offers
        // the Crafty's control service, whatever it's called, so new models or renamed units still show up.
        filters: [{ namePrefix: "STORZ&BICKEL" }, { namePrefix: "Storz&Bickel" }, { namePrefix: "S&B" }, { namePrefix: "CRAFTY" }, { services: [SVC.s1] }],
        optionalServices: [SVC.s1, SVC.s2, SVC.s3]
      });
      S.device.addEventListener("gattserverdisconnected", onDisconnect);
    }
    const server = await withTimeout(S.device.gatt.connect(), CFG.connectTimeout);
    // Features are found by what the device actually offers, not by model name. Anything missing is skipped,
    // and the controls that need it are switched off with a note instead of failing.
    const svcs = {};
    for (const k of Object.keys(SVC)) { try { svcs[k] = await gatt(() => server.getPrimaryService(SVC[k])); } catch (e) {} }
    if (!svcs.s1) throw ERR("WrongDevice");
    S.svcs = svcs; S.chars = {}; S.seen = {}; REC.probed = false; REC.diag = [];
    for (const [k, [sv, uuid]] of Object.entries(CH)) {
      if (!svcs[sv]) continue;
      try { S.chars[k] = await gatt(() => svcs[sv].getCharacteristic(uuid)); } catch (e) {}
    }
    try { const v = await read("firmware"); if (v) S.fw = text(v); } catch (e) {}
    try { const v = await read("serial"); if (v) S.serial = text(v).slice(0, 8); } catch (e) {}
    await refresh(true);
    for (const k of NOTIFY) {
      const c = S.chars[k]; if (!c) continue;
      c.addEventListener("characteristicvaluechanged", ev => { apply(k, ev.target.value, "notify"); render(); });
      try { await gatt(() => c.startNotifications()); } catch (e) { /* polling covers it */ }
    }
    S.connected = true; S.everConnected = true; S.reconnecting = false;
    fcConnected();
    startPolling();
    keepAwake();
    if (REC.on) recProbe();
    if (LB.open) rec("label", "connected", S.fw || "", "", "labeling carries on");
    S.connecting = false; render();
    return true;
  } catch (e) {
    if (e && e.name === "WrongDevice") S.device = null; // forget it so the next tap offers the device list again
    try { S.device && S.device.gatt.connected && S.device.gatt.disconnect(); } catch (x) {}
    if (!auto) {
      if (F.sess && S.lostAt) endSession(S.lostAt, "connection lost"); // a held session that didn't come back
      if (e && e.name !== "Busy") giveBackControl();
      const why = explain(e); if (why) fail(why);
    }
    S.connecting = false; render();
    return false;
  }
}
function giveBackControl() { if (releaseControl) releaseControl(); }
// Readings outside what a Crafty can report (a glitch, a half-received value) are ignored rather than shown,
// so one bad packet can't fake a pull, a battery drop or a target change.
const SANE = { current: [0, 260], target: [LIM.MIN - 1, LIM.MAX + 1], boost: [0, LIM.BOOST_MAX], battery: [0, 100], led: [0, 100] };
const sane = (k, v) => !SANE[k] || (isFinite(v) && v >= SANE[k][0] && v <= SANE[k][1]);
function apply(k, dv, src = "read") {
  if (!dv || !dv.byteLength) return;
  const t = nowMs();
  S.seen[k] = t;
  let v;
  if (k === "current") { v = readCurrent(dv); if (sane(k, v)) { S.current = v; if (S.connected) pdSample(v, t); } }
  else if (k === "target") { v = readTarget(dv); if (sane(k, v) && !S.dragging && !tTimer) S.target = v; }
  else if (k === "boost") { v = u16(dv) / 10 / (S.devF ? 1.8 : 1); if (sane(k, v)) S.boost = v; }
  else if (k === "battery") { v = u16(dv); if (sane(k, v)) { fcBattery(v); S.battery = v; } }
  else if (k === "led") { v = u16(dv); if (sane(k, v)) S.led = v; }
  else if (k === "project") { v = u16(dv); fcHeater(!!(v & BIT.HEATER)); S.project = v; }
  else if (k === "status2") S.status2 = v = u16(dv);
  else if (k === "power") S.power = v = u16(dv);
  else if (k === "useHours") S.lifeH = v = u16(dv);
  else if (k === "useMins") S.lifeM = v = u16(dv);
  rec(src, k, hex(dv), v == null ? "" : +(+v).toFixed(2), k === "current" && PD.settled ? `base ${PD.base.toFixed(2)} thr ${pdThr().toFixed(2)}${PD.inHit ? " pull" : ""}` : "");
}
async function refresh(all) {
  // Target first, so the °F/°C setting is known before the current temperature is read
  const keys = all ? ["target", "current", "boost", "battery", "led", "project", "status2", "power", "useHours", "useMins"] : ["project", "status2", "battery", "power"];
  const t = nowMs();
  for (const k of keys) {
    if (!all && t - (S.seen[k] || 0) < 4500) continue; // pushed to us recently, no need to ask
    try { apply(k, await read(k), "read"); } catch (e) {}
  }
}
let poll = null;
function startPolling() {
  clearInterval(poll);
  poll = setInterval(async () => { if (!S.connected || S.dragging) return; await refresh(false); render(); }, 5000);
}
// A dropout you didn't ask for (out of range, phone slept, Crafty glitched) starts a quiet reconnect loop. The current
// session, bowl and climb are held, and carry on if the Crafty comes back within CFG.resumeWindow.
function onDisconnect() {
  if (!S.connected) return; // already handled, or a failed connect attempt
  S.connected = false; clearInterval(poll); clearInterval(fcTimer); flushOps();
  lbCancelHold("disconnect");
  if (LB.open) rec("label", "connection lost");
  if (PD.inHit) pdEnd(nowMs(), false);
  S.lostAt = nowMs(); fcSave();
  if (S.userDisc) { endSession(S.lostAt, ""); giveBackControl(); releaseWake(); }
  else startReconnect();
  render();
}
function endSession(t, note) { if (F.sess) logSession(t, note); F.heaterOn = false; }
function startReconnect() {
  stopReconnect(); S.reconnecting = true;
  let i = 0;
  const attempt = async () => {
    S.retryT = null;
    if (!S.reconnecting) return;
    if (await connect({ auto: true })) { toast("Reconnected. Your session carried on.", 3000); return; }
    if (!S.reconnecting) return;
    if (i < CFG.retryDelays.length) { S.retryT = setTimeout(attempt, CFG.retryDelays[i++]); return; }
    // Out of tries: close the session where the connection was lost and say what to do
    S.reconnecting = false; endSession(S.lostAt, "connection lost"); giveBackControl(); releaseWake(); fcSave();
    fail("Lost the Crafty and couldn't get it back. Make sure it's on and close by, then tap Reconnect.");
    render();
  };
  S.retryT = setTimeout(attempt, CFG.retryDelays[i++]);
}
function stopReconnect() { clearTimeout(S.retryT); S.retryT = null; S.reconnecting = false; }
function disconnect() {
  S.userDisc = true; stopReconnect();
  if (S.connected) { try { S.device && S.device.gatt.disconnect(); } catch (e) {} onDisconnect(); }
  else { endSession(S.lostAt || nowMs(), ""); giveBackControl(); }
  closeSheets(); render();
}
// "Pick another" when not connected: forget this Crafty so Connect shows the device list again
function forgetDevice() { disconnect(); if (S.device) S.device.removeEventListener("gattserverdisconnected", onDisconnect); S.device = null; S.fw = ""; S.serial = ""; render(); }
let wake = null;
async function keepAwake() { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } } catch (e) {} }
function releaseWake() { try { wake && wake.release(); } catch (e) {} wake = null; }
// Coming back to the page: keep the screen awake again, and if the phone dropped the Crafty while asleep, get it back.
// Going away: save now rather than waiting for the next scheduled save.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") { lbCancelHold("hidden"); fcSave(); lbSave(); return; }
  if (S.connected) keepAwake();
  else if (S.device && S.everConnected && !S.userDisc && !S.connecting && !S.reconnecting && releaseControl) startReconnect();
  render();
});
window.addEventListener("pagehide", () => { fcSave(); lbSave(); });

