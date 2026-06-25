# setup-scheduler.ps1
# 创建 Windows 定时任务：每天 9:00-21:00 每小时刷新火山业务数据
# 需要管理员权限运行

$taskName = "VolcanoDashboardRefresh"
$scriptPath = "D:\Projects\WorkBuddy\2026-06-24-17-09-08\volcano-dashboard\refresh-data.js"
$nodePath = "C:\ProgramData\WorkBuddy\users\d291074\.workbuddy\binaries\node\versions\22.22.2\node.exe"

# 删除已有任务（如果存在）
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# 创建触发器：每天 9:00 开始，每 1 小时重复，持续 13 小时（到 22:00）
$trigger = New-ScheduledTaskTrigger -Daily -At "09:00"
$trigger.Repetition = (New-CimInstance -CimClass (Get-CimClass -Namespace "Root/Microsoft/Windows/TaskScheduler" -ClassName "MSFT_TaskRepetitionPattern"))
$trigger.Repetition.Interval = "PT1H"
$trigger.Repetition.Duration = "PT13H"
$trigger.Repetition.StopAtDurationEnd = $false

# 创建操作：运行 node refresh-data.js
$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$scriptPath`"" -WorkingDirectory "D:\Projects\WorkBuddy\2026-06-24-17-09-08\volcano-dashboard"

# 创建设置
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable

# 注册任务
Register-ScheduledTask -TaskName $taskName -Trigger $trigger -Action $action -Settings $settings -Description "火山业务数据 Dashboard 每小时自动刷新 (9:00-22:00)" -Force

Write-Host "定时任务 '$taskName' 已创建成功！"
Write-Host "触发时间: 每天 09:00 - 22:00，每小时执行一次"
Write-Host "执行内容: node $scriptPath"
