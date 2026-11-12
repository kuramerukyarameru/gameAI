$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$cxx = if ($env:CXX) { $env:CXX } else { 'clang++' }
$exports = @('state_ptr','state_size','trace_ptr','diagnostics_ptr','certificate_ptr','generation_attempts','validate_state','is_finished','fire','play','make_board','choose_ai','agent_manifest')
$arguments = @('--target=wasm32','-std=c++17','-O3','-nostdlib','-fno-exceptions','-fno-rtti','-Wl,--no-entry','-Wl,--export-memory','-Wl,--initial-memory=4194304','-Wl,-z,stack-size=1048576','-Wl,--strip-all')
foreach ($name in $exports) { $arguments += "-Wl,--export=$name" }
$arguments += @('AI.cpp','-o','runtime/AI.wasm')
& $cxx @arguments
if ($LASTEXITCODE -ne 0) { throw 'WebAssembly build failed. Install LLVM/Clang and lld.' }
Write-Host 'Built runtime/AI.wasm'
