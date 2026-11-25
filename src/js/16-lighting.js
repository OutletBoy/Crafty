// ---- Lighting (on screen; the Crafty's own LED only takes a brightness over Bluetooth) ----
const LIGHTS = [["classic", "Classic"], ["breathe", "Breathe"], ["heat", "Heat map"], ["cycle", "Color cycle"], ["calm", "Calm"], ["minimal", "Minimal"]];
let lightMode = "breathe";
{ const l = store.raw(KEY.light); if (LIGHTS.some(x => x[0] === l)) lightMode = l; }
const currentLight = () => { const pl = activeProfile().light; return pl && LIGHTS.some(x => x[0] === pl) ? pl : lightMode; };
function heatColor(c) {
  // cold blue -> amber -> deep red across the Crafty's range, in 5 °C steps so it doesn't restyle on every reading
  const f = c == null ? 0 : clamp(Math.round((c - 40) / 5) * 5 / 170, 0, 1);
  return `hsl(${Math.round(205 - 200 * f)} 90% ${Math.round(58 - 6 * f)}%)`;
}
function applyLighting(on, heating, ready, pulling) {
  const mode = currentLight();
  put(document.body, "class", "l-" + mode + (on && heating ? " heating" : "") + (pulling ? " pulling" : "") + (LB.open ? " labon" : ""));
  let glow = !on ? "transparent" : ready ? "var(--ready)" : heating ? "var(--heat)" : "var(--accent)";
  if (mode === "heat" && on) glow = heatColor(S.current);
  const root = document.documentElement;
  put(root, "--glow", glow);
  put(root, "--orb", !on ? "0" : mode === "calm" ? ".28" : heating ? ".75" : ".35");
}
function renderLights() {
  $("lights").replaceChildren(...LIGHTS.map(([id, label]) => {
    const b = document.createElement("button"); b.textContent = label; b.className = id === lightMode ? "on" : "";
    b.addEventListener("click", () => { lightMode = id; store.set(KEY.light, id); renderLights(); render(); });
    return b;
  }));
}
$("pfLight").replaceChildren(...[["", "Use my lighting"], ...LIGHTS].map(([v, l]) => Object.assign(document.createElement("option"), { value: v, textContent: l })));

