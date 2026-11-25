// ---- Ring geometry (viewBox 300x300) ----
const CX = 150, CY = 150, R = 122, ARC0 = 135, SWEEP = 270;
const pt = (deg, r = R) => { const a = deg * Math.PI / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
const frac = c => clamp((c - LIM.MIN) / (LIM.MAX - LIM.MIN), 0, 1);
const arcD = r => { const [x0, y0] = pt(ARC0, r), [x1, y1] = pt(ARC0 + SWEEP, r); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
const arcLen = r => 2 * Math.PI * r * SWEEP / 360;
const ARCLEN = arcLen(R), CLIMBLEN = arcLen(R - 34);
(function drawRing() {
  for (const id of ["track", "fill", "halo"]) $(id).setAttribute("d", arcD(R));
  for (const id of ["climbBg", "climbArc"]) $(id).setAttribute("d", arcD(R - 34));
  for (const [id, len] of [["fill", ARCLEN], ["halo", ARCLEN], ["climbArc", CLIMBLEN]]) { $(id).style.strokeDasharray = len; $(id).style.strokeDashoffset = len; }
  // Scale ticks every 10 °C, longer every 50
  let html = "";
  for (let c = LIM.MIN; c <= LIM.MAX; c += 10) {
    const a = ARC0 + SWEEP * frac(c), major = c % 50 === 0;
    const [ax, ay] = pt(a, R - 16), [bx, by] = pt(a, R - (major ? 26 : 21));
    html += `<line class="scale${major ? " major" : ""}" x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"/>`;
  }
  $("scale").innerHTML = html;
  const [lx, ly] = pt(ARC0, R + 24), [hx, hy] = pt(ARC0 + SWEEP, R + 24);
  $("endLo").setAttribute("x", lx.toFixed(1)); $("endLo").setAttribute("y", (ly + 4).toFixed(1));
  $("endHi").setAttribute("x", hx.toFixed(1)); $("endHi").setAttribute("y", (hy + 4).toFixed(1));
})();

const effTarget = () => clamp((S.target || 0) + ((S.project & BIT.BOOST) || (S.project & BIT.SUPER) ? (S.boost || 0) : 0), LIM.MIN, LIM.MAX);
const heatingNow = () => S.connected && !!(S.project & BIT.HEATER);
const readyNow = () => heatingNow() && !S.dragging && (!!(S.project & BIT.ATTEMP) ||
  (S.current != null && S.target != null && Math.abs(S.current - effTarget()) <= 2));

function draw() {
  const on = S.connected, heating = heatingNow(), ready = readyNow();
  const boost = !!(S.project & BIT.BOOST), sup = !!(S.project & BIT.SUPER);

  put($("app"), "class", "app" + (!on && !S.reconnecting ? " offline" : ""));
  put($("nowNum"), "text", fmt(S.current));
  put($("nowUnit"), "text", "°" + S.unit);
  put($("target"), "text", S.target == null ? "--" : fmt(S.target) + "°");
  put($("endLo"), "text", fmt(LIM.MIN) + "°");
  put($("endHi"), "text", fmt(LIM.MAX) + "°");

  // The line under the target: what matters most right now
  const eff = sup ? "Superboost on" : boost && S.boost ? `Boost on, heading to ${fmt(effTarget())}°`
    : climbText() || terpText() || (heating && !ready ? "Heating up" : "");
  put($("eff"), "text", eff);

  const st = $("state");
  put(st, "class", "state" + (on && ready ? " ready" : heating ? " heating" : ""));
  put(st, "text", S.reconnecting ? "Reconnecting" : S.connecting ? "Connecting" : !on ? (S.device ? "Disconnected" : "Offline")
    : ready ? "Ready" : heating ? "Heating" : "Heater off");

  const grad = !on ? "gIdle" : ready ? "gReady" : heating ? "gHeat" : "gIdle";
  const off = S.current == null ? ARCLEN : ARCLEN * (1 - frac(S.current));
  for (const id of ["fill", "halo"]) { put($(id), "stroke", `url(#${grad})`); put($(id), "strokeDashoffset", String(off)); }
  put($("halo"), "opacity", heating ? "0.18" : "0");
  applyLighting(on, heating, ready);

  const ring = $("ring");
  if (S.target != null && on) {
    const [x, y] = pt(ARC0 + SWEEP * frac(S.target));
    put($("knob"), "@transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    put($("knob"), "@opacity", "1");
    put(ring, "@aria-valuenow", String(Math.round(S.target)));
    put(ring, "@aria-valuetext", fmt(S.target) + " degrees " + (S.unit === "F" ? "Fahrenheit" : "Celsius"));
  } else put($("knob"), "@opacity", "0");
  put($("minus"), "disabled", !on || S.target == null);
  put($("plus"), "disabled", !on || S.target == null);

  // Main button
  const mb = $("mainBtn");
  let cls, label, dis = false, spin = false;
  if (!on) {
    cls = "main connect"; spin = S.connecting;
    label = S.connecting ? (S.reconnecting ? "Reconnecting…" : "Connecting…") : S.reconnecting ? "Reconnecting… tap to try now" : S.device ? "Reconnect" : "Connect to Crafty";
    dis = S.connecting;
  } else if (!S.chars.heaterOn || !S.chars.heaterOff) { cls = "main off"; label = "Heater is controlled on the Crafty"; dis = true; }
  else if (S.pending) { cls = "main " + (S.pending === "on" ? "on" : "off"); label = S.pending === "on" ? "Starting heater…" : "Turning off…"; spin = true; dis = true; }
  else { cls = "main " + (heating ? "on" : "off"); label = heating ? "Turn heater off" : "Turn heater on"; }
  put(mb, "class", cls); put(mb, "disabled", dis); put($("mainTxt"), "text", label);
  put($("mainSpin"), "hidden", !spin);
  const noBt = !navigator.bluetooth ? noBluetoothReason() : "";
  put($("hint"), "text", noBt || "Press the Crafty's button once to wake it, then tap Connect.");
  put($("hint"), "hidden", on || S.reconnecting);

  // Header
  put($("dot"), "class", "dot" + (on ? " on" : S.connecting || S.reconnecting ? " wait" : ""));
  put($("devName"), "text", on ? "Connected" + (S.fw ? " · " + S.fw : "") : S.reconnecting ? "Connection dropped, reconnecting" : S.connecting ? "Connecting" : S.device ? "Disconnected" : "Not connected");
  put($("battChip"), "hidden", S.battery == null || !on);
  if (S.battery != null) {
    put($("battPct"), "text", S.battery + "%");
    put($("battFill"), "width", clamp(S.battery, 0, 100) * 0.16 + "px");
    put($("battFill"), "background", S.battery <= 15 ? "var(--heat)" : charging() ? "var(--accent)" : "var(--ready)");
  }

  // Quick temps
  const ps = $("presets");
  if (ps.dataset.unit !== S.unit) {
    ps.replaceChildren(...PRESETS[S.unit].map(v => {
      const b = document.createElement("button"); b.className = "qbtn num"; b.textContent = v + "°";
      b.dataset.c = fromU(v); b.addEventListener("click", () => { handSet(); setTarget(+b.dataset.c, 0); buzz(6); }); return b;
    }));
    ps.dataset.unit = S.unit;
  }
  for (const b of ps.children) { put(b, "disabled", !on); put(b, "class", "qbtn num" + (S.target != null && Math.abs(+b.dataset.c - S.target) < 0.6 ? " on" : "")); }

  drawSettings();
  renderForecast();
  renderBowl();
  renderClimb();
  drawRec();
}

let toastT = null;
// toast(message, ms, action, kind): ms 0 keeps it until tapped; action {label, fn} adds a button such as Undo; kind "err" for problems.
function toast(msg, ms = 4500, action = null, kind = "") {
  const t = $("toast"), s = document.createElement("span"); s.textContent = msg;
  const kids = [s];
  if (action) {
    const b = document.createElement("button"); b.className = "tact"; b.textContent = action.label;
    b.addEventListener("click", ev => { ev.stopPropagation(); t.hidden = true; action.fn(); });
    kids.push(b);
  }
  t.replaceChildren(...kids); t.className = "toast" + (kind ? " " + kind : ""); t.hidden = false;
  clearTimeout(toastT); if (ms) toastT = setTimeout(() => { t.hidden = true; }, ms);
}
const fail = msg => toast(msg, 0, null, "err");
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

