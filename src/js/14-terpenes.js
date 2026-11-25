// ---- Terpenes ----
// Published boiling points (pure compound, sea-level pressure): Leafly "Target terpenes: temperature matters"
// and extraktLAB's terpene chart. Where they differ by a degree or two, the midpoint is used.
// Caryophyllene: charts that say 130 °C quote it at reduced pressure; at normal pressure it boils far above
// the Crafty's 210 °C limit, so its pick is the device's top temp.
const TERPS = [
  { id: "pinene", name: "Pinene", c: 156, note: "Pine, sharp, fresh" },
  { id: "myrcene", name: "Myrcene", c: 169, note: "Earthy, musky, fruity" },
  { id: "limonene", name: "Limonene", c: 177, note: "Citrus" },
  { id: "linalool", name: "Linalool", c: 198, note: "Floral, lavender" },
  { id: "caryo", name: "Caryophyllene", c: 210, note: "Pepper, spice. Boils above the Crafty's top temp, so this is the top setting" }
];
const terpOf = id => TERPS.find(t => t.id === id) || null;
let TP = null; // the terpene picked for this session, cleared when you set the temp by hand
const startOf = pr => { const t = terpOf(pr.terp); return t ? clamp(t.c, LIM.MIN, LIM.MAX) : pr.base; };
function pickTerp(id) {
  const t = terpOf(id);
  TP = t ? t.id : null; CL.mark = CL.min;
  if (t && F.sess) F.sess.terp = t.name;
  if (t && S.connected) setTarget(clamp(t.c, LIM.MIN, LIM.MAX), 0);
  renderTerps(); render();
  if (t) { closeSheets(); toast(`${t.name}: ${fmt(t.c)}°${S.unit}. ${t.note}.`, 3500); }
}
function renderTerps() {
  $("terps").replaceChildren(...[{ id: null, name: "Off" }, ...TERPS].map(t => {
    const b = document.createElement("button");
    b.textContent = t.id ? `${t.name} ${fmt(t.c)}°` : "Off";
    b.className = (t.id || null) === TP ? "on" : "";
    b.addEventListener("click", () => pickTerp(t.id));
    return b;
  }));
}
// You set the temperature yourself: the terpene pick no longer applies, and a climb carries on from your temp
const handSet = () => { if (TP) { TP = null; renderTerps(); } CL.mark = CL.min; };

