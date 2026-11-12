# 実装の構造

## 役割の分離

`cpp/engine.hpp` がルールの唯一の正本です。盤面生成、到達手順の検証、反射、同時発射、コア獲得、終局判定をまとめています。C++ AIは同じ関数を呼び、JavaScript AIもWasmラッパー経由で同じルールを呼びます。JavaScriptに第2の反射エンジンは実装していません。

`AI.cpp` はC形式の公開関数と共有メモリ領域を提供します。C++標準ライブラリやOS機能に依存しない実装なので、LLVM/Clangから小さなWasmに直接コンパイルします。import不要のWebAssemblyモジュールで、ブラウザ側のネットワークAPIをC++から呼びません。

`runtime/engine.js` はWasmの状態領域にInt32Arrayを書き込み、関数を呼んで結果をコピーします。状態・経路・診断値は呼出しごとにコピーし、Wasm内の作業バッファが次の呼出しで再利用されても壊れないようにしています。

`js/worker.js` はAIの意思決定と実験を処理します。メインスレッドは描画・入力・操作の確定を担当します。一括実験はメイン画面から切り離し、停止時にはWorkerを終了できます。

## C++ AIの登録

`cpp/registry.hpp` の配列が、ID、名前、説明、版、選択関数を登録します。Wasmはこの情報をJSONで公開します。UIとWorkerは同じ登録情報を読みます。JavaScriptの追加AIは `js/ai/custom.js` から読み込み、共通一覧に結合します。

## State ABI

`runtime/engine.js` の `ABI` がオフセットの正本です。Int32Arrayの長さは341です。

| オフセット | 長さ | 意味 |
|---|---:|---|
| 0 | 1 | 完了した手数 |
| 1 | 2 | 各プレイヤーの獲得数 |
| 3 | 1 | 盤面シード（32bit） |
| 4 | 225 | マス種別 |
| 229 | 100 | 鏡ID → マス番号 |
| 329 | 3 | 発射台のマス番号 |
| 332 | 3 | 発射方向 |
| 335 | 3 | コアのマス番号 |
| 338 | 3 | コア所有者（-1 / 0 / 1） |

マス種別：0=空き、1=`/`、2=`\`、3=発射台、4=コア。獲得済みでも種別4は残り、所有者の配列を見て透過を判定します。

方向：0=上、1=右、2=下、3=左。マス番号は `row*15+column`。鏡IDとは別です。

## 操作と光の順序

`apply` は1個の鏡を切り替え、スナップショットに対して3本を追跡し、その命中集合を得点にします。表示用の経路も同じ追跡から取得します。画面表示のために、獲得後の盤面から勝手に光を再計算して同じ手の結果を変えないようにしています。

## 乱数と再現性

32bit xorshiftを使い、0シードには非ゼロの内部状態を割り当てます。C++の整数選択は棄却サンプリングで剰余バイアスを避けます。盤面の生成、AIのタイブレーク、実験のシード導出を明示的に分離しています。暗号用途の乱数ではありません。

## 対局ログ

棋譜JSONは初期状態と手順を保存します。読込時には版・Wasmハッシュ・状態・合法手を検証し、得点を再計算します。対局中の任意のフレームに戻っても、将来の棋譜を破壊しません。そこから分岐して遊ぶ機能はありません。

## GitHub Pagesへの適合

参照先はすべて相対パス、または `import.meta.url` を基準にしたURLです。リポジトリ名をURLに含むプロジェクトPagesでも動かせる構成です。データベース、サーバーAPI、SharedArrayBuffer、クロスオリジン分離ヘッダーを必要としません。Wasmの読込はArrayBuffer経由なので、ストリーミングコンパイル固有のMIME要件にも依存しません。

WebAssemblyは計算の実行形式であり、外部のAIサービスではありません。ゲームの勝敗判定やAIの思考は、利用者の端末上で実行されます。

## 参考文書

- GitHub Pages設定： https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- JavaScript Modules： https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules/Modules_on_the_web
- Web Workers： https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- LLVM Wasmリンカー： https://lld.llvm.org/WebAssembly.html

公開前には利用するブラウザとPagesの実URLで確認してください。このパッケージはGitHubアカウントへのログインや自動アップロードを行いません。