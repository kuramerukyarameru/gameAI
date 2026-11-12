# Validation report - Research Edition 02

These are functional checks, not evidence that any one AI is the strongest.
The engine report below matches the SHA-256 of the delivered WebAssembly file.

## Engine and AI checks

- Generated boards checked: 845.
- Independently replayed core-reachability certificates: 2535.
- Complete AI games: 150 (25 agents, both seats, 6/100/200 mirrors, versus the random baseline).
- AI decisions in complete games: 3160.
- Fixed-budget deterministic checks: 25.
- Alpha-beta / plain negamax comparison checks: 24.
- Final-turn proof-number checks: 2.
- Statistical aggregation checks: 4.
- JavaScript extension registration checks: 1.
- Time-budget mode checks: 25.
- Learned-value perspective checks: 9.
- Reported errors: 0.

The supported mirror count is 6 through 200, inclusive. The initial positions
have no initial core hit, and each core has an independently validated legal
reachability sequence. This does NOT prove forced capture against an opponent,
that all cores can be collected in one sequence, or that the game is balanced.
There were 240 fallback-generator boards in this test sample.

## Browser checks

Browser tested: Chromium 144.0.7559.96.

### Desktop

- 25 agents + human loaded
- Worker decisions, previous/next replay
- Mirror count 6 and 200 + reachability dialog
- Human move + AI response; JSON serialization, import and replay
- 25 atlas cards and five detailed explanations
- 24-game paired tournament; density filter; CI gate; JSON + CSV serialization + import
- Tournament game replay to terminal
- Stop keeps complete paired legs; no inferential interval

### Mobile

- 390x844 responsive arena; no document horizontal overflow
- AI25 detail dialog fits viewport
- Experiment layout; tables scroll inside containers

## Scope and limitations

- The browser harness exercises download serialization and file import. It does
  not prove every browser's operating-system download dialog behavior.
- Actual deployment into the user's GitHub repository was not performed.
- Safari, Firefox, physical mobile devices, and long-running large tournaments
  were not tested in this environment.
- The full 25-agent round-robin has not been run. No strength ranking is bundled.
- 25 agent implementations include baselines, shared search families, and
  modifications, not 25 unrelated algorithmic principles.
- AI02 seeks fast capture heuristically; it does not guarantee fastest victory.
- AI21 reports unknown when its proof search is incomplete; it is not a general
  proof of the game's winner.
- AI25 is a small fitted linear evaluator with bundled data and coefficients,
  not a large pretrained model or a claim of superior strength.
- Pairwise intervals require the fixed experimental plan to complete. They are
  conservative, depend on the stated sampling assumptions, and are not a
  universal guarantee of ranking across all boards and hardware.

See [research notes](RESEARCH.md), [AI guide](AI_GUIDE.md), and [rules](RULES.md)
for assumptions, formulas, implementation choices, and known limitations.

## Reproducibility

Raw reports: `tests/engine-report.json`, `tests/browser-report.json`.
Tests: `tests/engine.test.mjs`, `tests/browser.test.py`.
Run the engine tests from the project directory with:

```sh
node tests/engine.test.mjs
```

Delivered `runtime/AI.wasm` SHA-256:

```text
c91ac5c5087ab7c41afc86595651100251e45fed096884c7c7684f0c254cdb7e
```

## Edition 03 / 2ms budget

UIの共通探索予算は2msに変更。協調的な探索打ち切りであり、ブラウザの処理時間を厳密に2ms以内へ強制することはできません。Wasmのバイナリそのものは上記SHAの検証済み版から変更していません。Edition 03の追加計測は別途 `tests/2ms-report.json` に記録します。

追加の2msベンチマーク（Node.js / 実行環境依存）では、鏡6・50・100・200枚に対する900回の合法手選択と、150局の完了対局を検証し、違法手は0でした。実測2msを超えた選択は471回、最大は約3.37msでした。したがって**厳密な2ms保証ではありません**。実測詳細は `tests/2ms-report.json` にあります。
