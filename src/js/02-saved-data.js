// ---- Saved data ----
// Everything is kept in this browser's localStorage. Every read is checked and falls back to a safe default,
// so cleared, blocked, full or damaged storage can never stop the page from working.
// SCHEMA goes up whenever a saved shape changes; a page older than the saved data won't overwrite it.
// 2: pulls measured relative to your usual pull; climb profiles step by % of the bowl.
// 3 (r13): pull counting and the bowl estimate removed. Climb profiles step every few minutes at temperature.
const SCHEMA = 3;
const KEY = { unit: "crafty-unit", model: "crafty-model-v2", bowl: "crafty-bowl" /* the live session and climb clock; the name is older than the change */, prof: "crafty-profiles", light: "crafty-light", hist: "crafty-history", schema: "crafty-schema", meter: "crafty-meter" /* bowl meter pace, r14 */, strains: "crafty-strains" /* strains, batches and their paces, r15 */ };
const store = {
  ok: true, readOnly: false, damaged: [], full: false,
  raw(k) { try { return localStorage.getItem(k); } catch (e) { store.ok = false; return null; } },
  // Parsed JSON, or null when missing. Damaged data is set aside under "<key>-damaged" (not thrown away) and reported.
  json(k) {
    const s = store.raw(k); if (s == null) return null;
    try { return JSON.parse(s); } catch (e) {
      store.damaged.push(k);
      try { localStorage.setItem(k + "-damaged", s); localStorage.removeItem(k); } catch (x) {}
      return null;
    }
  },
  set(k, v, onFull) {
    if (!store.ok || store.readOnly) return false;
    try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); return true; }
    catch (e) {
      if (/quota/i.test(e && (e.name + e.message)) && onFull && onFull()) return store.set(k, v); // make room, try once more
      if (!store.full) { store.full = true; toast("This phone's storage for the page is full, so recent changes aren't being saved.", 0, null, "err"); }
      return false;
    }
  }
};
(function checkSchema() {
  const v = parseInt(store.raw(KEY.schema), 10);
  if (v > SCHEMA) store.readOnly = true; // saved by a newer version of this page: read it, don't overwrite it
  else if (v !== SCHEMA && store.ok) { try { localStorage.setItem(KEY.schema, String(SCHEMA)); } catch (e) { store.ok = false; } }
})();
// Pull counting was removed in r13: soft and medium pulls don't show in anything the Crafty reports over Bluetooth.
// What older pages saved for it (detector settings, labeled sessions) is removed quietly, so nothing stale lingers.
const GONE = ["crafty-pd", "crafty-label", "crafty-label-rows", "crafty-label-done", "crafty-label-temp"];
(function dropPullData() {
  if (!store.ok || store.readOnly) return;
  for (const k of GONE) for (const x of [k, k + "-damaged"]) { try { localStorage.removeItem(x); } catch (e) {} }
})();
const num = (v, d, lo = -Infinity, hi = Infinity) => typeof v === "number" && isFinite(v) ? clamp(v, lo, hi) : d;

