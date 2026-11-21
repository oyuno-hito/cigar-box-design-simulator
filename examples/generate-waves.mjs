#!/usr/bin/env node
/*
 * 複雑なデザインの作り方の見本（スクリプトで SVG を生成する）。
 *
 * ループ・三角関数・乱数などが必要なデザインは、こうしてコードで生成する。
 * 調整ページ（draft/ のテンプレート）では、同じ考え方で PARAMS と draw(box, p) に書く
 * （例：wavePath の中身を draw の中に置き、波の本数や振幅を PARAMS の項目にする）。
 * このスクリプトは、同じ波を単体の SVG ファイル（箱の面と同じ大きさ、1 単位 = 1mm）として書き出す例。
 *
 * 使い方:
 *   node examples/generate-waves.mjs                          # きぞはこ・かずはこの両方を out/ に出力
 *   node examples/generate-waves.mjs --box kazu --waves 9 --amp 12 --out out
 *
 * 守ること（自作するときも同じ）:
 *   - viewBox は "0 0 幅 高さ"（きぞはこ 180×120、かずはこ 165×120）
 *   - script / foreignObject / 外部 URL / 画像の埋め込みは使わない
 *   - シールは箱の面より上下左右に約 1.5mm 内側までしか載らない。重要な要素は端から 5mm 以上離す
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BOXES = { kizo: { w: 180, h: 120 }, kazu: { w: 165, h: 120 } };

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const boxes = args.box ? [args.box] : Object.keys(BOXES);
const waves = Number(args.waves ?? 7);   // 波の本数
const amp = Number(args.amp ?? 8);       // 振れ幅（mm）
const out = args.out ?? "out";

const f = (n) => Math.round(n * 100) / 100;

function wavePath(w, h, y0, a, phase) {
  const pts = [];
  for (let x = 0; x <= w; x += 2) pts.push(`${f(x)} ${f(y0 + a * Math.sin((x / w) * Math.PI * 2 * 1.5 + phase))}`);
  return `M ${pts.join(" L ")} L ${w} ${h} L 0 ${h} Z`;
}

function design({ w, h }) {
  const layers = [];
  for (let i = 0; i < waves; i++) {
    const t = i / (waves - 1 || 1);
    const hue = 200 + t * 120; // 青 → 紫 → ピンク
    layers.push(`<path d="${wavePath(w, h, h * (0.25 + 0.6 * t), amp * (0.5 + t), i * 0.6)}" fill="hsl(${f(hue)} 85% ${f(70 - t * 25)}%)" />`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">
  <rect width="${w}" height="${h}" fill="#f5f9ff" />
  ${layers.join("\n  ")}
</svg>
`;
}

mkdirSync(out, { recursive: true });
for (const key of boxes) {
  if (!BOXES[key]) throw new Error(`--box は ${Object.keys(BOXES).join(" / ")} のいずれかにしてください`);
  const file = join(out, `waves_${key}.svg`);
  writeFileSync(file, design(BOXES[key]));
  console.log(`出力しました: ${file}`);
}
