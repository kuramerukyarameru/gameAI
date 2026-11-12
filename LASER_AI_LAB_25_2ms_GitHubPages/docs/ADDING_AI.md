# AIを追加する — まずは1ファイルで

## A. 一番簡単：JavaScript版

**編集するのは `js/extensions.js` だけです。Wasmの再ビルドは不要です。**
同じIDが重複しないよう、AI26、AI27…を使います。
下の例は、全合法手を1手だけ試し、直後に取れるコアが多い手を優先する基準AIです。

```javascript
import { info } from '../runtime/engine.js';

export const extensions = [
  {
    id: 'AI26',
    name: 'Immediate Core',
    version: '1.0.0',
    family: 'custom',
    summary: '直後に取れるコアの数を最大化。先読みしない基準AI。',
    choose({ state, rng, simulate, hasBudget }) {
      const current = info(state);
      let bestMove = 0;
      let bestGain = -1;
      let ties = 0;

      for (let m = 0; m < current.mirrorCount; m++) {
        if (!hasBudget()) break;
        const next = simulate(state, m).state;
        const gain =
          info(next).scores[current.player] - current.scores[current.player];

        if (gain > bestGain) {
          bestGain = gain;
          bestMove = m;
          ties = 1;
        } else if (gain === bestGain) {
          ties++;
          // 同点の候補を偏らせないためのシード付き選択。
          // 極小のmodulo biasまで除きたい研究では棄却法に置き換える。
          if (rng() % ties === 0) bestMove = m;
        }
      }
      return bestMove;
    }
  }
];
```

既に別の拡張AIがある場合は、`extensions` 配列へオブジェクトを追記します。
アップロードした後はページを再読み込みします。
先手・後手の選択、参加AI一覧、AI図鑑は登録データから自動生成されます。

### 関数に渡されるもの

| 値 | 意味 |
|---|---|
| `state` | 現在の状態のコピー。`Int32Array`。直接添字を使うより `info(state)` を推奨 |
| `engine` | 共通のWasmエンジン |
| `rng()` | シード付き32bit符号なし整数 |
| `options` | `nodes`, `millis`, `depth`, `width` |
| `simulate(s, move)` | 合法手を適用し `{state, hits}` を返す。遷移を計数し予算をチェック |
| `hasBudget()` | 残りの時間・遷移予算があるかを確認 |

返り値は **回転させる鏡の番号 `0..M-1`**。盤面のマス番号ではありません。
オブジェクト `{move, evaluations, rollouts, depth, considered, ratings}` を返して診断を追加することもできます。
思考時間・`simulate`の回数はラッパーが記録します。
`info(state).mirrorCount` を使い、100枚と決め打ちしないでください。

ゲームの正しい更新は共通エンジンに任せます。AIが独自の得点ルールを持つのは避けてください。
乱数には引数の `rng()` を使い、`Math.random()` に依存しないことで再現しやすくなります。
ブラウザ描画やDOMにアクセスする必要はありません。AIはWorker内で実行されます。

### 詳しい解説を追加する

定義へ `steps`（文字列配列）、`formula`、`strength`、`caution`、`compare`、`parameters`、
`function` など、`js/catalog.js` の既存AIと同じ項目を付けると、詳細画面にも説明を載せられます。
項目名の最終的な参照先は `script.js` の `showAgent()` と `js/catalog.js` を確認してください。

### 予算と安全性

JS拡張は、作者が信頼するコードのための拡張口です。第三者コードを安全に隔離するサンドボックスではありません。
長いループでは必ず `hasBudget()` をチェックし、盤面更新は `simulate()` を通してください。現在の公開UIは全AIに `millis: 2` を固定して渡します。
直接 `engine.play()` を呼ぶだけでは共通ラッパーの遷移回数に入らず、比較が不公平になります。
無限ループはそのWorkerを占有します。画面側から中止できますが、厳密な実時間強制停止APIではありません。
返した鏡番号が違法ならエラーにし、別のAIへ黙って置き換えることはしません。

C++版とJS版は実行系が異なります。アルゴリズム効率と実行系の速度差を混同しないでください。
`runtime` の違いも記録されます。

## B. C++版

今ある25体はC++実装です。C++のAIを追加するときだけWasmの再ビルドが必要です。

### 1. 関数を書く

例として `cpp/ai26.hpp` を作ります。

```cpp
#pragma once
namespace laser {
inline int myAI26(const State& state, Context& ctx) {
    // まずは合法手を返す基準コード。
    // 本格的な探索は algorithms.hpp の既存実装を参考に追加する。
    return ctx.rng.below(state.mirrorCount);
}
}
```

### 2. 登録する

`cpp/registry.hpp` の `#include "algorithms.hpp"` の次に追加します。

```cpp
#include "ai26.hpp"
```

`AGENTS[]` の末尾に追加します。直前の要素とのカンマを忘れないでください。

```cpp
{"AI26", "My C++ Agent", myAI26}
```

`AGENT_COUNT` は配列サイズから計算します。
関数は、今の鏡枚数に対する合法な番号を返す必要があります。

### 3. 解説を記入

日本語の説明は `js/catalog.js` の `catalog` 配列に追加できます。
カタログに載せなくても選択はできますが、研究用には評価方法・打ち切り条件・弱点を記載してください。

### 4. 再ビルド

`wasm32` 対応のClangとwasm-ldが入った環境で、プロジェクト直下から実行します。

```sh
sh scripts/build.sh
node tests/engine.test.mjs
```

必要なら `CXX=/path/to/clang++ sh scripts/build.sh` でコンパイラを指定します。
この版は `-nostdlib` のfreestanding構成で、`std::vector` などはそのまま使用できません。
固定長配列を使うか、標準ライブラリ付きの別ビルドへ移行する設計が必要です。
**Emscriptenを入れたら、このビルドがそのまま同じになるわけではありません。**

生成された `runtime/AI.wasm` と、変更したコード・解説をアップロードします。
C++のソースだけをアップロードしても、ブラウザ側のAIは変わりません。

### テストについて

同梱の `tests/engine.test.mjs` は「初期25体」を基準にしています。
25体の数を直接assertしている箇所やAI01..AI25のループがあるため、
AI26を追加した際にはテスト対象・期待値も更新してください。
UIや大会は登録一覧から取得するため、この数値の変更は不要です。

## C. 守りたい共通契約

1. エンジンのルールは全AIで統一する。
2. 初期配置の解答手順をAIに渡さない。
3. 同じ初期状態・シード・固定遷移予算で再現性を確認する。
4. 戻り値が合法で、入力状態を壊さないかテストする。
5. 全体の思考予算を共有し、複合AIだけ予算を人数倍にしない。
6. 別AIとして登録するか、既存AIのバージョンを変えるかを明示する。
7. `AI25`のような学習AIは、訓練用シードと評価用シードを分ける。

追加のたびに全方式の勝率を断定するのではなく、
まず適法性・停止・再現性を確認し、その後で固定した実験計画による比較を行ってください。
