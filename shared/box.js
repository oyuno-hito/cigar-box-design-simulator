/*
 * 共通ロジック（preview / draft で共有）
 * 人が管理する決定論的なコードだけを置く。AI はこのファイルを編集しない。
 * file:// でも動くよう ES モジュールではなく、グローバル CigarBox として公開する。
 */
(function (global) {
  "use strict";

  // =========================================================
  // 固定仕様
  // =========================================================
  // 用紙はコンビニのシールプリント 178×127mm 固定。
  // 下側のカット幅は 10mm で一旦固定（カット後の高さ 117mm ＝ 貼り付け先 120mm − 余白 3mm）。
  //   検討: 7mm カット（カット後 120mm）や、用紙サイズの見直しも含めて後で再検討する。
  // サイドテープの色（tapeColor）は固定。幅は画面で変更できる。
  // デザイン（画像・SVG）は「箱の面と同寸」で作る前提。座標は mm（SVG は viewBox の 1 単位 = 1mm）。
  const FIXED = {
    sheetW: 178, sheetH: 127, boxH: 120, boxD: 60,
    cutBottom: 10,
    tapeColor: "#ffffff",
    boxColor: "#cbd5e1", bgColor: "#ffffff",
    dpi: 300
  };

  // 箱ごとの仕様。cutRight は用紙の右側を切る幅（mm）。
  //   きぞはこ：用紙(178)が貼り付け先(180)より小さいので横は切らない。
  //   かずはこ：余白 3mm 固定 → カット後の幅 = 165 − 3 = 162mm → 178 − 162 = 16mm を右側だけ切る。
  //     検討: 切る側（右のみ）、余白の考え方（合計 3mm）は後で見直す。
  const BOXES = {
    kizo: { label: "きぞはこ（180×120×60mm）", boxW: 180, cutRight: 0 },
    kazu: { label: "かずはこ（165×120×60mm）", boxW: 165, cutRight: 16 }
  };

  // 箱・サイドテープの設定項目（両ページ共通）
  const BOX_PARAMS = [
    { g: "箱", key: "box", label: "箱のサイズ", type: "select", options: Object.entries(BOXES).map(([k, b]) => [k, b.label]), def: "kizo" },
    { g: "サイドテープ", key: "sideTape", label: "サイドテープを貼る", type: "bool", def: true },
    { key: "tapeWidth", label: "幅", unit: "mm", min: 1, max: 30, step: 0.5, def: 6 }
  ];

  const MODES = {
    flat: "プレビュー（平面）",
    solid: "プレビュー（立体）",
    triple: "プレビュー（3箱）",
    print: "印刷用"
  };

  const f = (n) => (Math.round(n * 100) / 100).toString();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 固定仕様と箱サイズを展開した、描画用の値
  const spec = (values) => ({
    ...FIXED, ...values,
    boxW: BOXES[values.box].boxW,
    cutRight: BOXES[values.box].cutRight,
    tape: values.sideTape ? values.tapeWidth : 0
  });

  // =========================================================
  // レイアウト計算（mm）
  // =========================================================
  function layout(v) {
    const cb = Math.max(0, Math.min(v.cutBottom, v.sheetH - 1));
    const cr = Math.max(0, Math.min(v.cutRight, v.sheetW - 1));
    const kw = v.sheetW - cr, kh = v.sheetH - cb; // カット後の用紙（用紙の左上基準）
    const zones = [], lines = [];
    if (cb > 0) { zones.push({ x: 0, y: kh, w: v.sheetW, h: cb }); lines.push([0, kh, v.sheetW, kh]); }
    if (cr > 0) { zones.push({ x: kw, y: 0, w: cr, h: kh }); lines.push([kw, 0, kw, v.sheetH]); }
    // カット後の用紙を箱の面の中央に貼る（上下左右の隙間は均等）。箱の面の座標 = 用紙の座標 + (sx, sy)
    const sx = (v.boxW - kw) / 2;
    const sy = (v.boxH - kh) / 2;
    return { cb, cr, kw, kh, zones, lines, sx, sy };
  }

  // =========================================================
  // 描画（art は「箱の面の座標」で描かれたマークアップ）
  // =========================================================
  function placeholder(v, title, sub) {
    const W = v.boxW, H = v.boxH, fs = Math.max(3, Math.min(W, H) / 16);
    return `<rect x="0" y="0" width="${W}" height="${H}" fill="#e5e7eb" />
      <text x="${f(W / 2)}" y="${f(H / 2 - fs * 0.3)}" text-anchor="middle" font-size="${f(fs)}" fill="#6b7280" font-family="sans-serif">${esc(title)}</text>
      <text x="${f(W / 2)}" y="${f(H / 2 + fs * 1.1)}" text-anchor="middle" font-size="${f(fs * 0.6)}" fill="#9ca3af" font-family="sans-serif">${esc(sub || "")}</text>`;
  }

  // 箱の面を <defs> に1回だけ定義し、<use> で何度でも配置する（3箱表示でデザインを重複させない）
  function buildFaceDefs(v, L, art) {
    const t = v.tape;
    const tape = t > 0 ? `<g fill="${v.tapeColor}">
        <rect x="0" y="0" width="${v.boxW}" height="${t}" />
        <rect x="0" y="${f(v.boxH - t)}" width="${v.boxW}" height="${t}" />
        <rect x="0" y="0" width="${t}" height="${v.boxH}" />
        <rect x="${f(v.boxW - t)}" y="0" width="${t}" height="${v.boxH}" />
      </g>` : "";
    return `<defs>
      <clipPath id="cbx-boxClip"><rect x="0" y="0" width="${v.boxW}" height="${v.boxH}" /></clipPath>
      <clipPath id="cbx-stickerClip"><rect x="${f(L.sx)}" y="${f(L.sy)}" width="${L.kw}" height="${L.kh}" /></clipPath>
      <g id="cbx-face">
        <g clip-path="url(#cbx-boxClip)">
          <rect x="0" y="0" width="${v.boxW}" height="${v.boxH}" fill="${v.boxColor}" />
          <g clip-path="url(#cbx-stickerClip)">
            <rect x="${f(L.sx)}" y="${f(L.sy)}" width="${L.kw}" height="${L.kh}" fill="${v.bgColor}" />
            ${art}
          </g>
          ${tape}
        </g>
        <rect x="0" y="0" width="${v.boxW}" height="${v.boxH}" fill="none" stroke="#94a3b8" stroke-width="0.3" />
      </g>
    </defs>`;
  }
  const useFace = (x) => `<use href="#cbx-face" xlink:href="#cbx-face" x="${f(x)}" y="0" />`;

  function buildGuide(v, L) {
    if (!v.printGuide || !L.lines.length) return "";
    const tick = 4;
    const hatch = L.zones.map((z) => `
      <rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="#ffffff" fill-opacity="0.55" />
      <rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="url(#cbx-hatch)" opacity="0.45" />`).join("");
    const lines = L.lines.map(([x1, y1, x2, y2]) => {
      const vertical = x1 === x2;
      const ticks = vertical
        ? `<line x1="${x1}" y1="0" x2="${x1}" y2="${tick}" /><line x1="${x1}" y1="${v.sheetH - tick}" x2="${x1}" y2="${v.sheetH}" />`
        : `<line x1="0" y1="${y1}" x2="${tick}" y2="${y1}" /><line x1="${v.sheetW - tick}" y1="${y1}" x2="${v.sheetW}" y2="${y1}" />`;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ef4444" stroke-width="0.3" stroke-dasharray="1.6,1" />
      <g stroke="#ef4444" stroke-width="0.3">${ticks}</g>`;
    }).join("");
    return `
      <defs>
        <pattern id="cbx-hatch" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="2.4" stroke="#ef4444" stroke-width="0.35" />
        </pattern>
      </defs>${hatch}${lines}`;
  }

  // プレビューの枠は固定（最大の箱に合わせる）。箱が小さいほど、枠の中で小さく表示される
  const REF_W = Math.max(...Object.values(BOXES).map((b) => b.boxW));
  const MARGIN = 6;
  const STAGE_BG = "#2c3545";

  function solidMetrics(v) {
    const k = 0.4, ang = (30 * Math.PI) / 180;
    return { dx: v.boxD * k * Math.cos(ang), dy: -v.boxD * k * Math.sin(ang) };
  }
  // 立体の箱1つ（左上 x 位置）：右側面・上面・正面
  function solidBox(v, x, dx, dy) {
    return `<g transform="translate(${f(x)} 0)">
      <polygon points="${v.boxW},0 ${f(v.boxW + dx)},${f(dy)} ${f(v.boxW + dx)},${f(v.boxH + dy)} ${v.boxW},${v.boxH}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.3" />
      <polygon points="0,0 ${f(dx)},${f(dy)} ${f(v.boxW + dx)},${f(dy)} ${v.boxW},0" fill="#f1f5f9" stroke="#94a3b8" stroke-width="0.3" />
      ${useFace(0)}
    </g>`;
  }

  function renderScene(svg, v, mode, art) {
    const L = layout(v);
    const setView = (x, y, w, h, inner) => {
      svg.setAttribute("width", `${f(w)}mm`);
      svg.setAttribute("height", `${f(h)}mm`);
      svg.setAttribute("viewBox", `${f(x)} ${f(y)} ${f(w)} ${f(h)}`);
      svg.innerHTML = inner;
    };
    const bg = (x, y, w, h) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${STAGE_BG}" />`;

    if (mode === "print") {
      const sheet = `<rect x="0" y="0" width="${v.sheetW}" height="${v.sheetH}" fill="${v.bgColor}" />`;
      setView(0, 0, v.sheetW, v.sheetH, `${sheet}<g transform="translate(${f(-L.sx)} ${f(-L.sy)})">${art}</g>${buildGuide(v, L)}`);
    } else if (mode === "flat") {
      const w = REF_W + MARGIN * 2, h = v.boxH + MARGIN * 2;
      setView(-MARGIN, -MARGIN, w, h, `${buildFaceDefs(v, L, art)}${bg(-MARGIN, -MARGIN, w, h)}${useFace((REF_W - v.boxW) / 2)}`);
    } else {
      const { dx, dy } = solidMetrics(v);
      const n = mode === "triple" ? 3 : 1;
      const gap = 0; // 箱同士はぴったりくっつける（左の箱の側面は右の箱に隠れる）
      const refTotal = n * REF_W + (n - 1) * gap + dx;
      const total = n * v.boxW + (n - 1) * gap + dx;
      const x0 = (refTotal - total) / 2;
      const w = refTotal + MARGIN * 2, h = v.boxH - dy + MARGIN * 2;
      let boxes = "";
      for (let i = 0; i < n; i++) boxes += solidBox(v, x0 + i * (v.boxW + gap), dx, dy);
      setView(-MARGIN, dy - MARGIN, w, h, `${buildFaceDefs(v, L, art)}${bg(-MARGIN, dy - MARGIN, w, h)}${boxes}`);
    }
  }

  // =========================================================
  // 設定項目の UI（params 定義から自動生成）
  // =========================================================
  const defaults = (params) => Object.fromEntries(params.map((p) => [p.key, p.def]));

  function buildParamsUi(root, params, values, onChange) {
    const inputs = {};
    let section = null;
    const newSection = (title) => {
      section = document.createElement("div");
      section.className = "section";
      if (title) section.innerHTML = `<h4>${esc(title)}</h4>`;
      root.appendChild(section);
    };
    for (const p of params) {
      if (p.g || !section) newSection(p.g);
      const wrap = document.createElement("div");
      wrap.className = "param";
      const set = (val) => { values[p.key] = val; sync(); onChange(p.key, val); };
      if (p.type === "select") {
        wrap.innerHTML = `<label><span>${esc(p.label)}</span><select>${p.options.map(([val, name]) => `<option value="${esc(val)}">${esc(name)}</option>`).join("")}</select></label>`;
        const el = wrap.querySelector("select");
        el.onchange = () => set(p.numeric ? Number(el.value) : el.value);
        inputs[p.key] = (val) => { el.value = val; };
      } else if (p.type === "choice") {
        wrap.innerHTML = `<div class="row-label">${esc(p.label || "")}</div><div class="btn-row">${p.options.map(([val, name]) => `<button data-v="${esc(val)}">${esc(name)}</button>`).join("")}</div>`;
        const btns = [...wrap.querySelectorAll("button")];
        btns.forEach((b) => { b.onclick = () => set(b.dataset.v); });
        inputs[p.key] = (val) => btns.forEach((b) => b.classList.toggle("active", b.dataset.v === String(val)));
      } else if (p.type === "color") {
        wrap.innerHTML = `<label><span>${esc(p.label)}</span><input type="color" /></label>`;
        const el = wrap.querySelector("input");
        el.oninput = () => set(el.value);
        inputs[p.key] = (val) => { el.value = val; };
      } else if (p.type === "bool") {
        wrap.innerHTML = `<label><span>${esc(p.label)}</span><input type="checkbox" /></label>`;
        const el = wrap.querySelector("input");
        el.onchange = () => set(el.checked);
        inputs[p.key] = (val) => { el.checked = !!val; };
      } else {
        wrap.innerHTML = `<label><span>${esc(p.label)}</span><span><input type="number" min="${p.min}" max="${p.max}" step="${p.step}" /> ${esc(p.unit || "")}</span></label>
          <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" />`;
        const num = wrap.querySelector('input[type="number"]'), rng = wrap.querySelector('input[type="range"]');
        const apply = (raw) => {
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          set(Math.min(p.max, Math.max(p.min, n)));
        };
        num.onchange = () => apply(num.value);
        rng.oninput = () => apply(rng.value);
        inputs[p.key] = (val) => { num.value = rng.value = val; };
      }
      section.appendChild(wrap);
    }
    function sync() { for (const p of params) inputs[p.key](values[p.key]); }
    return sync;
  }

  function sanitize(params, obj) {
    const out = {};
    if (!obj || typeof obj !== "object") return out;
    for (const p of params) {
      if (!(p.key in obj)) continue;
      const val = obj[p.key];
      if (p.type === "select" || p.type === "choice") {
        const hit = p.options.find(([o]) => String(o) === String(val));
        if (hit) out[p.key] = p.numeric ? Number(hit[0]) : hit[0];
      } else if (p.type === "color") {
        if (/^#[0-9a-fA-F]{6}$/.test(val)) out[p.key] = val.toLowerCase();
      } else if (p.type === "bool") {
        if (typeof val === "boolean") out[p.key] = val;
      } else if (Number.isFinite(Number(val))) {
        out[p.key] = Math.min(p.max, Math.max(p.min, Number(val)));
      }
    }
    return out;
  }

  const storage = {
    load(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } },
    save(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* 保存不可環境では無視 */ } }
  };

  // =========================================================
  // 画像の保存（IndexedDB）。preview と draft は同じオリジンなので、ここでデザインを受け渡す
  // =========================================================
  const idb = {
    db: null,
    async open() {
      if (this.db) return this.db;
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open("cigar-box-sim", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return this.db;
    },
    async run(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction("kv", mode);
        const req = fn(tx.objectStore("kv"));
        tx.oncomplete = () => res(req && req.result);
        tx.onerror = () => rej(tx.error);
      });
    },
    get: (k) => idb.run("readonly", (s) => s.get(k)),
    set: (k, v) => idb.run("readwrite", (s) => s.put(v, k)),
    del: (k) => idb.run("readwrite", (s) => s.delete(k))
  };
  const ART_KEY = "art";
  const PREVIEW_LS_KEY = "cigar-box-sim:v1";

  // =========================================================
  // SVG・画像の読み込み
  // =========================================================
  const readDataUrl = (blob) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob);
  });
  const loadImage = (src) => new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src;
  });

  function parseSvg(text) {
    if (!/xmlns\s*=/.test(text)) text = text.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const el = doc.documentElement;
    if (doc.querySelector("parsererror") || el.nodeName.toLowerCase() !== "svg") throw new Error("SVGとして読み込めません");
    const vb = (el.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    let w, h;
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2]; h = vb[3]; }
    else { w = parseFloat(el.getAttribute("width")) || 1000; h = parseFloat(el.getAttribute("height")) || 700; el.setAttribute("viewBox", `0 0 ${w} ${h}`); }
    el.querySelectorAll("script, foreignObject").forEach((n) => n.remove());
    el.querySelectorAll("*").forEach((n) => [...n.attributes].forEach((a) => { if (/^on/i.test(a.name)) n.removeAttribute(a.name); }));
    return { el, w, h };
  }
  const serialize = (el) => new XMLSerializer().serializeToString(el);

  // SVG は高解像度（長辺 4200px）の PNG に変換して扱う（ブラウザ差を避けるため）
  async function rasterizeSvg(text) {
    const { el, w, h } = parseSvg(text);
    const k = 4200 / Math.max(w, h);
    const W = Math.round(w * k), H = Math.round(h * k);
    el.setAttribute("width", W);
    el.setAttribute("height", H);
    const blobUrl = URL.createObjectURL(new Blob([serialize(el)], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = await loadImage(blobUrl);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      c.getContext("2d").drawImage(img, 0, 0, W, H);
      return { url: c.toDataURL("image/png"), w: W, h: H, mmPerPx: w / W };
    } finally { URL.revokeObjectURL(blobUrl); }
  }

  // 画像（PNG / JPEG）か SVG を読み込む。mmPerPx はデザインの物理サイズ（ラスターは 300dpi 相当、SVG は 1 単位 = 1mm）
  async function loadArt(blob, name) {
    const isSvg = blob.type === "image/svg+xml" || /\.svg$/i.test(name || "");
    if (isSvg) return { ...(await rasterizeSvg(await blob.text())), name, vector: true };
    const url = await readDataUrl(blob);
    const img = await loadImage(url);
    return { url, w: img.naturalWidth, h: img.naturalHeight, mmPerPx: 25.4 / FIXED.dpi, name, vector: false };
  }

  // =========================================================
  // 出力
  // =========================================================
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function embedDpi(buf, dpi) {
    const src = new Uint8Array(buf);
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
    dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const out = new Uint8Array(src.length + chunk.length);
    out.set(src.subarray(0, 33), 0); out.set(chunk, 33); out.set(src.subarray(33), 33 + chunk.length);
    return out;
  }

  // svg の現在の表示内容を PNG にする。SVG の読み取りは最初の await より前に終わるので、呼んだ直後に表示を戻してよい
  async function exportPng(svg, dpi) {
    const vb = svg.viewBox.baseVal;
    const W = Math.round((vb.width / 25.4) * dpi), H = Math.round((vb.height / 25.4) * dpi);
    const clone = svg.cloneNode(true);
    clone.setAttribute("width", W); clone.setAttribute("height", H);
    const url = URL.createObjectURL(new Blob([serialize(clone)], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = await loadImage(url);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      c.getContext("2d").drawImage(img, 0, 0, W, H);
      const png = await new Promise((res) => c.toBlob(res, "image/png"));
      return { blob: new Blob([embedDpi(await png.arrayBuffer(), dpi)], { type: "image/png" }), W, H };
    } finally { URL.revokeObjectURL(url); }
  }

  function download(blob, filename) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const baseName = (name) => (name || "design").replace(/\.[^.]+$/, "").replace(/[^\w\-ぁ-んァ-ヶ一-龠]+/g, "_");

  function toaster(el) {
    return (t) => { el.textContent = t; if (t) setTimeout(() => { if (el.textContent === t) el.textContent = ""; }, 4000); };
  }

  global.CigarBox = {
    FIXED, BOXES, BOX_PARAMS, MODES,
    f, esc, spec, layout, placeholder, renderScene,
    defaults, buildParamsUi, sanitize, storage,
    idb, ART_KEY, PREVIEW_LS_KEY,
    parseSvg, loadArt,
    exportPng, download, baseName, toaster
  };
})(window);
