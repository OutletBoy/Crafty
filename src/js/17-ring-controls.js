// ---- Drag the ring to set the target ----
const ring = $("ring");
let lastFrac = 0, lastWhole = null, dragId = null;
function fracAt(ev) {
  const r = ring.getBoundingClientRect(), s = 300 / r.width;
  const x = (ev.clientX - r.left) * s - CX, y = (ev.clientY - r.top) * s - CY;
  const dist = Math.hypot(x, y);
  const rel = (Math.atan2(y, x) * 180 / Math.PI - ARC0 + 720) % 360;
  const f = rel <= SWEEP ? rel / SWEEP : S.dragging ? (lastFrac > 0.5 ? 1 : 0) : (rel < SWEEP + 45 ? 1 : 0); // in the open bottom: stick to the nearer end
  return { f, dist };
}
function dragTo(ev) {
  const { f } = fracAt(ev);
  if (Math.abs(f - lastFrac) > 0.5) return; // don't let one move wrap straight from the top end to the bottom end
  lastFrac = f;
  const c = snapC(LIM.MIN + f * (LIM.MAX - LIM.MIN));
  const whole = Math.round(toU(c));
  if (whole !== lastWhole) { if (lastWhole != null && whole % 5 === 0) buzz(4); lastWhole = whole; }
  setTarget(c, 450);
}
ring.addEventListener("pointerdown", ev => {
  if (!S.connected || S.target == null || ev.target.closest("button")) return;
  const { f, dist } = fracAt(ev);
  if (dist < R - 48 || dist > R + 40) return; // only the ring band, not the numbers in the middle
  ev.preventDefault();
  dragId = ev.pointerId; try { ring.setPointerCapture(dragId); } catch (e) {}
  S.dragging = true; ring.classList.add("drag");
  lastFrac = f; lastWhole = null;
  dragTo(ev);
});
ring.addEventListener("pointermove", ev => { if (S.dragging && ev.pointerId === dragId) { ev.preventDefault(); dragTo(ev); } });
const endDrag = ev => {
  if (!S.dragging || (ev && ev.pointerId !== dragId)) return;
  S.dragging = false; dragId = null; ring.classList.remove("drag");
  if (S.target != null) { handSet(); setTarget(S.target, 0); } // write right away on release
};
ring.addEventListener("pointerup", endDrag);
ring.addEventListener("pointercancel", endDrag);
ring.addEventListener("keydown", ev => {
  const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[ev.key];
  if (step) { ev.preventDefault(); nudge(step); }
});

// ---- Hold-to-repeat for − and + ----
function holdRepeat(el, fn) {
  let t = null, i = null;
  const stop = () => { clearTimeout(t); clearInterval(i); t = i = null; };
  el.addEventListener("pointerdown", e => { if (el.disabled) return; e.preventDefault(); e.stopPropagation(); fn(); buzz(4); t = setTimeout(() => { i = setInterval(fn, 110); }, 420); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => el.addEventListener(ev, stop));
  el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
}
holdRepeat($("minus"), () => nudge(-1));
holdRepeat($("plus"), () => nudge(1));
holdRepeat($("bMinus"), () => setBoost((S.boost || 0) - (S.unit === "F" ? 5 / 9 : 1)));
holdRepeat($("bPlus"), () => setBoost((S.boost || 0) + (S.unit === "F" ? 5 / 9 : 1)));

