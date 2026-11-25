// ---- Battery estimate ----
// The Crafty only reports battery in whole percent, so the page predicts usage from a simple heat model
// and learns one correction factor each time the battery drops a percent. Starting guesses come from
// reviews of the Crafty+: about 40 minutes of heating per charge, about five bowls, ~80 s heat-up.
const AMB = 22;                                  // room temperature, °C
const heatScale = T => Math.max(0.2, (T - AMB) / (185 - AMB));
// sessMin: your usual session length in minutes (heater on to heater off), learned from your sessions.
const FC0 = { corr: 1, drops: 0, sessMin: 7, sessions: 0, cycles: 0, hlog: [] };
// Learned numbers, each checked against a sensible range so damaged data can't produce silly estimates.
// Older pages also learned pull sizes; those fields are dropped here and not saved again.
function cleanModel(j) {
  const m = { ...FC0, hlog: [] };
  if (!j || typeof j !== "object") return m;
  m.corr = num(j.corr, 1, 0.4, 2.5); m.drops = num(j.drops, 0, 0, 1e6); m.sessMin = num(j.sessMin, 7, 2, 20);
  m.sessions = num(j.sessions, 0, 0, 1e6); m.cycles = num(j.cycles, 0, 0, 1e5);
  if (Array.isArray(j.hlog)) m.hlog = j.hlog.filter(x => x && isFinite(x.d) && isFinite(x.c) && isFinite(x.n)).slice(-120);
  return m;
}
let M = cleanModel(store.json(KEY.model));
const fcSave = () => {
  clearTimeout(saveT); saveT = null;
  store.set(KEY.model, M);
  store.set(KEY.bowl, { ts: nowMs(), sess: F.sess ? { ...F.sess } : null, meter: bmSaved() });
};
// Saving is batched: many changes in a row cost one write a couple of seconds later (and one when you leave the page)
let saveT = null;
const saveSoon = () => { if (!saveT) saveT = setTimeout(fcSave, 2000); };
const holdRate = T => 2.3 * heatScale(T);       // % per minute holding temperature
const heatUpCost = (T, from) => 3 * Math.max(0, T - from) / (185 - AMB); // % to heat up
const sessionCost = T => M.corr * (heatUpCost(T, AMB) + M.sessMin * holdRate(T));

// Live tracking
const F = { last: 0, pred: 0, valid: false, prevBatt: null, heaterOn: false, sessStart: 0, atTemp: false, sess: null };
// (r13 and r14 also saved a timed-climb clock here, min and mark; r15 doesn't use it.)
let savedSess = null;
{
  const b = store.json(KEY.bowl);
  if (b && b.sess && isFinite(b.sess.start) && isFinite(b.ts)) savedSess = { ...b.sess, savedAt: b.ts };
}
let fcTimer = null;

