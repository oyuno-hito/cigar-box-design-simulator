/*
 * デザイン微調整ページの「固定部分」一式（箱の切り替え・サイドテープ・表示モード・プレビュー・出力ボタン）。
 * 人が管理する決定論的なコード。AI はこのファイルを編集せず、読み込んで mountDraft を呼ぶだけにする。
 *
 *   <script src=".../shared/box.js"></script>
 *   <script src=".../shared/draft-app.js"></script>
 *   <script>
 *     const PARAMS = [...];
 *     function draw(box, p) { return `<rect .../>`; }
 *     CigarBox.mountDraft({ title: "…", note: "…", PARAMS, draw });
 *   </script>
 *
 * 画面（スマホではプレビューを上に固定）、サイドテープ（4辺）、色、出力ボタンはここが作る。
 * スタイル（shared/style.css）も、このファイルと同じ場所から自動で読み込む。
 */
(function (global) {
  "use strict";
  const CB = global.CigarBox;
  if (!CB) throw new Error("shared/box.js を先に読み込んでください");
  const SELF = document.currentScript && document.currentScript.src;
  const SHARED = SELF ? new URL("./", SELF) : null;

  const ICON_EXTERNAL = `<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-label="別のウィンドウで開きます" role="img"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M6.5 3.5H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" /></svg>`;
  const DRAFT_MODES = CB.PREVIEW_MODES; // 印刷用は仕上げページだけ

  function ensureStyle() {
    if (!SHARED || document.querySelector("link[data-cbx-style]")) return;
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => /shared\/style\.css/.test(l.href))) return;
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = new URL("style.css", SHARED).href; link.dataset.cbxStyle = "1";
    document.head.appendChild(link);
  }

  /**
   * opts
   *   PARAMS, draw  … 必須。契約は draft/index.html の AI-SLOT を参照
   *   title, note   … 見出しと説明文（文字列）
   *   crumb         … 見出しの上に出すパンくず（HTML 文字列。省略可）
   *   extra         … 説明文の下に差し込む要素（省略可）
   *   previewUrl    … 仕上げページの URL（省略時は、このファイルの隣の ../preview/）
   *   tape          … サイドテープの初期値 { sideTape, tapeColor, tapeX, tapeY, tapeLink }（省略可。依頼文に入っている値をそのまま書く）
   *                   このブラウザにサイドテープの共通設定が保存されていれば、そちらが優先される
   *   storageKey    … 入力値の保存キー
   * 戻り値 { state, render, toast, buildSvg }
   */
  function mountDraft(opts) {
    const { PARAMS, draw } = opts || {};
    if (!Array.isArray(PARAMS) || typeof draw !== "function") throw new Error("mountDraft には PARAMS（配列）と draw（関数）が必要です");
    ensureStyle();
    const { DRAFT_BOX_PARAMS, TAPE_PARAMS, tapeStore, MODES, spec, placeholder, renderScene, frame, debounce, defaults, buildParamsUi, sanitize, storage, idb, saveFile, svgToPng, toaster, buildModeTabs, esc, f, ART_KEY, PREVIEW_LS_KEY } = CB;

    // ---- 画面（固定部分） ----
    if (!document.querySelector('meta[name="viewport"]')) document.head.insertAdjacentHTML("beforeend", '<meta name="viewport" content="width=device-width, initial-scale=1" />');
    document.body.insertAdjacentHTML("beforeend", `
      <div class="controls">
        ${opts.crumb ? `<div class="crumb">${opts.crumb}</div>` : ""}
        <h3>${esc(opts.title || "デザイン微調整")}</h3>
        ${opts.note ? `<p class="note">${esc(opts.note)}</p>` : ""}
        <div id="cbx-extra"></div>
        <div id="cbx-fixed"></div>
        <div id="cbx-design"></div>
        <div class="section">
          <h4>出力</h4>
          <div class="btn-row">
            <button id="cbx-save">SVGを保存</button>
            <button id="cbx-png">PNGで保存</button>
            <button id="cbx-copy">SVGをコピー</button>
            <button id="cbx-open" class="primary">仕上げページを開く${ICON_EXTERNAL}</button>
          </div>
          <p class="note">「SVGを保存」「SVGをコピー」は、AIに渡して手直しを頼むときにも使えます。「仕上げページを開く」は、別のウィンドウで開きます。</p>
          <p class="note touch-only">スマホでは共有メニューが開きます。写真に入れたいときは「PNGで保存」を選び、メニューの「画像を保存」を押してください（SVG は写真に保存できません）。</p>
        </div>
      </div>
      <div class="stage">
        <svg id="scene" viewBox="0 0 192 132" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>
        <div id="cbx-mode"></div>
        <p id="cbx-msg" class="note"></p>
      </div>`);
    const $ = (id) => document.getElementById(id);
    if (opts.extra) $("cbx-extra").appendChild(opts.extra); else $("cbx-extra").remove();
    const toast = toaster($("cbx-msg"));

    // ---- 状態 ----
    const LS_KEY = opts.storageKey || `cigar-box-draft:v5:${location.pathname}`;
    const state = { fixed: defaults(DRAFT_BOX_PARAMS), mode: "one", values: defaults(PARAMS) };
    // サイドテープの設定は、仕上げページと共通の保存先に書く（箱のサイズだけ、このページに保存する）
    const persist = () => {
      storage.save(LS_KEY, { version: 5, mode: state.mode, fixed: { box: state.fixed.box }, values: state.values });
      tapeStore.save(state.fixed);
    };
    const persistSoon = debounce(persist, 300);
    window.addEventListener("pagehide", persist);
    const boxOf = () => { const v = spec(state.fixed); return { v, box: { w: v.boxW, h: v.boxH, key: v.box } }; };

    // draw の結果を、箱の面と同寸（1 単位 = 1mm）の SVG にする
    function buildDesign() {
      const { box } = boxOf();
      const inner = draw(box, { ...state.values });
      if (typeof inner !== "string") throw new Error("draw は SVG の中身（文字列）を返してください");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${f(box.w)} ${f(box.h)}" width="${f(box.w)}mm" height="${f(box.h)}mm">${inner}</svg>`;
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      if (doc.querySelector("parsererror")) throw new Error("draw の結果が SVG として不正です");
      return { inner, svg };
    }
    const buildSvg = () => buildDesign().svg;

    function render() {
      const { v } = boxOf();
      let art, ok = false, msg = "";
      try {
        art = buildDesign().inner; // 画像として包まず、そのまま埋め込む（再デコードが起きず、チラつかない）
        ok = true;
      } catch (e) {
        art = placeholder(v, "デザインを描けませんでした", "メッセージを確認してください");
        msg = e.message;
      }
      renderScene($("scene"), v, state.mode, art);
      $("cbx-msg").textContent = msg;
      $("cbx-open").disabled = $("cbx-save").disabled = $("cbx-png").disabled = $("cbx-copy").disabled = !ok;
    }

    // ---- UI ----
    const renderSoon = frame(render); // スライダーを動かしている間は、1 フレームに 1 回だけ描き直す
    const onChange = () => { persistSoon(); renderSoon(); };
    const syncFixed = buildParamsUi($("cbx-fixed"), DRAFT_BOX_PARAMS, state.fixed, onChange);
    const syncDesign = buildParamsUi($("cbx-design"), PARAMS, state.values, onChange);
    const syncMode = buildModeTabs($("cbx-mode"), Object.fromEntries(DRAFT_MODES.map((k) => [k, MODES[k]])), (mode) => { state.mode = mode; syncMode(mode); persist(); render(); });

    // ---- 出力 ----
    const currentBlob = () => new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${buildSvg()}`], { type: "image/svg+xml" });
    const saved_ = (how) => { if (how !== "cancelled") toast(how === "shared" ? "共有しました" : "保存しました"); };
    $("cbx-save").onclick = async () => {
      try { saved_(await saveFile(currentBlob(), `design_${state.fixed.box}.svg`)); }
      catch (e) { toast("SVGを保存できませんでした：" + e.message); }
    };
    // 300dpi の PNG（箱の面と同寸）。写真アプリに保存でき、仕上げページでは「画像を選択」で読み込める
    $("cbx-png").onclick = async () => {
      try { saved_(await saveFile(await svgToPng(buildSvg()), `design_${state.fixed.box}.png`)); }
      catch (e) { toast("PNGを保存できませんでした：" + e.message); }
    };
    async function copyText(text) {
      try { await navigator.clipboard.writeText(text); return true; }
      catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch (err) { /* noop */ }
        ta.remove();
        return ok;
      }
    }
    $("cbx-copy").onclick = async () => {
      try { toast((await copyText(buildSvg())) ? "SVGをコピーしました。仕上げページに貼り付けて読み込めます" : "コピーできませんでした"); }
      catch (e) { toast("SVGをコピーできませんでした：" + e.message); }
    };

    // 仕上げページが同じサイト（同じオリジン）なら、デザインと箱の設定を直接渡す。
    // 別のサイトなら、SVG をコピーしてから開く（仕上げページに貼り付けて読み込む）
    const previewUrl = new URL(opts.previewUrl || (SHARED ? new URL("../preview/", SHARED).href : "../preview/"), location.href);
    $("cbx-open").onclick = async () => {
      const win = window.open("", "_blank"); // クリック直後に開く（ポップアップのブロックを避ける）
      const go = () => { if (win) win.location.href = previewUrl.href; else location.href = previewUrl.href; };
      try {
        if (previewUrl.origin === location.origin) {
          const box = state.fixed.box;
          await idb.set(ART_KEY, { blob: currentBlob(), name: `design_${box}.svg` });
          const saved = storage.load(PREVIEW_LS_KEY) || { version: 1 };
          storage.save(PREVIEW_LS_KEY, { ...saved, box });
          tapeStore.save(state.fixed); // サイドテープは共通の保存先から、仕上げページが読む。余白は仕上げページの設定のまま
        } else {
          toast((await copyText(buildSvg())) ? "SVGをコピーしました。仕上げページに貼り付けてください" : "SVGをコピーできませんでした。「SVGを保存」して読み込んでください");
        }
        go();
      } catch (e) {
        if (win) win.close();
        toast("仕上げページを開けませんでした：" + e.message);
      }
    };

    // ---- 起動 ----
    const saved = storage.load(LS_KEY);
    // サイドテープの初期値：このブラウザに保存した共通設定 > 依頼文で渡された値（opts.tape）> 既定値
    Object.assign(state.fixed, sanitize(TAPE_PARAMS, opts.tape), tapeStore.load());
    if (saved) {
      Object.assign(state.fixed, sanitize(DRAFT_BOX_PARAMS, saved.fixed));
      Object.assign(state.values, sanitize(PARAMS, saved.values));
      if (DRAFT_MODES.includes(saved.mode)) state.mode = saved.mode;
    }
    syncFixed(); syncDesign();
    syncMode(state.mode);
    render();
    return { state, render, toast, buildSvg };
  }

  CB.mountDraft = mountDraft;
})(window);
