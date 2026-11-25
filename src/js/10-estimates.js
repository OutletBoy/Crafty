// ---- Battery, bowl and pull estimates ----
// The Crafty only reports battery in whole percent, so the page predicts usage from a simple heat model
// and learns one correction factor each time the battery drops a percent. Starting guesses come from
// reviews of the Crafty+: about 40 minutes of heating per charge, about five bowls, ~80 s heat-up.
const AMB = 22;                                  // room temperature, °C
const heatScale = T => Math.max(0.2, (T - AMB) / (185 - AMB));
// typArea: your usual pull, as the area of the chamber's dip (°C x seconds). Pull strength is measured against it,
// so it works whatever size of dip your Crafty actually shows. pFull: a finished bowl, in usual-pull units.
const FC0 = { corr: 1, drops: 0, sessMin: 7, hits: 10, sessions: 0, pFull: 12, bowls: 0, typArea: 0, pulls: 0, bestArea: 0, bestAt: 0, cycles: 0, hlog: [] };
// Learned numbers, each checked against a sensible range so damaged data can't produce silly estimates
function cleanModel(j) {
  const m = { ...FC0, hlog: [] };
  if (!j || typeof j !== "object") return m;
  m.corr = num(j.corr, 1, 0.4, 2.5); m.drops = num(j.drops, 0, 0, 1e6); m.sessMin = num(j.sessMin, 7, 2, 20);
  m.hits = num(j.hits, 10, 0, 40); m.sessions = num(j.sessions, 0, 0, 1e6); m.pFull = num(j.pFull, 12, 4, 40);
  m.bowls = num(j.bowls, 0, 0, 1e6); m.typArea = num(j.typArea, 0, 0, 1e4); m.pulls = num(j.pulls, 0, 0, 1e7);
  // Older pages kept the best pull in units of 40 °C·s
  m.bestArea = num(j.bestArea, num(j.best, 0, 0, 100) * 40, 0, 1e5); m.bestAt = num(j.bestAt, 0, 0);
  m.cycles = num(j.cycles, 0, 0, 1e5);
  if (Array.isArray(j.hlog)) m.hlog = j.hlog.filter(x => x && isFinite(x.d) && isFinite(x.c) && isFinite(x.n)).slice(-120);
  return m;
}
let M = cleanModel(store.json(KEY.model));
const fcSave = () => {
  clearTimeout(saveT); saveT = null;
  store.set(KEY.model, M);
  store.set(KEY.bowl, { p: B.p, hits: B.hits, mark: CL.mark, ts: nowMs(), sess: F.sess ? { ...F.sess, hits: F.sessHits } : null });
};
// Saving is batched: many changes in a row cost one write a couple of seconds later (and one when you leave the page)
let saveT = null;
const saveSoon = () => { if (!saveT) saveT = setTimeout(fcSave, 2000); };
const holdRate = T => 2.3 * heatScale(T);       // % per minute holding temperature
const heatUpCost = (T, from) => 3 * Math.max(0, T - from) / (185 - AMB); // % to heat up
const hitCost = T => 0.25 * heatScale(T);       // extra % per hit (airflow cools the chamber)
const extract = T => Math.exp((T - 185) / 30);  // hotter extracts faster: 160 °C ≈ 0.4x, 210 °C ≈ 2.3x
const IDLE = 0.25;                              // usual pulls' worth of extraction per minute just sitting at temp
const sessionCost = T => M.corr * (heatUpCost(T, AMB) + M.sessMin * holdRate(T) + M.hits * hitCost(T));

// Live tracking
const F = { last: 0, pred: 0, valid: false, prevBatt: null, heaterOn: false, sessStart: 0, sessHits: 0, atTemp: false, inHit: false,
            lastPull: 0, lastPullAt: 0, autoAt: 0, lastWasBest: false, sess: null };
const B = { p: 0, hits: 0, endedAt: 0 };
const CL = { mark: 0 }; // bowl % at which the climb last stepped (or started)
let savedSess = null;
{
  const b = store.json(KEY.bowl);
  if (b && isFinite(b.ts) && nowMs() - b.ts < 15 * 60000) { B.p = num(b.p, 0, 0, 1e4); B.hits = num(b.hits, 0, 0, 1e4); CL.mark = num(b.mark, 0, 0, 100); B.endedAt = b.ts; }
  if (b && b.sess && isFinite(b.sess.start) && isFinite(b.ts)) savedSess = { ...b.sess, savedAt: b.ts };
}
let fcTimer = null;

