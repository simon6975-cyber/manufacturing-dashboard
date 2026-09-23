# dspm-local-sync 를 Windows 작업 스케줄러에 "1분마다 무기한 반복" 으로 등록한다.
# PowerShell을 "관리자 권한으로 실행"한 뒤 이 스크립트를 실행하세요:
#   powershell -ExecutionPolicy Bypass -File register_task.ps1
#
# 이미 등록되어 있으면 먼저 삭제 후 다시 만든다(설정을 바꿔 재실행해도 안전).

$TaskName = "DSPM Local Sync"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatPath = Join-Path $ScriptDir "run_sync.bat"

if (-not (Test-Path $BatPath)) {
  Write-Error "run_sync.bat 을 찾을 수 없습니다: $BatPath"
  exit 1
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "기존 작업을 제거하고 다시 등록합니다..."
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction -Execute $BatPath -WorkingDirectory $ScriptDir
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 1) `
  -RepetitionDuration ([TimeSpan]::MaxValue)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings `
  -Description "DSPM 실측 설비상태 API를 1분마다 조회해 Firestore(공정흐름도)에 반영" | Out-Null

Write-Host "등록 완료: '$TaskName' (1분마다 반복, 무기한)"
Write-Host "작업 스케줄러 앱에서 '$TaskName'을 찾아 우클릭 > 실행 으로 즉시 1회 테스트해볼 수 있습니다."
Write-Host "실행 결과는 $ScriptDir\sync.log 에 쌓입니다."
