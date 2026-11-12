#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
CXX="${CXX:-clang++}"
command -v "$CXX" >/dev/null 2>&1 || { echo 'Install LLVM/Clang and lld, or set CXX to your clang++ path.' >&2; exit 1; }
mkdir -p runtime
"$CXX" --target=wasm32 -std=c++17 -O3 -nostdlib -fno-exceptions -fno-rtti \
  -Wl,--no-entry -Wl,--export-memory -Wl,--initial-memory=4194304 \
  -Wl,-z,stack-size=1048576 -Wl,--strip-all \
  -Wl,--export=state_ptr -Wl,--export=state_size -Wl,--export=trace_ptr \
  -Wl,--export=diagnostics_ptr -Wl,--export=certificate_ptr \
  -Wl,--export=generation_attempts -Wl,--export=validate_state \
  -Wl,--export=is_finished -Wl,--export=fire -Wl,--export=play \
  -Wl,--export=make_board -Wl,--export=choose_ai -Wl,--export=agent_manifest \
  AI.cpp -o runtime/AI.wasm
printf 'Built runtime/AI.wasm\n'
