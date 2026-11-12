# LASER / AI LAB — Research Edition 03 · 2ms

**25体のAI。可変の鏡枚数（6〜200）。全AIが1手2msの探索予算。白・青の画面とピンクのレーザー。**

ブラウザだけで、人間対AI・AI同士の観戦・先後を交換した総当たり実験を行う研究用ゲームです。
**公開用の `runtime/AI.wasm` は生成済みです。今あるAI01〜AI25を遊ぶためのコンパイル・npm install・外部AI APIは不要です。**

## いちばん簡単な公開方法

1. ZIPを展開します。このZIPの直下には `index.html` があります。
2. **展開先フォルダの中身をすべて** GitHubの公開したいリポジトリへアップロードします。ZIPファイルそのものはアップロードしません。
3. `Settings → Pages → Deploy from a branch → main → /(root) → Save` を選びます。
4. リポジトリの `Actions` でPagesのデプロイが成功したことを確認し、`Settings → Pages → Visit site` を開きます。

`index.html` のファイル一覧での並び順は関係ありません。**公開元の階層**が重要です。

### 以前の gameAI リポジトリを更新する場合

既存ファイルを手元にバックアップしてから、次のどちらかに統一してください。

- リポジトリ直下に今回の中身を置く場合：
  `gameAI/index.html` → `https://kuramerukyarameru.github.io/gameAI/`
- 以前と同じサブフォルダを使う場合：
  `gameAI/laser-ai-lab/index.html` → `https://kuramerukyarameru.github.io/gameAI/laser-ai-lab/`

サブフォルダのまま公開しても動きます。**アップロード先と、開くURLの階層を一致させてください。**
このパッケージは `/gameAI/` のような固定絶対パスに依存しません。
旧版と新版の `script.js`、`js/`、`runtime/` を混ぜないでください。今回のファイル一式で置き換えます。
作者のリポジトリへの実際のアップロードは、このパッケージ作成時点では行っていません。

公式資料：
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 最初の操作

**観戦：** ARENAで先手・後手のAIを選び、「盤面を生成」→「対戦を開始」。
**自分で対戦：** 先手または後手を「人間」にし、「盤面を生成」。自分の手番で鏡をクリックします。
**鏡の枚数：** 6〜200の整数を指定し、「盤面を生成」で反映します。初期値は100です。
**思考時間：** AI01〜AI25の全員が1手あたり**2msの探索打ち切り目安**を共有します。2ms経過後は追加の探索に進まない設計ですが、途中の処理や呼び出しのオーバーヘッドにより実測値が2msを多少超える場合があります。厳密なリアルタイム強制停止ではありません。
**仕組みを読む：** AGENTSの各カードから、AI01〜AI25の動作、評価式、長所、弱点、比較方法、実装関数を読めます。
**比較実験：** EXPERIMENTで参加AI・鏡枚数のリスト・盤面数を設定し、開始します。

初めてはAI01・AI03・AI05の3体、鏡20・100枚、盤面2個程度で、設定と結果表示の流れを確認してください。
2msでは探索型AIの深い読みが途中で打ち切られる場合が多く、その制約も研究対象です。
これは精密な強さ評価に十分な標本数ではありません。精度は区間の幅を見て判断します。

## この版のルール

15×15マス、共通のレーザー発射台3台とコア3個。両者合計30操作。
手番ごとに固定された鏡を1枚選び、`/` と `\` を切り替えます。移動はしません。
直後に3台が同時発射し、未獲得コアへの命中を操作した側の得点にします。
全3コアが獲得された場合は残りの操作を省略して終了。得点が同じなら引き分けです。

各初期盤面で「初期命中がない」「各コアに個別に届く合法操作列がある」を検証します。
これは相手に妨害されても取れる保証や、すべてのコアを必ず取れる保証ではありません。
少ない鏡・多い鏡でも同じルールで動作しますが、面白さ・先後の有利不利は未確定です。
対応範囲6〜200枚は、この版の盤面生成器が扱う範囲です。0〜5枚や201枚以上は対応していません。

詳しくは [ルールと盤面生成](docs/RULES.md)。

## 同梱内容

```text
index.html                 画面。ZIP直下
style.css                  白・青のUI、レスポンシブ表示
script.js                  画面・対局・読み込み
favicon.svg                アイコン
runtime/
  AI.wasm                  コンパイル済み共通エンジンと25体のAI
  engine.js                JavaScriptとWasmの接続
js/
  agents.js                AIの共通呼び出し
  extensions.js            ビルド不要で新しいJS AIを追加する場所
  catalog.js               25体の詳細説明
  worker.js                AI思考・大量対戦を画面から分離
  board.js                 盤面・光路の描画
  statistics.js            集計・区間・CSV
AI.cpp                     C++とWasmの公開インターフェース
cpp/                       共通エンジン・25体の実装・登録・学習済み係数
models/                    AI25の学習データとモデル情報
docs/                      詳細な説明書
scripts/                   再ビルド・再学習用
tests/                     検証コード・実行結果
START_LOCAL.bat            Windows用のローカルサーバー起動補助
README.md                  この説明書
.nojekyll                  GitHub Pagesに静的ファイルとして公開
```

ゲーム本体に必要なのは `index.html`、`style.css`、`script.js`、`js/` 全体、`runtime/` 全体です。
アイコンや説明書のリンクも含めて使うため、**公開時はZIPの中身をまとめてアップロードするのが確実**です。
C++・テスト・学習データは実行中にダウンロードされませんが、研究の確認用に同梱しています。

## 保存・再生・結果

- 対局は「棋譜を保存」からJSONで保存します。「読み込む」で操作を再検証して再生します。
- 実験結果はゲーム単位のCSVと、全操作・設定を含むJSONで保存できます。
- 思考時間、盤面遷移、評価回数、完了プレイアウト、BFS訪問数などを記録します。
- 結果は鏡枚数ごとに分けて表示します。全枚数の混合は参考値です。
- 先後2局を1標本として、完了した固定計画の直接対戦に保守的な同時95%区間を表示します。
- 途中停止では完了した先後ペアだけを保持します。中断した実験に推測用の区間は出しません。
- 実験を停止すると再開はできません。保存結果を読み込んで閲覧することはできます。
- 結果は自動でサーバー保存されません。再読み込み・タブを閉じる前にエクスポートしてください。
- 棋譜は旧版と形式が違います。この版は `laser-replay-v2` / `laser-experiment-v2` を読み込みます。
- JSON読み込みの上限は25MBです。非常に大きな実験は、最初から小さな計画に分けることを推奨します。

詳細は [研究方法と統計](docs/RESEARCH.md)。

## AIを追加する

一番簡単な方法は **`js/extensions.js` にAIを1つ追加すること**です。
画面・対戦相手の一覧・大会への登録は共通処理で行います。詳細は [AI追加ガイド](docs/ADDING_AI.md)。

C++を使いたい場合も対応しています。登録後のWasm再ビルドが必要です。
既存25体の中身は [AI図鑑](docs/AI_GUIDE.md) と `cpp/algorithms.hpp` にあります。

## ローカルで開く

HTMLをダブルクリックして `file://` で開く方法はサポートしません。
このフォルダで次を実行し、表示されたローカルURLを開きます。

```sh
python -m http.server 8000
```

アクセス先：`http://localhost:8000/`
WindowsでPythonをインストール済みなら `START_LOCAL.bat` も使えます。
Pythonはローカルで試すときだけの例です。GitHub Pagesで遊ぶ人には不要です。

## 開発者向け

Node.js 18以降でルール・AI・統計のテストを実行できます。外部npmパッケージは不要です。

```sh
node tests/engine.test.mjs
```

C++の再ビルドには `wasm32` を出力できるClangとwasm-ldを使います。
この版はEmscriptenの標準ライブラリを使わない小さなfreestanding構成です。

```sh
sh scripts/build.sh
```

AI25の再学習には追加でPython・NumPyが必要です。

```sh
node scripts/training-data.mjs
python3 scripts/train-model.py
sh scripts/build.sh
```

[実際に行ったテストと未確認範囲](docs/TEST_REPORT.md) を参照してください。
勝率のランキングは同梱していません。最強のAIは、条件を決めて実験で調べる対象です。

## ライセンス

プロジェクトのソースコードは同梱のMIT Licenseです。
資料の参考文献として記載した論文・外部ドキュメントの権利は各権利者に属します。
