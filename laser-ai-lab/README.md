# LASER / AI LAB

**光を、戦略に。**

15×15の共有盤面で、100枚の鏡を回して3つのコアを奪い合うゲームです。人間対AI・AI観戦・先後を交換した総当たり実験を、GitHub Pagesで動かせます。

**最初に読むファイル：`START_HERE.md`**

## このパッケージでできること

- 人間対AI。先手・後手を選択できます。
- AI同士の観戦。速度変更、一時停止、1手送り、棋譜の巻き戻し、盤面拡大、光の表示切り替えに対応。
- 複数AIの総当たり実験。同じ盤面を先後交換で2局対戦し、完了したペアだけを集計。
- 得点率、勝分敗、コア獲得数、思考時間の中央値・95%点、シミュレーション数、組合せ別の信頼区間を表示。
- 棋譜JSONの保存・読込。実験のCSV / JSON出力。結果表から対局を再生。
- 同じルールエンジンを利用するC++ / JavaScriptのAIを追加。

画面には架空の勝率やサンプル結果を埋め込んでいません。実験を実行した結果だけを表示します。

## まず公開する

`runtime/AI.wasm` はビルド済みです。**初回の公開ではC++のコンパイルも、npm installも不要**です。

1. GitHubにリポジトリを作成します。最初は公開リポジトリが分かりやすい構成です。
2. このフォルダの**中身**をアップロードします。`index.html` がリポジトリの一番上に来るようにしてください。外側の `laser-ai-lab/` フォルダをそのまま1階層追加しないように注意します。
3. `Settings → Pages → Build and deployment` で `Source: Deploy from a branch`、`Branch: main`、`/(root)` を選び、保存します。
4. Pagesに表示された公開URLを開きます。`index.html`、`style.css`、`script.js` だけでなく、**`runtime/` と `js/` も必須**です。

`.nojekyll` も同梱しています。隠しファイルをアップロードし損ねた場合は、GitHub上で同名の空ファイルを作成できます。

GitHubへのアップロードやアカウント設定は、このパッケージの作成時には行っていません。

公式の設定手順：
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## パソコン上で試す

`index.html` のダブルクリック（`file://`）では、ES Modules / Worker / Wasmの読込が動作しません。HTTP経由で開きます。

Pythonがある場合、このフォルダで次を実行します。

```sh
python -m http.server 8000 --bind 127.0.0.1
```

ブラウザで `http://localhost:8000` を開きます。Windowsでは `scripts/start-local.bat` からも起動できます。環境によってコマンド名は `python3` または `py` です。VS CodeのローカルHTTPサーバーでも確認できます。

ブラウザはJavaScript、WebAssembly、Canvas、ES Module Workerを利用できるものが必要です。ゲームの計算は端末内で行い、外部AI API、広告、CDN、外部フォントは使いません。ページ自体の取得には接続が必要です。サービスワーカーによるオフライン再起動機能はありません。

## AIの内容

### AI01 — Random

100個の鏡から一様ランダムで1個を選びます。C++側は剰余の偏りを避ける棄却法を使った乱数選択です。シードを固定すると選択を再現できます。探索はしません。

### AI02 — Rush Planner

早くコアを獲得することを目指す、説明しやすい基準AIです。

1. 各コアに向かう候補経路を、向き付きグラフの0–1探索で調べます。
2. その経路の鏡の向きが矛盾しないか、実際のルールで検証します。
3. 100通りの自分の手を試し、直後の獲得数を調べます。
4. 相手の次の1手による獲得を調べます。標準予算では相手の100通りを調べられます。軽量設定では一部に制限されます。
5. 2コアの確保、得点差、即時獲得、候補経路に必要な回転数で手を選びます。

**完全なMinimaxや、最短勝利を証明するAIではありません。** 経路探索も鏡の向きの整合性を検証した候補を使う方式であり、全局面の最適化ではありません。この限界を含めて、後から作るAIと比較するための基準にしています。

## ルールの重要な取り決め

15×15 / 固定位置の鏡100個 / 共通コア3個 / 共通発射台3基 / 合計30手です。毎手、どれか1個の鏡を90°回転させ、その直後に3基が同時発射します。コアを壊した手のプレイヤーが得点します。30手終了時に得点が多い方が勝ち、同点は引き分け。3個すべてが獲得されたら早期終了します。

初期配置はランダムに提案してから検証します。初期命中がなく、**3個それぞれについて、2〜6手で個別に到達する具体的な操作列**が見つかった盤面だけを採用します。これは妨害なしの存在証明であり、相手の最善対応下で勝てることや、全コアを30手以内に取れることの保証ではありません。生成に失敗した場合は未検証盤面を出さず、シードの変更を促します。

細かい同時発射・反射・ループの仕様は `docs/RULES.md` を参照してください。

## ファイル構成

```text
laser-ai-lab/
├── index.html                  3画面の構造
├── style.css                   PC / スマートフォンのデザイン
├── script.js                   対局・観戦・実験UI
├── AI.cpp                      C++とJavaScriptの公開インターフェース
├── favicon.svg
├── .nojekyll
├── runtime/
│   ├── AI.wasm                 ビルド済みのC++エンジン＋AI
│   └── engine.js               Wasmの薄い呼出しラッパー
├── cpp/
│   ├── engine.hpp              唯一のルールエンジン・盤面生成
│   ├── registry.hpp            C++のAI登録一覧
│   └── ai/
│       ├── ai01_random.hpp
│       ├── ai02_rush.hpp
│       └── ai03_template.hpp
├── js/
│   ├── board.js                Canvas描画・盤面操作
│   ├── agents.js               共通のAI呼出し
│   ├── worker.js               AI思考・一括実験
│   ├── statistics.js           ペア集計・信頼区間・CSV
│   └── ai/
│       ├── custom.js           JavaScriptのAI登録一覧
│       └── example.js          ビルド不要のAIテンプレート
├── scripts/
│   ├── build.sh                LLVM/ClangでWasmを再生成
│   ├── build.ps1               Windows PowerShell用
│   └── start-local.bat
├── tests/
│   ├── engine.test.mjs         ルール・生成・再現性テスト
│   ├── worker.test.mjs         実際のWorkerの対局・再現性テスト
│   └── node-worker-entry.mjs   Nodeテスト用の環境アダプタ
├── .github/workflows/
│   └── build-ai.yml            手動実行でWasmを作る補助ワークフロー
├── docs/                       ルール・追加方法・研究設計・テスト報告
├── package.json                実行コマンドのみ。外部npm依存なし
└── START_HERE.md
```

## テスト

Node.jsのある環境で、追加パッケージなしで実行できます。

```sh
node tests/engine.test.mjs
node tests/worker.test.mjs
```

同梱WasmはLLVM/Clang 17でコンパイルしました。変更後は次のいずれかで再ビルドします。ClangとWasm対応のlldが必要です。

```sh
sh scripts/build.sh
```

```powershell
.\scripts\build.ps1
```

今回のバイナリはLLVMから直接生成しており、Emscriptenの生成JSを必要としません。`runtime/engine.js` が橋渡しを担当します。

GitHub上だけでビルドする補助方法は `docs/ADDING_AI.md` に説明しています。補助ワークフロー自体はこの作業環境からGitHub上で実行していません。

## 実験データについて

CSVは対局単位の表、JSONは実験条件・WasmのSHA-256・AIバージョン・全手順を含む保存形式です。**結果は自動でサーバーに保存されません。再読み込みやタブ終了の前にJSONを保存してください。** 実験中にタブを閉じると計算は終了します。

信頼区間は保守的なHoeffding型の区間にBonferroni補正を適用し、先後2局を1つの標本として扱います。設定した対局数の完了前に有利な結果を見て止めた場合、同じ保証は使えません。詳細は `docs/RESEARCH.md` を参照してください。