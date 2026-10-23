$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiUrl = "http://localhost:8080/api/healthz"
$webUrl = "http://localhost:25401/"

function Test-LocalEndpoint {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

$apiReady = $false
try {
  $apiReady = (Invoke-RestMethod -Uri $apiUrl -TimeoutSec 3).status -eq "ok"
} catch {
  $apiReady = $false
}

$webReady = Test-LocalEndpoint -Url $webUrl

if (-not $apiReady) {
  Push-Location $repoRoot
  try {
    . .\load-env.ps1
    pnpm --filter @workspace/api-server run build
    if ($LASTEXITCODE -ne 0) {
      throw "API build failed with exit code $LASTEXITCODE."
    }

    $apiCommand = ". .\load-env.ps1; pnpm --filter @workspace/api-server run start"
    $encodedApiCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($apiCommand))
    Start-Process -FilePath (Join-Path $PSHOME "powershell.exe") `
      -WorkingDirectory $repoRoot `
      -ArgumentList "-NoExit -EncodedCommand $encodedApiCommand"
    Write-Host "Starting API at http://localhost:8080"
  } finally {
    Pop-Location
  }
} else {
  Write-Host "API is already responding at http://localhost:8080"
}

if (-not $webReady) {
  $webCommand = "$env:PORT = '25401'; pnpm --filter @workspace/candidate-iq run dev"
  $encodedWebCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($webCommand))
  Start-Process -FilePath (Join-Path $PSHOME "powershell.exe") `
    -WorkingDirectory $repoRoot `
    -ArgumentList "-NoExit -EncodedCommand $encodedWebCommand"
  Write-Host "Starting frontend at http://localhost:25401"
} else {
  Write-Host "Frontend is already responding at http://localhost:25401"
}

Write-Host "Open http://localhost:25401/ when both servers are ready."