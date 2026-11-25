// ---- Sheets ----
// One sheet at a time. Close with Done, a tap outside, a swipe down, Escape, or the phone's Back button
// (opening a sheet adds a history step, so Back closes the sheet instead of leaving the page and dropping the Crafty).
const SHEETS = { settings: ["sheetWrap", "sheet"], hist: ["histWrap", "histSheet"], prof: ["profWrap", "profSheet"], str: ["strWrap", "strSheet"] };
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
window.addEventListener("popstate", () => { if (histPushed) { histPushed = false; if (openSh) hideSheet(openSh); } });
document.addEventListener("keydown", e => { if (e.key === "Escape" && openSh) closeSheets(); });
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
}
