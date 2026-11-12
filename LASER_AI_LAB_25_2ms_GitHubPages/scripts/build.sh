#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
CXX="${CXX:-clang++}"
"$CXX" --target=wasm32 -std=c++17 -O3 -nostdlib -fno-exceptions -fno-rtti \
 -Wl,--no-entry -Wl,--export-memory -Wl,--initial-memory=16777216 \
 -Wl,-z,stack-size=2097152 -Wl,--strip-all -Wl,--allow-undefined \
 -Wl,--export=state_ptr -Wl,--export=state_size -Wl,--export=trace_ptr \
 -Wl,--export=diagnostics_ptr -Wl,--export=certificate_ptr \
 -Wl,--export=generation_attempts -Wl,--export=validate_state \
 -Wl,--export=is_finished -Wl,--export=fire -Wl,--export=play \
 -Wl,--export=make_board -Wl,--export=choose_ai -Wl,--export=agent_manifest \
 -Wl,--export=feature_ptr AI.cpp -o runtime/AI.wasm
printf 'Built runtime/AI.wasm\n'
