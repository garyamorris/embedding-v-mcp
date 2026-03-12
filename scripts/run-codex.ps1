param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("dev", "build", "start", "lint")]
  [string]$Task
)

$projectRoot = ((Get-Location).ProviderPath -replace '^\\\\\?\\', '')

if (-not $projectRoot) {
  throw "Could not resolve a normal filesystem path for the current workspace."
}

Set-Location -LiteralPath $projectRoot

switch ($Task) {
  "dev" {
    $env:NODE_USE_SYSTEM_CA = "1"
    & node (Join-Path $projectRoot "node_modules\next\dist\bin\next") dev
  }
  "build" {
    $env:NODE_USE_SYSTEM_CA = "1"
    & node (Join-Path $projectRoot "node_modules\next\dist\bin\next") build
  }
  "start" {
    $env:NODE_USE_SYSTEM_CA = "1"
    & node (Join-Path $projectRoot "node_modules\next\dist\bin\next") start
  }
  "lint" {
    & node (Join-Path $projectRoot "node_modules\eslint\bin\eslint.js")
  }
}
