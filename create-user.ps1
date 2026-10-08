param(
  [Parameter(Mandatory=$true)][string]$Username,
  [Parameter(Mandatory=$true)][ValidateSet('admin','faculty','student')][string]$Role,
  [string]$DisplayName,
  [string]$StudentId
)
if ($Role -eq 'student' -and -not $StudentId) { throw 'Student accounts require -StudentId (the student ID in the cohort).' }
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodePath = if ($nodeCommand) { $nodeCommand.Source } elseif (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { throw 'Node.js 24+ was not found. Install Node.js, or run this on the computer that has the Codex bundled runtime.' }
$nodeVersion = [Version]((& $nodePath --version).TrimStart('v'))
if ($nodeVersion.Major -lt 24) { throw 'CampusIQ requires Node.js 24 or newer.' }
$securePassword = Read-Host 'Create a password (12+ characters)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:CAMPUSIQ_USER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($Role -eq 'student') {
    if ($DisplayName) { & $nodePath (Join-Path $PSScriptRoot 'server.js') add-student $Username $StudentId $DisplayName }
    else { & $nodePath (Join-Path $PSScriptRoot 'server.js') add-student $Username $StudentId }
  } elseif ($DisplayName) { & $nodePath (Join-Path $PSScriptRoot 'server.js') add-user $Username $Role $DisplayName }
  else { & $nodePath (Join-Path $PSScriptRoot 'server.js') add-user $Username $Role }
  if ($LASTEXITCODE -ne 0) { throw 'Account creation failed.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:CAMPUSIQ_USER_PASSWORD -ErrorAction SilentlyContinue
}
