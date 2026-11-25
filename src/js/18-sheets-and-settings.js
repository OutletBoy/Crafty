// ---- Sheets ----
// One sheet at a time. Close with Done, a tap outside, a swipe down, Escape, or the phone's Back button
// (opening a sheet adds a history step, so Back closes the sheet instead of leaving the page and dropping the Crafty).
const SHEETS = { settings: ["sheetWrap", "sheet"], hist: ["histWrap", "histSheet"], prof: ["profWrap", "profSheet"] };
let openSh = null, histPushed = false;
function hideSheet(name) { const [w, s] = SHEETS[name]; $(w).classList.remove("open"); $(s).inert = true; $(s).style.transform = ""; if (openSh === name) openSh = null; }
function showSheet(name) {
  if (openSh && openSh !== name) hideSheet(openSh);
  openSh = name;
  const [w, s] = SHEETS[name]; $(w).classList.add("open"); $(s).inert = false;
  if (!histPushed) { try { history.pushState({ craftySheet: 1 }, ""); histPushed = true; } catch (e) {} }
  render();
}
function closeSheets() {
  if (openSh) hideSheet(openSh);
  if (histPushed) { histPushed = false; try { history.back(); } catch (e) {} }
}
window.addEventListener("popstate", () => { if (LB.asking) lbAskHide(); if (histPushed) { histPushed = false; if (openSh) hideSheet(openSh); if (LB.open) lbClose(true); } });
document.addEventListener("keydown", e => { if (e.key !== "Escape") return; if (LB.asking) lbAskHide(); else if (openSh) closeSheets(); else if (LB.open) lbClose(); });
for (const name of Object.keys(SHEETS)) {
  const [w, s] = SHEETS[name], sheet = $(s), head = sheet.querySelector ? sheet.querySelector(".shead") : null;
  $(s).inert = true;
  $(w).querySelector && $(w).querySelector(".scrim").addEventListener("click", closeSheets);
  if (!head) continue;
  // Swipe the top of a sheet down to close it
  let y0 = null, dy = 0;
  head.addEventListener("pointerdown", e => { if (e.target.closest("button")) return; y0 = e.clientY; dy = 0; sheet.classList.add("dragging"); try { head.setPointerCapture(e.pointerId); } catch (x) {} });
  head.addEventListener("pointermove", e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; });
  const end = () => { if (y0 == null) return; y0 = null; sheet.classList.remove("dragging"); sheet.style.transform = ""; if (dy > 80) closeSheets(); };
  head.addEventListener("pointerup", end); head.addEventListener("pointercancel", end);
}
function openHist() { renderHistory(); showSheet("hist"); }

// ---- Settings sheet ----
function drawSettings() {
  const on = S.connected;
  put($("bMinus"), "disabled", !on || S.boost == null);
  put($("bPlus"), "disabled", !on || S.boost == null);
  put($("boostVal"), "text", S.boost == null ? "--" : "+" + Math.round(dU(S.boost)) + "°");
  put($("led"), "disabled", !on || !S.chars.led);
  put($("findBtn"), "disabled", !on || !S.chars.status2);
  if (S.led != null && document.activeElement !== $("led")) put($("led"), "value", String(S.led));
  put($("ledVal"), "text", on && !S.chars.led ? "Not offered" : S.led == null ? "--" : S.led + "%");
  // Disconnect while connected; while not, "Pick another" forgets this Crafty so Connect lists devices again
  put($("discBtn"), "text", on || S.reconnecting ? "Disconnect" : "Pick another");
  put($("discBtn"), "disabled", !on && !S.reconnecting && !S.device);
  put($("fwTitle"), "text", on ? (S.device && S.device.name || "Crafty") : S.reconnecting ? "Reconnecting" : "Not connected");
  put($("fwInfo"), "text", on ? [S.fw && "Software " + S.fw, S.serial && "serial " + S.serial, S.devF ? "set to °F" : ""].filter(Boolean).join(" · ") || "Connected" : "Connect to see details");
  put($("unitF"), "class", S.unit === "F" ? "on" : ""); put($("unitC"), "class", S.unit === "C" ? "on" : "");
  const note = !store.ok ? "This browser isn't letting the page save anything, so profiles, history and learning reset when you close it."
    : store.readOnly ? "Your saved data came from a newer version of this page, so this copy only reads it. Open the newer page to make changes stick."
    : store.full ? "Phone storage for this page is full, so new changes aren't being saved."
    : store.damaged.length ? "Some saved data was damaged and has been reset. A copy was kept on this phone." : "";
  put($("storeNote"), "text", note); put($("storeNote"), "hidden", !note);
  const h = batteryHealth();
  put($("healthVal"), "text", h && h.pct ? h.pct + "%" : "--");
  put($("healthSub"), "text", h && h.pct ? `Compared with your first week · ${M.cycles.toFixed(1)} charges logged` : `Learning: needs about 2 weeks of use · ${M.cycles.toFixed(1)} charges logged`);
  put($("bestSub"), "text", M.bestArea && M.typArea ? `${times(M.bestArea / M.typArea)} your usual pull, on ${new Date(M.bestAt).toLocaleDateString()}` : "No pulls yet");
  // Shortcut on the main screen while heating, until the test has been run once on this phone
  put($("gtMain"), "hidden", !heatingNow() || GT.on || gtDone || LB.open || LB.labels.length > 0);
  // The Start button never goes silent: while it can't run, it says why beside it and again when tapped
  put($("gtBtn"), "@aria-disabled", String(!!gtBlock()));
  put($("gtWhy"), "text", gtBlock() || "Calls out 6 pulls of different strengths and records them. About 4 minutes.");
  put($("pdStatus"), "text", !on ? "Connect and turn the heater on to see this."
    : !heatingNow() ? "Turn the heater on to see this."
    : !PD.settled ? "Waiting for the temperature to hold steady. Pulls are counted once it does."
    : `Holding at ${fmt(PD.base)}°. Firm pulls that dip it ${dU(pdThr()).toFixed(1)}° or more are counted. Soft pulls barely move it, so tap + Pull for those.`);
  if (openSh === "settings") drawTrace();
}
// The last 90 s of chamber temperature, the steady level, and the pulls that were counted
let traceAt = 0;
function drawTrace() {
  const cv = $("trace"), t = nowMs();
  if (!cv.getContext || t - traceAt < 400) return;
  traceAt = t;
  const g = cv.getContext("2d"), W = cv.width, Hh = cv.height, tr = PD.trace;
  g.clearRect(0, 0, W, Hh);
  if (tr.length < 2) return;
  let lo = Infinity, hi = -Infinity;
  for (const [, v, b] of tr) { lo = Math.min(lo, v, b ?? v); hi = Math.max(hi, v, b ?? v); }
  const mid = (lo + hi) / 2, span = Math.max(8, hi - lo + 2);
  const X = ts => W * (1 - (t - ts) / 90000), Y = v => Hh * (0.5 - (v - mid) / span);
  const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim();
  g.fillStyle = col("--accent") + "40";
  for (let i = 1; i < tr.length; i++) if (tr[i][3]) g.fillRect(X(tr[i - 1][0]), 0, X(tr[i][0]) - X(tr[i - 1][0]) + 1, Hh);
  const line = (k, c, w) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); let on = false; for (const p of tr) { if (p[k] == null) { on = false; continue; } on ? g.lineTo(X(p[0]), Y(p[k])) : g.moveTo(X(p[0]), Y(p[k])); on = true; } g.stroke(); };
  line(2, col("--muted"), 2);
  line(1, col("--heat-2"), 3);
}
function renderSens() {
  $("sens").replaceChildren(...Object.entries(SENS).map(([id, s]) => {
    const b = document.createElement("button"); b.textContent = s.label; b.className = id === pdSens ? "on" : "";
    b.addEventListener("click", () => { pdSens = id; store.set(KEY.pd, { sens: id, gtDone }); rec("det", "sensitivity", id); renderSens(); render(); });
    return b;
  }));
}

