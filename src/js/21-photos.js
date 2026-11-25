// ---- Bud photos (r15) ----
// One photo per batch, kept in this browser's IndexedDB on the phone. A photo is never sent anywhere and isn't part of
// a strain list or link. Each is shrunk on the phone to at most 800 px on its long side as a JPEG (around 100 KB) first.
// A batch's "photo" flag (in the strain data) says it has one; the picture itself is stored under the batch's id.
const PH = { dbp: null, urls: {}, ver: {}, max: 800, keepH: 1 };
function phDb() {
  if (!PH.dbp) {
    PH.dbp = new Promise((res, rej) => {
      let r;
      try {
        if (typeof indexedDB === "undefined" || !indexedDB) throw Object.assign(new Error("IndexedDB isn't available"), { name: "Blocked" });
        r = indexedDB.open("crafty-photos", 1);
      } catch (e) { rej(e); return; }
      r.onupgradeneeded = () => { try { r.result.createObjectStore("photos"); } catch (e) {} };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error("open failed"));
      r.onblocked = () => rej(Object.assign(new Error("blocked"), { name: "Blocked" }));
    });
    PH.dbp.catch(() => { PH.dbp = null; }); // try again next time
  }
  return PH.dbp;
}
function phTx(mode, fn) {
  return phDb().then(db => new Promise((res, rej) => {
    let tx, r;
    try { tx = db.transaction("photos", mode); r = fn(tx.objectStore("photos")); } catch (e) { rej(e); return; }
    tx.oncomplete = () => res(r ? r.result : undefined);
    tx.onerror = () => rej(tx.error || (r && r.error) || new Error("failed"));
    tx.onabort = () => rej(tx.error || new Error("aborted"));
  }));
}
const phPut = (id, blob) => phTx("readwrite", os => os.put({ blob, ts: nowMs() }, id));
const phGet = id => phTx("readonly", os => os.get(id)).then(v => (v && v.blob) || null);
const phDel = id => phTx("readwrite", os => os.delete(id));
// A screen address for a batch's photo (made once, reused), or null
function phUrl(id) {
  if (PH.urls[id]) return Promise.resolve(PH.urls[id]);
  return phGet(id).then(b => b ? (PH.urls[id] = URL.createObjectURL(b)) : null).catch(() => null);
}
function phForget(id) { if (PH.urls[id]) { try { URL.revokeObjectURL(PH.urls[id]); } catch (e) {} delete PH.urls[id]; } PH.ver[id] = (PH.ver[id] || 0) + 1; }
const photoErr = code => Object.assign(new Error(code), { code });
async function shrinkPhoto(file) {
  if (!file || (file.type && !/^image\//.test(file.type))) throw photoErr("read");
  if (typeof createImageBitmap !== "function") throw photoErr("shrink");
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { throw photoErr("read"); }
  const sc = Math.min(1, PH.max / Math.max(bmp.width, bmp.height, 1));
  const w = Math.max(1, Math.round(bmp.width * sc)), h = Math.max(1, Math.round(bmp.height * sc));
  let blob = null;
  try {
    if (typeof OffscreenCanvas === "function") {
      const c = new OffscreenCanvas(w, h); c.getContext("2d").drawImage(bmp, 0, 0, w, h);
      blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    } else {
      const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(bmp, 0, 0, w, h);
      blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.8));
    }
  } catch (e) { throw photoErr("shrink"); }
  finally { try { bmp.close && bmp.close(); } catch (e) {} }
  if (!blob) throw photoErr("shrink");
  return blob;
}
function photoMsg(e) {
  const n = e ? `${e.name} ${e.message}` : "";
  return /quota/i.test(n) ? "Phone storage for the page is full, so the photo wasn't saved. Remove some photos or free up space."
    : e && e.code === "read" ? "Couldn't read that picture. Try another one."
    : e && e.code === "shrink" ? "This browser can't resize photos, so the photo wasn't added."
    : "Photos can't be saved in this browser, so the photo wasn't added. Storage may be blocked, for example in a private tab.";
}
async function addPhoto(sid, bid, file) {
  $("btPhotoNote").textContent = "Adding the photo…";
  try { await phPut(bid, await shrinkPhoto(file)); }
  catch (e) { const m = photoMsg(e); if (btEdit === bid) $("btPhotoNote").textContent = m; toast(m, 6000, null, "err"); return false; }
  const s = strainOf(sid), b = s && s.batches.find(x => x.id === bid);
  if (!b) { phDel(bid).catch(() => {}); return false; } // the batch was deleted meanwhile
  b.photo = true; phForget(bid); saveStrains();
  if (btEdit === bid) { $("btPhotoNote").textContent = ""; renderBatchPhoto(); }
  render(); toast("Photo saved on this phone.", 2500);
  return true;
}
// Removing is undoable for a few seconds; the picture itself is cleared out on a later visit
function removePhoto() {
  const { b } = editBatch(); if (!b || !b.photo) return;
  b.photo = false; phForget(b.id); saveStrains(); renderBatchPhoto(); render();
  toast("Photo removed.", 6000, { label: "Undo", fn: () => { b.photo = true; phForget(b.id); saveStrains(); if (btEdit === b.id) renderBatchPhoto(); render(); } });
}
function renderBatchPhoto() {
  const { b } = editBatch(), has = !!(b && b.photo), id = b && b.id;
  $("btPhotoAdd").textContent = has ? "Replace photo" : "Add photo";
  $("btPhotoDel").hidden = !has;
  $("btImg").hidden = true;
  if (has) phUrl(id).then(u => { if (u && btEdit === id) { $("btImg").src = u; $("btImg").hidden = false; } else if (!u && btEdit === id) $("btPhotoNote").textContent = "This photo couldn't be loaded on this phone."; });
}
function photoPicked() {
  const inp = $("btFile"), f = inp.files && inp.files[0];
  try { inp.value = ""; } catch (e) {}
  if (f && btEdit) addPhoto(stEdit, btEdit, f);
}
// Clears out pictures no batch uses any more (removed, or their batch deleted), once they're over an hour old, so an
// Undo, or a photo another tab is still saving, is never caught. Skipped when the strain data can't be trusted.
async function prunePhotos() {
  if (!store.ok || store.readOnly || store.damaged.includes(KEY.strains)) return 0;
  let j; try { j = JSON.parse(store.raw(KEY.strains)); } catch (e) { return 0; }
  const keep = new Set(cleanStrains(j).list.flatMap(s => s.batches.filter(b => b.photo).map(b => b.id)));
  const old = nowMs() - PH.keepH * 3600000;
  let n = 0;
  try {
    await phTx("readwrite", os => {
      const r = os.openCursor();
      r.onsuccess = () => { const c = r.result; if (!c) return; const v = c.value; if (!keep.has(c.key) && !(v && v.ts > old)) { c.delete(); n++; } c.continue(); };
      return r;
    });
  } catch (e) { return 0; }
  return n;
}
