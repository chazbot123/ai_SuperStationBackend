param(
  [string]$SourceRoot = "D:\zhilin_project\AI-SuperWeb\AI-SuperWeb",
  [string]$TargetRoot = "D:\zhilin_project",
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SourceRoot)) {
  throw "SourceRoot not found: $SourceRoot"
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "TargetRoot not found: $TargetRoot"
}

$sourceItem = Get-Item -LiteralPath $SourceRoot
$targetItem = Get-Item -LiteralPath $TargetRoot

if ($sourceItem.FullName.TrimEnd('\') -eq $targetItem.FullName.TrimEnd('\')) {
  throw "SourceRoot and TargetRoot cannot be the same"
}

$entries = Get-ChildItem -LiteralPath $SourceRoot -Force

if (-not $entries) {
  throw "SourceRoot is empty"
}

$conflicts = @()
foreach ($entry in $entries) {
  $destination = Join-Path $TargetRoot $entry.Name
  if (Test-Path -LiteralPath $destination) {
    $conflicts += $destination
  }
}

if ($conflicts.Count -gt 0) {
  Write-Host "Target path conflicts detected:" -ForegroundColor Yellow
  $conflicts | ForEach-Object { Write-Host $_ }
  exit 1
}

Write-Host "Preparing to move entries to $TargetRoot" -ForegroundColor Cyan
$entries | ForEach-Object { Write-Host $_.FullName }

if ($WhatIf) {
  Write-Host "WhatIf mode, no files moved" -ForegroundColor Yellow
  exit 0
}

foreach ($entry in $entries) {
  Move-Item -LiteralPath $entry.FullName -Destination $TargetRoot
}

Write-Host "Migration completed. Verify the new Git root and startup paths." -ForegroundColor Green
