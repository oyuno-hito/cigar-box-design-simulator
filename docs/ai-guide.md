# AI 向けガイド：箱に貼るシールの調整ページの作り方

シガーボックスに貼るシールのデザインを、SVG で再現して調整するためのページを作ります。
`draft/`（デザイン微調整（テンプレート））は、そのテンプレートです。`draft/` の「AIへの依頼文をコピー」で作られる依頼文は、このガイドと同じ内容です。

## 流れ

1. 利用者が、デザインの参考画像と「調整したい項目」を AI に渡す
2. AI が、画像のデザインを SVG で再現する調整ページ（HTML）を作る
3. 利用者がページで調整し、「SVGを保存」する
4. 保存した SVG を、仕上げページ（`preview/`）で読み込み、印刷用 PNG にする

画像は雰囲気・色・構図の参考です。トレースや画像の埋め込みはせず、SVG の図形で作ります。

## 箱とデザインの大きさ

デザインは「箱の面と同じ大きさ」で作ります。単位は mm（SVG の 1 単位 = 1mm）です。

| 箱 | 面の大きさ |
|---|---|
| きぞはこ | 180×120mm |
| かずはこ | 165×120mm |

シールは箱の面より、上下左右に約 1.5mm 内側までしか載りません（余白の初期値。仕上げページで 0〜20mm に変えられます）。重要な要素は端から 5mm 以上離します。

## ページの作り方（推奨）

画面の固定部分は、共通スクリプト `shared/draft-app.js` が作ります。
表示モード、箱の切り替え、サイドテープ（4 辺・色と、左右・上下それぞれの幅つき）、プレビュー（スマホでは画面上部に固定）、「SVGを保存」「PNGで保存」「SVGをコピー」「仕上げページを開く」です。
自分で作り直さず、`PARAMS` と `draw` を書いて `CigarBox.mountDraft` を呼びます。
`tape` は、サイドテープの初期値（利用者がいつも使う設定）です。依頼文に入っている値をそのまま渡し、変えたり消したりしません。サイドテープの項目は `PARAMS` に入れません。

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>デザイン微調整</title>
  <link rel="stylesheet" href="https://（このサイト）/shared/style.css" />
</head>
<body>
  <script src="https://（このサイト）/shared/box.js"></script>
  <script src="https://（このサイト）/shared/draft-app.js"></script>
  <script>
    const PARAMS = [ /* 調整項目 */ ];
    function draw(box, p) { return `<rect .../>`; }
    CigarBox.mountDraft({ title: "デザイン微調整", note: "ページの使い方を 2〜3 行で", tape: { sideTape: true, tapeColor: "#ffffff", tapeX: 6, tapeY: 6, tapeLink: true }, PARAMS, draw });
  </script>
</body>
</html>
```

`draft/index.html` が、動く見本です。外部スクリプトを読み込めない環境では、`box.js`・`draft-app.js`・`style.css` の中身をページに貼ります。

### PARAMS（調整項目）

画面に出す項目の配列です。

| type | 必要なキー | `p.key` で入る値 |
|---|---|---|
| `number` | `min` `max` `step` `def`（`unit` は表示用） | 数値 |
| `color` | `def`（`#rrggbb`） | `#rrggbb` |
| `bool` | `def`（`true` / `false`） | `true` / `false` |
| `select` / `choice` | `options`（`[["値","表示名"], ...]`）、`def` | 選んだ「値」の文字列 |

- 共通のキー：`key`（英数字と `_`）、`label`（表示名）、`g`（付けるとその項目から見出しが始まる）
- `select` はプルダウン、`choice` は切り替えボタンになります

### draw(box, p)

デザインの SVG の中身（`<svg>` の中に入る要素）を、文字列で返す関数です。

- `box = { w: 180 | 165, h: 120, key: "kizo" | "kazu" }`（箱の面の大きさ）
- `p` は `PARAMS` の現在値（`p.r`、`p.color` など）
- 座標は箱の面です（左上が 0,0、右下が `box.w`, `box.h`）
- `<svg>` 要素そのものは返しません。ページが `viewBox` と `width` / `height`（mm）を付けて作ります

ループ・三角関数・乱数など、JavaScript で自由に生成してかまいません。
参考：[`examples/generate-waves.mjs`](../examples/generate-waves.mjs)（波のデザインを生成するスクリプト）

## 共通スクリプトを使えない場合

共通スクリプトを取得できないときだけ、次を満たす HTML（ブラウザで開くだけで動く 1 ファイル）を自作します。

1. 調整項目を動かすスライダーや色選択など
2. 箱の面と同じ大きさのプレビュー（きぞはこ 180×120mm / かずはこ 165×120mm の切り替え）。スマホでは画面上部に固定する
3. 「サイドテープを貼る」（色と、左右・上下それぞれの幅を変えられる。箱の面の 4 辺に貼る。初期値は、依頼文の `tape` の値）
4. 「SVGを保存」：調整値を反映した SVG をファイルに保存する。「PNGで保存」：同じデザインを 300dpi の PNG にして保存する（スマホで写真に入れる用）。スマホでは共有メニューを開く
5. 「仕上げページを開く」：`preview/` を別のウィンドウで開く（`<a target="_blank" rel="noopener">`、別のウィンドウで開くとわかるアイコン付き）
6. 「SVGをコピー」：SVG のコードをクリップボードへ（仕上げページに貼り付けて読み込める）

仕上げページは別のサイトなので、データは直接渡せません。
保存した SVG を、仕上げページへのドラッグ&ドロップ、ファイルの選択、コードの貼り付けで読み込みます。

## 保存する SVG のルール

- 箱の面と同じ大きさにする：`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120" width="180mm" height="120mm">`（かずはこは 165×120）
- 1 単位 = 1mm にする。px の大きさだと、仕上げページで別の大きさになる
- 使わない：`script`、`foreignObject`、外部 URL、画像の埋め込み
- 指示がなければ、文字・人物・ロゴは入れない

## 手直しを頼まれたとき

`draft/` の「SVGを保存」で保存した SVG が渡されます。調整値は、そのときの値で埋め込み済みです。
指示どおりに直した SVG を、同じルールで出力してください。
