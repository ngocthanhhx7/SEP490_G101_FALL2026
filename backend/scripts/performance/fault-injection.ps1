param(
  [ValidateSet('status', 'stop-process')][string]$Action = 'status',
  [int]$ProcessId = 0,
  [switch]$ConfirmPerformanceFault
)

# shortcut: stop only the explicitly selected workspace process; restart and
# replica-set failover remain operator-controlled safety-critical actions.

if ($Action -eq 'status') {
  if ($ProcessId -gt 0) {
    Get-Process -Id $ProcessId -ErrorAction SilentlyContinue |
      Select-Object Id, ProcessName, Path, Responding | Format-List
  } else {
    Get-Process node, mongod, k6 -ErrorAction SilentlyContinue |
      Select-Object Id, ProcessName, Path, Responding | Format-Table -AutoSize
  }
  exit 0
}

if (-not $ConfirmPerformanceFault) { throw 'Destructive fault injection requires -ConfirmPerformanceFault' }
if ($env.PERF_FAULT_INJECTION -ne 'true') { throw 'Set PERF_FAULT_INJECTION=true in the current shell before injecting a fault' }
if ($ProcessId -le 0) { throw 'Pass an explicit -ProcessId; broad process selection is not allowed' }

$process = Get-Process -Id $ProcessId -ErrorAction Stop
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId"
$commandLine = [string]$processInfo.CommandLine
if (-not $commandLine -or $commandLine.IndexOf($workspace, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
  throw 'Refusing to stop a process whose command line is not tied to this workspace'
}
Stop-Process -Id $ProcessId -Force
Write-Output (ConvertTo-Json @{ state = 'STOPPED'; pid = $ProcessId; process = $process.ProcessName } -Compress)
