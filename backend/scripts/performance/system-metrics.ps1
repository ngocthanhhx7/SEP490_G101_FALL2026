param(
  [int]$DurationSeconds = 60,
  [int]$IntervalSeconds = 5,
  [int]$BackendPid = 0,
  [int]$MongoPid = 0,
  [string]$OutputPath = 'storage/performance/system-metrics.csv'
)

if ($DurationSeconds -lt 1 -or $IntervalSeconds -lt 1) { throw 'DurationSeconds and IntervalSeconds must be positive' }
$output = Join-Path (Get-Location) $OutputPath
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $output) | Out-Null
$rows = [System.Collections.Generic.List[object]]::new()
$end = (Get-Date).AddSeconds($DurationSeconds)

while ((Get-Date) -lt $end) {
  $now = Get-Date
  $processes = @($BackendPid, $MongoPid) | Where-Object { $_ -gt 0 } | ForEach-Object {
    Get-Process -Id $_ -ErrorAction SilentlyContinue
  }
  $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
  $queue = (Get-Counter '\System\Processor Queue Length' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
  if ($processes.Count -eq 0) {
    $rows.Add([pscustomobject]@{ timestamp = $now.ToString('o'); process = 'none'; pid = ''; workingSetMb = ''; cpuSeconds = ''; threads = ''; totalCpuPercent = $cpu; processorQueue = $queue })
  } else {
    foreach ($process in $processes) {
      $rows.Add([pscustomobject]@{
        timestamp = $now.ToString('o'); process = $process.ProcessName; pid = $process.Id
        workingSetMb = [math]::Round($process.WorkingSet64 / 1MB, 2); cpuSeconds = $process.CPU
        threads = $process.Threads.Count; totalCpuPercent = $cpu; processorQueue = $queue
      })
    }
  }
  Start-Sleep -Seconds $IntervalSeconds
}

$rows | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $output
Write-Output (ConvertTo-Json @{ state = 'CAPTURED'; output = $output; samples = $rows.Count } -Compress)
