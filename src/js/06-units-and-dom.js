// ---- Units ----
const toU = c => S.unit === "F" ? c * 9 / 5 + 32 : c;
const fromU = v => S.unit === "F" ? (v - 32) * 5 / 9 : v;
const dU = c => S.unit === "F" ? c * 9 / 5 : c;
const fmt = c => c == null ? "--" : String(Math.round(toU(c)));
const PRESETS = { C: [185, 195, 205], F: [365, 380, 400] };
const snapC = c => clamp(fromU(Math.round(toU(c))), LIM.MIN, LIM.MAX); // whole display degrees
// A Crafty set to Fahrenheit reports its target in °F x10 (above 210 can only be °F). Its current temperature is
// assumed to follow the same setting.
const fToC = f => (f - 32) / 1.8;
function readTarget(dv) { const t = u16(dv) / 10; if (t > LIM.MAX) { S.devF = true; return fToC(t); } if (t >= LIM.MIN) S.devF = false; return t; }
// Above 260 can only be °F (the chamber never gets that hot in °C), so it also catches °F before the target is read
function readCurrent(dv) { const t = u16(dv) / 10; if (t > 260 && t <= 450) S.devF = true; return S.devF ? fToC(t) : t; }
// Writes go back in the Crafty's own unit. The boost offset is assumed to follow it too (a difference, so x1.8);
// whatever the truth, reading then rewriting it gives back the same raw number.
const rawTarget = c => enc16((S.devF ? c * 1.8 + 32 : c) * 10);
const rawBoost = c => enc16((S.devF ? c * 1.8 : c) * 10);

// ---- DOM helpers ----
// Lookups are cached, and put() only touches the page when a value really changed. Updates are drawn at most
// once per frame (render() just asks for a frame), so a burst of Bluetooth readings costs one redraw.
const EL = {};
const $ = id => EL[id] || (EL[id] = document.getElementById(id));
const memo = new WeakMap();
function put(el, k, v) {
  let m = memo.get(el); if (!m) memo.set(el, m = {});
  if (m[k] === v) return;
  m[k] = v;
  if (k === "text") el.textContent = v;
  else if (k === "class") el.className = v;
  else if (k === "hidden" || k === "disabled") el[k] = v;
  else if (k[0] === "@") el.setAttribute(k.slice(1), v);
  else if (k[0] === "-") el.style.setProperty(k, v);
  else el.style[k] = v;
}
let booted = false, framePending = false;
const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : f => setTimeout(f, 16);
function render() {
  if (!booted || framePending) return;
  framePending = true;
  raf(() => { framePending = false; draw(); });
}

