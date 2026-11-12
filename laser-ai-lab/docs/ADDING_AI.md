# AIを追加する

UI・対戦進行・得点計算・集計を編集せずに、新しいAIを登録できます。最初は既存AIを変更するより、AI03として追加し、同じ実験で比較するのがおすすめです。

## A. C++版：関数を追加し、1行登録する

### 1. テンプレートをコピー

`cpp/ai/ai03_template.hpp` をコピーし、独自の関数を作成します。

```cpp
#pragma once
namespace laser {
inline int myAI(const State& state, Context& ctx) {
    if (finished(state)) return -1;
    // Return a mirror ID in [0, 99].
    return ctx.rng.below(MIRRORS);
}
}
```

返すのは**鏡ID（0〜99）**です。盤面マス番号（0〜224）ではありません。位置は `state.mirrors[mirrorID]`、向きは `state.board[position]` から取得します。

### 2. `cpp/registry.hpp` に登録

ヘッダーをincludeし、`AGENTS` に1行追加します。

```cpp
#include "ai/my_ai.hpp"

// Inside AGENTS:
{"AI03", "My Search", "A description of my method.", "0.1.0", myAI},
```

IDは `AI03` のような重複しない英字始まりの識別子にします。英数字・アンダースコア・ハイフンのみ、32文字以内です。アルゴリズムを変えたら `version` も変更してください。既存バージョンを残すと、改良前後の直接対戦ができます。

### 3. ビルドする

ClangとWasm対応lldが使える環境で、プロジェクト直下から実行します。

```sh
sh scripts/build.sh
node tests/engine.test.mjs
node tests/worker.test.mjs
```

Windows PowerShellでは `scripts/build.ps1` を使用できます。生成された `runtime/AI.wasm` を更新すると、AI一覧・対局設定・観戦・実験への登録が自動で反映されます。

### ローカルにコンパイラを入れない方法

同梱の `.github/workflows/build-ai.yml` は、GitHub Actions上でWasmを作る**手動実行用**です。

1. 新しいC++ファイルと登録変更をGitHubに保存します。
2. リポジトリの `Actions → Build AI WebAssembly → Run workflow` を実行します。
3. 成功した実行の `Artifacts` にある `laser-ai-wasm` を取得します。
4. 中の `AI.wasm` で、リポジトリの `runtime/AI.wasm` を置き換えます。

この補助ワークフローは自動コミット・自動公開を行いません。リポジトリの設定によってActionsの有効化が必要です。利用量や実行可否はGitHub側の契約・設定に従います。ソースをアップロードするだけでは、古いWasmは更新されません。

### C++ビルドの範囲

同梱のビルドは、外部依存をなくすための軽量なfreestanding構成です。標準ライブラリはリンクしません。まずはテンプレートと同様に、固定長配列・整数演算・自前の探索用配列を使って実装してください。`std::vector`、`iostream`、動的メモリ確保などをそのまま追加する構成ではありません。標準ライブラリが必要なAIには、対応したツールチェーンと読込方式の整備が別途必要です。JavaScript版の追加AIは通常の配列などを使えます。

初期のWasmメモリは4 MiB、スタックは1 MiBです。大きな探索表・ノードプールを固定配列で持つ場合は、`scripts/build.sh` / `build.ps1` のメモリ設定も見直してください。C++の探索機能そのものが2種類に限定されているわけではありません。
## B. JavaScript版：ビルドなしで追加する

`js/ai/example.js` をコピーし、例えば `js/ai/ai03.js` にします。

```js
export default {
  id: 'AI03',
  name: 'My Search',
  version: '0.1.0',
  description: 'Describe the method.',
  choose(state, context) {
    // state is an Int32Array; see ABI in runtime/engine.js.
    const result = context.simulate(state, 0);
    // result.state: next state; result.hits: captured-core bit mask
    return 0;
  },
};
```

`js/ai/custom.js` で登録します。

```js
import ai03 from './ai03.js';
export const customAgents = [ai03];
```

ファイルをアップロードして再読込すると、同じ選択画面にAI03が現れます。ゲームのルールはJavaScriptで作り直さず、`context.simulate()` を通して共通C++エンジンを使います。

## 共通ルールと測定の契約

| 内容 | C++ | JavaScript |
|---|---|---|
| 手の選択 | `int fn(const State&, Context&)` | `choose(state, context)` |
| 合法手 | 鏡ID 0〜99 | 同左 |
| 再現可能な乱数 | `ctx.rng.below(n)` | `context.random()` は32bit整数 |
| カウント付き局面遷移 | `simulate(state, move, next, ctx)` | `context.simulate(state, move)` |
| シミュレーション上限 | `ctx.budget` | `context.budget` |
| ルール計算 | `apply / trace / plan` | `context.engine` 経由 |
| その他の診断 | `ctx.stats` | 戻り値 `{move, graphVisits, ...}` |

`state` は勝手に変更せず、コピーをシミュレーションに使ってください。実対局の状態更新と得点判定はホスト側が行います。

探索は設定したシミュレーション上限を守ります。C++では自動的に探索ループを停止させることはできないため、自分で `ctx.stats.simulations < ctx.budget` を確認してください。`apply()` を探索内で直接呼ぶ場合も、その回数を正しく計上してください。`plan()` の戻り値の `simulations` は経路検証に使った遷移数です。AI02はこれも合計に含めています。

JavaScriptの `context.simulate()` は予算超過をエラーにします。`context.engine.play()` の直接呼出しでカウントを迂回しないでください。

経路計算など、遷移以外の計算も無制限に増やさないでください。比較はシミュレーション数だけでなく思考時間を併記します。`Math.random()` や時刻を乱数に使うと、シードによる再現性が失われます。

### 評価値の視点

`state.turn % 2` が現在のプレイヤーです。シミュレーション中は毎手変わるため、「探索を始めた自分」の番号を保存して評価してください。コアは共有で、特定の色に所属しているわけではありません。

### 注意

この仕組みは、信頼できる自作AIを追加するためのものです。第三者の任意プログラムを安全に実行するサンドボックス競技場ではありません。AIが暴走した場合は実験の停止でWorkerを終了できます。通常対局では応答待ちに20秒の保護上限がありますが、すべての独自実装の安全性を保証するものではありません。

## 追加したときの確認

AIライブラリに表示されること、人間対AIとAI同士対戦で合法手を返すこと、同じシードで再現すること、予算を超えないこと、実験JSONに正しいID・バージョンが残ることを確認してください。

C++の追加はWasmのSHA-256にも反映されます。JavaScriptの追加・変更はWasmのハッシュに含まれないため、必ずAIバージョンを更新し、研究記録にGitのコミットIDも残してください。