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
  // 余白は画面で変更できる（左右 marginX・上下 marginY。初期値は 3mm、1mm 刻みで 0〜20mm。連動のロックもある）。
  //   シールの大きさ＝箱の面 − 余白 で、カット幅はそこから決まる。余白は、それぞれ両側の合計（片側はその半分）。
  //   上下：カット後の高さ = 120 − 上下の余白、下側のカット幅 = 127 − カット後の高さ（余白 3mm なら 10mm）。
  //   左右：きぞはこは用紙（178mm）が箱の面（180mm）より小さいので、左右は 2mm より小さくできない。
  //         0〜2mm の間は左右の余白が 2mm 固定で、2mm を超えた分だけ指定どおりになる。
  //         かずはこ（165mm）は用紙より小さいので、指定した余白のとおり。右側だけを切る。
  // サイドテープの色（tapeColor）と幅は画面で変更できる（初期値は白 / 6mm）。
  // デザイン（画像・SVG）は「箱の面と同寸」で作る前提。座標は mm（SVG は viewBox の 1 単位 = 1mm）。
  const FIXED = {
    sheetW: 178, sheetH: 127, boxH: 120, boxD: 60,
    boxColor: "#cbd5e1", bgColor: "#ffffff",
    dpi: 300
  };

  // 箱ごとの仕様（貼り付け先の幅）。切る側は右のみ（検討: 左右に分けるかは後で見直す）。
  const BOXES = {
    kizo: { label: "きぞはこ（180×120×60mm）", boxW: 180 },
    kazu: { label: "かずはこ（165×120×60mm）", boxW: 165 }
  };
  const MARGIN_DEFAULT = 3, MARGIN_MAX = 20;

  // 箱・サイドテープの設定項目（両ページ共通）
  const BOX_PARAMS = [
    { g: "箱", key: "box", label: "箱のサイズ", type: "select", options: Object.entries(BOXES).map(([k, b]) => [k, b.label]), def: "kizo" },
    { g: "サイドテープ", key: "sideTape", label: "サイドテープを貼る", type: "bool", def: true },
    { key: "tapeColor", label: "サイドテープの色", type: "color", def: "#ffffff", inlineWith: "sideTape" }, // 「貼る」と同じ行に置く
    { key: "tapeX", label: "左右の幅", unit: "mm", min: 0, max: 30, step: 1, def: 6, linkFlag: "tapeLink", linkWith: "tapeY" },
    { key: "tapeY", label: "上下の幅", unit: "mm", min: 0, max: 30, step: 1, def: 6, linkFlag: "tapeLink", linkWith: "tapeX" },
    { key: "tapeLink", label: "縦横を連動", type: "bool", def: true },
    { g: "余白", key: "marginX", label: "左右の余白（合計）", unit: "mm", min: 0, max: MARGIN_MAX, step: 1, def: MARGIN_DEFAULT,
      linkFlag: "marginLink", linkWith: "marginY" },
    { key: "marginY", label: "上下の余白（合計）", unit: "mm", min: 0, max: MARGIN_MAX, step: 1, def: MARGIN_DEFAULT,
      linkFlag: "marginLink", linkWith: "marginX" },
    { key: "marginLink", label: "縦横を連動", type: "bool", def: true }
  ];

  // デザイン微調整ページには余白の設定を出さない（余白は仕上げページで決める。微調整中は初期値の 3mm で表示する）
  const DRAFT_BOX_PARAMS = BOX_PARAMS.filter((p) => !/^margin/.test(p.key));
  // サイドテープの設定。仕上げページと微調整ページ（同じサイト内）で共通にする。AI が作るページには、依頼文で初期値として渡す
  const TAPE_KEYS = ["sideTape", "tapeColor", "tapeX", "tapeY", "tapeLink"];
  const TAPE_PARAMS = BOX_PARAMS.filter((p) => TAPE_KEYS.includes(p.key));

  // プレビューの見せ方（cigar-box-design-lab の拡大表示と同じ 3 つ）と、印刷用
  const MODES = {
    one: "一箱",
    stack: "縦に並べる",
    row: "横に並べる",
    print: "印刷用"
  };
  const PREVIEW_MODES = ["one", "stack", "row"];

  const f = (n) => (Math.round(n * 100) / 100).toString();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 固定仕様と箱サイズを展開した、描画用の値
  const clampMargin = (n, def) => Math.min(MARGIN_MAX, Math.max(0, Number.isFinite(Number(n)) ? Number(n) : def));
  const spec = (values) => {
    const boxW = BOXES[values.box].boxW;
    const mx = clampMargin(values.marginX, MARGIN_DEFAULT), my = clampMargin(values.marginY, MARGIN_DEFAULT);
    const marginX = Math.max(mx, boxW - FIXED.sheetW); // 左右（用紙が足りないときは、足りない分が最小）
    const marginY = my;
    const stickerW = boxW - marginX, stickerH = FIXED.boxH - marginY;
    return {
      ...FIXED, ...values,
      boxW, marginX, marginY,
      cutRight: Math.max(0, FIXED.sheetW - stickerW),
      cutBottom: Math.max(0, FIXED.sheetH - stickerH),
      tapeX: values.sideTape ? values.tapeX : 0, // 左右のテープの幅
      tapeY: values.sideTape ? values.tapeY : 0  // 上下のテープの幅
    };
  };

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
  function buildFaceDefs(v, L) {
    const tx = v.tapeX, ty = v.tapeY;
    const tape = tx > 0 || ty > 0 ? `<g fill="${v.tapeColor}">
        <rect x="0" y="0" width="${v.boxW}" height="${ty}" />
        <rect x="0" y="${f(v.boxH - ty)}" width="${v.boxW}" height="${ty}" />
        <rect x="0" y="0" width="${tx}" height="${v.boxH}" />
        <rect x="${f(v.boxW - tx)}" y="0" width="${tx}" height="${v.boxH}" />
      </g>` : "";
    return `<defs>
      <clipPath id="cbx-boxClip"><rect x="0" y="0" width="${v.boxW}" height="${v.boxH}" /></clipPath>
      <clipPath id="cbx-stickerClip"><rect x="${f(L.sx)}" y="${f(L.sy)}" width="${L.kw}" height="${L.kh}" /></clipPath>
      <g id="cbx-face">
        <g clip-path="url(#cbx-boxClip)">
          <rect x="0" y="0" width="${v.boxW}" height="${v.boxH}" fill="${v.boxColor}" />
          <g clip-path="url(#cbx-stickerClip)">
            <rect x="${f(L.sx)}" y="${f(L.sy)}" width="${L.kw}" height="${L.kh}" fill="${v.bgColor}" />
            ${useArt}
          </g>
          ${tape}
        </g>
        <rect x="0" y="0" width="${v.boxW}" height="${v.boxH}" fill="none" stroke="#94a3b8" stroke-width="0.3" />
      </g>
    </defs>`;
  }
  // デザイン本体は <defs> の #cbx-art に1つだけ置き、再描画のたびに作り直さない（画像の再デコードによるチラつきを避ける）
  const useArt = `<use href="#cbx-art" xlink:href="#cbx-art" />`;

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
  const MARGIN = 16;
  const STAGE_BG = "#2c3545";
  const SPACE = 22; // 「一箱」の 4 つの間の隙間（mm）

  // 箱の奥行きの見え方。右の側面と上面が見える向き（どんな向きでも、見える側面は右と上）
  function solidMetrics(v) {
    const k = 0.62, ang = (40 * Math.PI) / 180;
    return { dx: v.boxD * k * Math.cos(ang), dy: -v.boxD * k * Math.sin(ang) };
  }
  // 色に係数を掛けて暗くする（側面の陰影用）
  const shade = (hex, k) => {
    const n = parseInt(String(hex).replace("#", ""), 16);
    const c = (sh) => Math.min(255, Math.max(0, Math.round(((n >> sh) & 255) * k))).toString(16).padStart(2, "0");
    return `#${c(16)}${c(8)}${c(0)}`;
  };
  // 立体の箱 1 つ。(x, y) は正面の左上。turn は箱を面の中で時計回りに回した角度（0 / 90 / 180 / 270）。
  // 側面（右の面・上の面）は、サイドテープを貼っていればテープの色、なければ箱の色
  function solidBox(v, x, y, turn, dx, dy) {
    const flat = turn % 180 === 0;
    const w = flat ? v.boxW : v.boxH, h = flat ? v.boxH : v.boxW;
    const base = v.tapeX > 0 || v.tapeY > 0 ? v.tapeColor : v.boxColor;
    const pts = (a) => a.map(([px, py]) => `${f(px)},${f(py)}`).join(" ");
    const edge = 'stroke="#94a3b8" stroke-width="0.3" stroke-linejoin="round"';
    // 面は、中心を軸に回す（90 / 270 のときは縦長の面にちょうど収まる）
    const face = `<g transform="translate(${f(x + w / 2)} ${f(y + h / 2)}) rotate(${turn}) translate(${f(-v.boxW / 2)} ${f(-v.boxH / 2)})"><use href="#cbx-face" xlink:href="#cbx-face" /></g>`;
    return `<g>
      <polygon points="${pts([[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + h + dy], [x + w, y + h]])}" fill="${shade(base, 0.89)}" ${edge} />
      <polygon points="${pts([[x, y], [x + dx, y + dy], [x + w + dx, y + dy], [x + w, y]])}" fill="${shade(base, 0.95)}" ${edge} />
      ${face}
    </g>`;
  }

  // 箱の並べ方ごとの図。どれも左上が (0, 0)、座標は mm。{ w, h, body } を返す。箱はどれも隙間なくくっつける
  //   one   … 1 つの箱を 90 度ずつ回した 4 つ（2×2）
  //   row   … 横に 3 つ（短辺どうしがくっつく）。turns は左から順の回転
  //   stack … 縦に 3 つ（長辺どうしがくっつく）。turns は上から順の回転。下の箱から先に描き、上の箱が下の箱の上面を隠す
  function figure(v, kind, turns) {
    const { dx, dy } = solidMetrics(v);
    if (kind === "one") {
      const cw = REF_W + dx + SPACE, ch = REF_W - dy + SPACE; // 横長・縦長のどちらの箱も収まる大きさ（箱どうしに SPACE の隙間）
      let body = "";
      [0, 90, 180, 270].forEach((turn, i) => {
        const flat = turn % 180 === 0;
        const w = flat ? v.boxW : v.boxH, h = flat ? v.boxH : v.boxW;
        const ox = (i % 2) * cw, oy = Math.floor(i / 2) * ch;
        body += solidBox(v, ox + (cw - w - dx) / 2, oy + (ch - h + dy) / 2 - dy, turn, dx, dy);
      });
      return { w: cw * 2 - SPACE, h: ch * 2 - SPACE, body };
    }
    const n = turns.length;
    if (kind === "row") {
      const x0 = (n * REF_W - n * v.boxW) / 2;
      let body = "";
      turns.forEach((turn, i) => { body += solidBox(v, x0 + i * v.boxW, -dy, turn, dx, dy); });
      return { w: n * REF_W + dx, h: v.boxH - dy, body };
    }
    const x0 = (REF_W - v.boxW) / 2;
    let body = "";
    for (let i = n - 1; i >= 0; i--) body += solidBox(v, x0, -dy + i * v.boxH, turns[i], dx, dy);
    return { w: REF_W + dx, h: n * v.boxH - dy, body };
  }

  // SVG の骨組み：デザイン置き場（永続）と、箱・枠など毎回作り直す部分
  function ensureScene(svg) {
    let artEl = svg.querySelector("#cbx-art"), scene = svg.querySelector("#cbx-scene");
    if (!artEl || !scene) {
      svg.innerHTML = '<defs><g id="cbx-art"></g></defs><g id="cbx-scene"></g>';
      artEl = svg.querySelector("#cbx-art"); scene = svg.querySelector("#cbx-scene");
    }
    return { artEl, scene };
  }

  // art は「箱の面の座標」で描かれたマークアップ。前回と同じ文字列なら、デザインのノードには触れない
  function renderScene(svg, v, mode, art) {
    const L = layout(v);
    const { artEl, scene } = ensureScene(svg);
    if (artEl._art !== art) { artEl.innerHTML = art; artEl._art = art; }
    const setAttr = (name, val) => { if (svg.getAttribute(name) !== val) svg.setAttribute(name, val); };
    const setView = (x, y, w, h, inner) => {
      setAttr("width", `${f(w)}mm`);
      setAttr("height", `${f(h)}mm`);
      setAttr("viewBox", `${f(x)} ${f(y)} ${f(w)} ${f(h)}`);
      svg.dataset.mode = mode; // 画面の高さを、見せ方ごとに変えるための目印（style.css）
      scene.innerHTML = inner;
    };
    const bg = (x, y, w, h) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${STAGE_BG}" />`;

    if (mode === "print") {
      const sheet = `<rect x="0" y="0" width="${v.sheetW}" height="${v.sheetH}" fill="${v.bgColor}" />`;
      // デザインは用紙の範囲で切る（用紙の外にはみ出した部分は、書き出しにも画面にも出さない）
      const body = `<defs><clipPath id="cbx-sheetClip"><rect x="0" y="0" width="${v.sheetW}" height="${v.sheetH}" /></clipPath></defs>
        ${sheet}<g clip-path="url(#cbx-sheetClip)"><g transform="translate(${f(-L.sx)} ${f(-L.sy)})">${useArt}</g></g>${buildGuide(v, L)}`;
      setView(0, 0, v.sheetW, v.sheetH, body);
      return;
    }

    // 縦に並べる・横に並べるは、「全部同じ向き」と「真ん中の一つを 180 度逆に」の 2 つを並べて見せる
    const GAP = 24, CAP = 13;
    let figs;
    if (mode === "one") figs = [{ ...figure(v, "one") }];
    else {
      const kind = mode === "stack" ? "stack" : "row";
      figs = [
        { ...figure(v, kind, [0, 0, 0]), caption: "全部同じ向き" },
        { ...figure(v, kind, [0, 180, 0]), caption: "真ん中の一つを 180 度逆に" }
      ];
    }
    const side = mode === "stack"; // 縦に積んだ箱は縦長なので、2 つを左右に並べる。それ以外は、2 つを上下に並べる
    let x = 0, y = 0, W = 0, H = 0, inner = "";
    figs.forEach((fig, i) => {
      const capH = fig.caption ? CAP : 0;
      inner += `<g transform="translate(${f(x)} ${f(y)})">${fig.body}</g>`;
      if (fig.caption) inner += `<text x="${f(x + fig.w / 2)}" y="${f(y + fig.h + 9.5)}" text-anchor="middle" font-size="8.5" fill="#cbd5e1" font-family="sans-serif">${esc(fig.caption)}</text>`;
      W = Math.max(W, x + fig.w); H = Math.max(H, y + fig.h + capH);
      if (side) x += fig.w + GAP; else y += fig.h + capH + GAP;
    });
    // プレビューの枠は、どの見せ方でも「一箱」と同じ大きさにする。ほかの見せ方は、枠に収まるように縮めて中央に置く
    const base = figure(v, "one");
    const s = Math.min(1, base.w / W, base.h / H);
    const tx = (base.w - W * s) / 2, ty = (base.h - H * s) / 2;
    const fw = base.w + MARGIN * 2, fh = base.h + MARGIN * 2;
    setView(-MARGIN, -MARGIN, fw, fh, `${buildFaceDefs(v, L)}${bg(-MARGIN, -MARGIN, fw, fh)}<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(s)})">${inner}</g>`);
  }

  // スライダー操作のように連続して呼ばれる処理を、1 フレームに 1 回にまとめる
  const frame = (fn) => {
    let queued = false;
    return () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fn(); }); };
  };
  const debounce = (fn, ms) => {
    let t;
    return () => { clearTimeout(t); t = setTimeout(fn, ms); };
  };

  // =========================================================
  // 設定項目の UI（params 定義から自動生成）
  // =========================================================
  const defaults = (params) => Object.fromEntries(params.map((p) => [p.key, p.def]));

  // 値が同じなら書き込まない（操作中のスライダーに値を書き戻すと、スマホで引っかかるため）
  const setIf = (el, prop, val) => { if (el[prop] !== val) el[prop] = val; };

  function buildParamsUi(root, params, values, onChange) {
    const inputs = {};  // key -> (値) => 表示を合わせる
    const hosts = {};   // key -> 同じ行に他の部品を置く場所（inlineWith 用）
    let section = null;
    const newSection = (title) => {
      section = document.createElement("div");
      section.className = "section";
      if (title) section.innerHTML = `<h4>${esc(title)}</h4>`;
      root.appendChild(section);
    };
    // 連動（ロック）：2 つの項目の差を保ったまま、一緒に動かす
    const diffs = {};
    const pairOf = (p) => [p.key, p.linkWith].sort();
    const clampTo = (q, n) => Math.min(q.max, Math.max(q.min, n));
    const byKey = Object.fromEntries(params.map((q) => [q.key, q]));
    const resetDiff = (p) => { const [a, b] = pairOf(p); diffs[`${a}|${b}`] = values[b] - values[a]; };
    for (const p of params) {
      const set = (val) => {
        if (p.linkFlag && values[p.linkFlag] && byKey[p.linkWith]) {
          const [a, b] = pairOf(p), key = `${a}|${b}`;
          if (diffs[key] === undefined) diffs[key] = values[b] - values[a]; // 最初の操作の直前の差
          const other = p.linkWith, d = diffs[key];
          const next = clampTo(byKey[other], p.key === a ? val + d : val - d);
          values[p.key] = val; inputs[p.key](val);
          if (values[other] !== next) { values[other] = next; inputs[other](next); onChange(other, next); }
        } else { values[p.key] = val; inputs[p.key](val); }
        // ロックを入れた時点の差を、保つ差にする
        params.filter((q) => q.linkFlag === p.key).forEach(resetDiff);
        onChange(p.key, val);
      };

      // 別の項目と同じ行に置く色の選択（例：サイドテープを貼る + 色）
      if (p.inlineWith) {
        const el = document.createElement("input");
        el.type = "color"; el.title = p.label; el.setAttribute("aria-label", p.label);
        el.oninput = () => set(el.value);
        inputs[p.key] = (val) => setIf(el, "value", val);
        hosts[p.inlineWith].appendChild(el);
        continue;
      }

      if (p.g || !section) newSection(p.g);
      const wrap = document.createElement("div");
      wrap.className = "param";
      if (p.type === "select") {
        wrap.innerHTML = `<label><span>${esc(p.label)}</span><select>${p.options.map(([val, name]) => `<option value="${esc(val)}">${esc(name)}</option>`).join("")}</select></label>`;
        const el = wrap.querySelector("select");
        el.onchange = () => set(p.numeric ? Number(el.value) : el.value);
        inputs[p.key] = (val) => setIf(el, "value", String(val));
      } else if (p.type === "choice") {
        wrap.innerHTML = `<div class="row-label">${esc(p.label || "")}</div><div class="btn-row">${p.options.map(([val, name]) => `<button data-v="${esc(val)}">${esc(name)}</button>`).join("")}</div>`;
        const btns = [...wrap.querySelectorAll("button")];
        btns.forEach((b) => { b.onclick = () => set(b.dataset.v); });
        inputs[p.key] = (val) => btns.forEach((b) => b.classList.toggle("active", b.dataset.v === String(val)));
      } else if (p.type === "color") {
        wrap.innerHTML = `<label><span>${esc(p.label)}</span><input type="color" /></label>`;
        const el = wrap.querySelector("input");
        el.oninput = () => set(el.value);
        inputs[p.key] = (val) => setIf(el, "value", val);
      } else if (p.type === "bool") {
        wrap.innerHTML = `<label><span>${esc(p.label)}</span><span class="ctl"><input type="checkbox" /></span></label>`;
        const el = wrap.querySelector("input");
        hosts[p.key] = wrap.querySelector(".ctl");
        el.onchange = () => set(el.checked);
        inputs[p.key] = (val) => setIf(el, "checked", !!val);
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
        inputs[p.key] = (val) => { setIf(num, "value", String(val)); setIf(rng, "value", String(val)); };
      }
      if (p.note) { const n = document.createElement("p"); n.className = "note"; n.textContent = p.note; wrap.appendChild(n); }
      section.appendChild(wrap);
    }
    return () => { for (const p of params) inputs[p.key](values[p.key]); };
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
  const TAPE_LS_KEY = "cigar-box-sim:tape";
  // サイドテープの共通設定（保存されていなければ空のオブジェクト）
  const tapeStore = {
    load: () => sanitize(TAPE_PARAMS, storage.load(TAPE_LS_KEY)),
    save: (values) => storage.save(TAPE_LS_KEY, Object.fromEntries(TAPE_KEYS.filter((k) => k in values).map((k) => [k, values[k]])))
  };

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

  // 読み込んだデザインの置き場。表示用の blob URL → 書き出し用の元データ（Blob）
  // 画面には blob URL を使う（base64 の data URL は 1.33 倍に膨らみ、巨大な文字列が DOM に入るため）。
  // data URL が必要になるのは PNG を書き出す瞬間だけ
  const artBlobs = new Map();
  const releaseArt = (art) => { if (art && art.url) { artBlobs.delete(art.url); URL.revokeObjectURL(art.url); } };
  const canvasBlob = (c, type) => new Promise((res) => c.toBlob(res, type));

  // 画面に出す画像の長辺の上限（px）。これを超える画像は、画面用だけ縮小した複製を使う。
  // 書き出しは元の画像を使うので、仕上がりは変わらない
  const DISPLAY_MAX = 2400;
  // 300dpi で書き出す前提で、SVG はこれ以上細かく展開しない（1mm あたりのピクセル数）。上限は長辺 4200px
  const SVG_PX_PER_MM = FIXED.dpi / 25.4;
  const SVG_MAX_EDGE = 4200;

  // SVG は PNG に変換して扱う（ブラウザ差を避けるため）。書き出し（300dpi）と同じ細かさで足りる
  async function rasterizeSvg(text) {
    const { el, w, h } = parseSvg(text);
    const k = Math.min(SVG_PX_PER_MM, SVG_MAX_EDGE / Math.max(w, h));
    const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
    el.setAttribute("width", W);
    el.setAttribute("height", H);
    const svgUrl = URL.createObjectURL(new Blob([serialize(el)], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = await loadImage(svgUrl);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      c.getContext("2d").drawImage(img, 0, 0, W, H);
      return { blob: await canvasBlob(c, "image/png"), w: W, h: H, mmPerPx: w / W };
    } finally { URL.revokeObjectURL(svgUrl); }
  }

  // SVG（箱の面と同寸・1 単位 = 1mm）を、300dpi の PNG にする。写真アプリへの保存や、印刷用の受け渡し用
  async function svgToPng(text) {
    const { blob } = await rasterizeSvg(text);
    return new Blob([embedDpi(await blob.arrayBuffer(), FIXED.dpi)], { type: "image/png" });
  }

  // 画像（PNG / JPEG）か SVG を読み込む。mmPerPx はデザインの物理サイズ（ラスターは 300dpi 相当、SVG は 1 単位 = 1mm）
  // 戻り値の url は画面表示用（blob URL）。使い終わったら releaseArt で解放する
  async function loadArt(blob, name) {
    const isSvg = blob.type === "image/svg+xml" || /\.svg$/i.test(name || "");
    let full, w, h, mmPerPx;
    if (isSvg) {
      ({ blob: full, w, h, mmPerPx } = await rasterizeSvg(await blob.text()));
    } else {
      full = blob; mmPerPx = 25.4 / FIXED.dpi;
    }
    const fullUrl = URL.createObjectURL(full);
    try {
      const img = await loadImage(fullUrl);
      w = img.naturalWidth; h = img.naturalHeight;
      let display = full, url = fullUrl;
      if (Math.max(w, h) > DISPLAY_MAX) {
        const k = DISPLAY_MAX / Math.max(w, h);
        const c = document.createElement("canvas");
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const small = await canvasBlob(c, "image/png");
        if (small && small.size < full.size) { display = small; url = URL.createObjectURL(small); URL.revokeObjectURL(fullUrl); }
      }
      artBlobs.set(url, full);
      // w / h は元の画像の大きさ（表示用に縮小していても、置く大きさは変わらない）
      return { url, w, h, mmPerPx, name, vector: isSvg, bytes: full.size, displayBytes: display.size };
    } catch (e) { URL.revokeObjectURL(fullUrl); throw e; }
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
    // 画面用の blob URL は、SVG を画像として開くと読めない。書き出し用の元データを data URL にして差し替える
    await Promise.all([...clone.querySelectorAll("image")].map(async (im) => {
      const href = im.getAttribute("href") || im.getAttribute("xlink:href") || "";
      const src = artBlobs.get(href) || (href.startsWith("blob:") ? await (await fetch(href)).blob() : null);
      if (!src) return;
      const data = await readDataUrl(src);
      im.setAttribute("href", data); im.setAttribute("xlink:href", data);
    }));
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
  // スマホ（タッチ操作の端末）か。ここでは「共有メニューを使うか」の判定にだけ使う
  const isTouch = () => !!(global.matchMedia && global.matchMedia("(pointer: coarse)").matches);

  // ファイルを保存する。スマホでは共有メニューを開く。
  //   iOS の「ダウンロード」は「ファイル」アプリにしか保存できない。共有メニューなら、PNG / JPEG を「画像を保存」で写真に追加できる
  //   （SVG は写真アプリに保存できない。写真に入れたいときは PNG にする）
  // 戻り値："shared"（共有した） / "cancelled"（共有メニューを閉じた） / "downloaded"（ダウンロードした）
  async function saveFile(blob, filename) {
    if (isTouch() && navigator.canShare && navigator.share) {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return "shared"; }
        catch (e) {
          if (e && e.name === "AbortError") return "cancelled";
          // 時間がかかって「ボタンを押した直後」と見なされなくなった場合などは、ダウンロードに切り替える
        }
      }
    }
    download(blob, filename);
    return "downloaded";
  }
  const baseName = (name) => (name || "design").replace(/\.[^.]+$/, "").replace(/[^\w\-ぁ-んァ-ヶ一-龠]+/g, "_");

  // 見せ方の切り替え（横に並んだボタン）。set(mode) で選択を合わせる
  function buildModeTabs(root, modes, onSelect) {
    root.classList.add("mode-tabs");
    root.setAttribute("role", "tablist");
    root.setAttribute("aria-label", "見せ方");
    const btns = Object.entries(modes).map(([key, label]) => {
      const b = document.createElement("button");
      b.type = "button"; b.role = "tab"; b.dataset.mode = key; b.textContent = label;
      b.onclick = () => onSelect(key);
      root.appendChild(b);
      return b;
    });
    return (mode) => btns.forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on));
    });
  }

  function toaster(el) {
    return (t) => { el.textContent = t; if (t) setTimeout(() => { if (el.textContent === t) el.textContent = ""; }, 4000); };
  }

  global.CigarBox = {
    FIXED, BOXES, BOX_PARAMS, DRAFT_BOX_PARAMS, TAPE_KEYS, TAPE_PARAMS, MODES, PREVIEW_MODES,
    f, esc, spec, layout, placeholder, renderScene, frame, debounce, releaseArt, saveFile, svgToPng, isTouch,
    defaults, buildParamsUi, sanitize, storage,
    idb, ART_KEY, PREVIEW_LS_KEY, TAPE_LS_KEY, tapeStore,
    parseSvg, loadArt,
    exportPng, download, baseName, toaster, buildModeTabs
  };
})(window);
