// ---- Session history (kept on this phone) ----
const cleanHist = h => Array.isArray(h) ? h.filter(x => x && isFinite(x.start) && isFinite(x.mins)).map(x => ({
  start: x.start, mins: num(x.mins, 0, 0, 1e4), tMin: num(x.tMin, 0, 0, 260), tMax: num(x.tMax, 0, 0, 260),
  used: x.used == null ? null : num(x.used, null, 0, 100),
  profile: typeof x.profile === "string" ? x.profile.slice(0, 60) : "", note: typeof x.note === "string" ? x.note.slice(0, 40) : "" })).slice(0, 300) : [];
const rawHist = store.json(KEY.hist);
let H = cleanHist(rawHist);
// If storage fills up, the oldest half of the history makes room
const saveHist = () => store.set(KEY.hist, H, () => { if (H.length < 20) return false; H.length = Math.floor(H.length / 2); return true; });
// Sessions saved by older pages carry pull counts; save the history once without them
if (Array.isArray(rawHist) && rawHist.some(x => x && ("hits" in x || "pulls" in x || "best" in x)) && store.ok && !store.readOnly) saveHist();
const newSess = t => ({ start: t, batt: S.battery, tMin: S.target ?? 0, tMax: S.target ?? 0, profile: activeProfile().name, terp: terpOf(TP)?.name || "" });
function logSession(t, note, x = F.sess) {
  if (x === F.sess) F.sess = null;
  if (!x) return;
  const mins = (t - x.start) / 60000;
  if (mins < 1) return;
  H.unshift({ start: x.start, mins: +mins.toFixed(1), tMin: +x.tMin.toFixed(1), tMax: +x.tMax.toFixed(1),
              used: x.batt != null && S.battery != null ? Math.max(0, x.batt - S.battery) : null,
              profile: x.profile + (x.terp ? " · " + x.terp : ""), note });
  H.sort((a, b) => b.start - a.start); // a session recovered from a reload can be older than one already logged
  if (H.length > 300) H.length = 300;
  saveHist();
}
// A session saved before the page was closed or reloaded: resume it on reconnect if it's recent, otherwise log it now
if (savedSess) {
  if (nowMs() - savedSess.savedAt < CFG.resumeWindow) { F.sess = savedSess; F.sessStart = savedSess.start; S.lostAt = savedSess.savedAt; }
  else logSession(savedSess.savedAt, "page closed", savedSess);
}
function renderHistory() {
  const life = [];
  const add = (label, val) => { const d = document.createElement("div"); const b = document.createElement("b"); b.textContent = val; d.append(b, label); life.push(d); };
  if (S.lifeH != null) add("Heater time on this Crafty", `${S.lifeH} h${S.lifeM != null ? " " + S.lifeM + " min" : ""}`);
  else add("Heater time on this Crafty", S.connected ? "Not reported" : "Connect to read");
  const totMin = H.reduce((a, x) => a + x.mins, 0);
  add("Sessions logged here", `${H.length} · ${totMin >= 60 ? (totMin / 60).toFixed(1) + " h" : Math.round(totMin) + " min"}`);
  if (S.lifeH != null) add("Sessions, all time (est.)", "~" + Math.round((S.lifeH * 60 + (S.lifeM || 0)) / Math.max(2, M.sessMin)));
  $("life").replaceChildren(...life);
  const df = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  $("histList").replaceChildren(...(H.length ? H.slice(0, 100).map(x => {
    const r = document.createElement("div"); r.className = "hrow";
    const b = document.createElement("b"); b.textContent = `${df.format(new Date(x.start))} · ${Math.round(x.mins)} min`;
    const temps = Math.round(toU(x.tMin)) === Math.round(toU(x.tMax)) ? `${fmt(x.tMin)}°` : `${fmt(x.tMin)}° to ${fmt(x.tMax)}°`;
    const d = document.createElement("div");
    d.textContent = [temps, x.used != null ? `${x.used}% battery` : "", x.profile, x.note].filter(Boolean).join(" · ");
    r.append(b, d); return r;
  }) : [Object.assign(document.createElement("div"), { className: "note", textContent: "Sessions show up here after you heat up for at least a minute." })]));
}
function fcBattery(b) {
  const prev = F.prevBatt; F.prevBatt = b;
  if (prev == null) return;
  if (b > prev) M.cycles += (b - prev) / 100; // count charge going in, 100% = one cycle
  if (b > prev || charging()) { F.valid = false; F.pred = 0; return; }
  if (b === prev) return;
  // The first drop only tells us where the percent boundary is; measure from there
  if (F.valid && F.pred > 0.15) {
    const ratio = clamp((prev - b) / F.pred, 0.3, 3);
    M.corr = clamp(M.corr * 0.85 + ratio * 0.15, 0.4, 2.5);
    M.drops += prev - b;
    // Once a day, log how much the battery actually drains against the model; a rising ratio means less capacity
    const day = Math.floor(nowMs() / 864e5), lastLog = M.hlog[M.hlog.length - 1];
    if (!lastLog || lastLog.d !== day) M.hlog.push({ d: day, c: +M.corr.toFixed(3), n: M.drops });
    else { lastLog.c = +M.corr.toFixed(3); lastLog.n = M.drops; }
    if (M.hlog.length > 120) M.hlog.shift();
    saveSoon();
  }
  F.valid = true; F.pred = 0;
}
function renderForecast() {
  const on = S.connected, T = S.target == null ? null : effTarget();
  const conf = $("fcConf");
  if (!on || S.battery == null || T == null) {
    put($("fcMain"), "text", "--");
    put($("fcSub"), "text", !on ? (S.reconnecting ? "Reconnecting…" : "Connect to estimate") : !S.chars.battery ? "Not reported by this Crafty" : "Reading battery…");
    put(conf, "hidden", true);
  } else if (charging()) {
    put($("fcMain"), "text", S.battery + "%"); put($("fcSub"), "text", "Charging"); put(conf, "hidden", true);
  } else {
    const perMin = M.corr * holdRate(T);
    const mins = Math.max(0, Math.floor(S.battery / perMin));
    const bowls = S.battery / sessionCost(T);
    const key = mins + "|" + fmt(T);
    if (memo.get($("fcMain"))?.k !== key) {
      $("fcMain").replaceChildren(document.createTextNode("~" + mins + " min"), Object.assign(document.createElement("small"), { textContent: "at " + fmt(T) + "°" }));
      memo.set($("fcMain"), { k: key });
    }
    put($("fcSub"), "text", bowls < 1 ? "Less than a full bowl left" : "About " + (bowls < 2 ? bowls.toFixed(1) : Math.floor(bowls)) + " bowls left");
    // Starts from review figures; labelled until it has learned from about 20 real percent drops on this Crafty
    put(conf, "hidden", M.drops >= 20); put(conf, "text", "estimate");
  }
}
function batteryHealth() {
  // Needs at least two weeks and 60 measured percent. Baseline = the first week's average; recent = the last week's.
  const L = M.hlog; if (L.length < 2) return null;
  const span = L[L.length - 1].d - L[0].d;
  if (span < 14 || M.drops < 60) return { learning: true, span, drops: M.drops };
  const first = L.filter(x => x.d - L[0].d < 7), last = L.filter(x => L[L.length - 1].d - x.d < 7);
  const avg = a => a.reduce((s, x) => s + x.c, 0) / a.length;
  return { pct: clamp(Math.round(100 * avg(first) / avg(last)), 40, 100) };
}
