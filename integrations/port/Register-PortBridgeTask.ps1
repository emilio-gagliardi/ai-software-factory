[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$Repo = 'D:\workspace\personal\data-science-workbench',
    [string]$PythonW = (Get-Command pythonw.exe -ErrorAction Stop).Source,
    [string]$TaskName = 'ArchonPortBridge',
    [switch]$Unregister
)

if ($Unregister) {
    if ($PSCmdlet.ShouldProcess($TaskName, 'Unregister scheduled task')) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        Write-Output "Removed scheduled task: $TaskName"
    }
    return
}

$repoPath = (Resolve-Path -LiteralPath $Repo -ErrorAction Stop).Path
$syncScript = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'archon_port_sync.py') -ErrorAction Stop).Path
$pythonPath = (Resolve-Path -LiteralPath $PythonW -ErrorAction Stop).Path
$currentUser = if ($env:USERDOMAIN) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
$arguments = '"{0}" --serve --apply --repo "{1}"' -f $syncScript, $repoPath

$action = New-ScheduledTaskAction -Execute $pythonPath -Argument $arguments -WorkingDirectory $repoPath
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

if ($PSCmdlet.ShouldProcess($TaskName, 'Register scheduled task')) {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal `
        -Settings $settings -Force | Out-Null
    $state = (Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop).State
    Write-Output "Scheduled task $TaskName state: $state"
}
