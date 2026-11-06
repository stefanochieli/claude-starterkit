# Adds (or removes) the starterkit working rules in your global ~/.claude/CLAUDE.md.
# Plugins cannot ship a CLAUDE.md, so this is a separate, optional step.
# Idempotent: the block between the starterkit markers is replaced, never duplicated,
# and a run that changes nothing makes no backup. Otherwise a backup is made first.
#
# Usage: ./scripts/install-global.ps1 [-Remove]
param([switch]$Remove)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'plugins/starterkit/templates/global-claude.md'
$dir  = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$dest = Join-Path $dir 'CLAUDE.md'

if ($Remove -and -not (Test-Path $dest)) {
  Write-Host "Nothing to remove: $dest does not exist"
  exit 0
}

New-Item -ItemType Directory -Force -Path $dir | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)   # UTF-8 without BOM

$old = ''
$content = ''
if (Test-Path $dest) {
  $old = [System.IO.File]::ReadAllText($dest)
  # Marker names include the project's earlier names (proofkit, lean-kit).
  $starts = [regex]::Matches($old, '(?m)^<!-- (?:starterkit|proofkit|lean-kit):start -->\r?$').Count
  $ends   = [regex]::Matches($old, '(?m)^<!-- (?:starterkit|proofkit|lean-kit):end -->\r?$').Count
  if ($starts -ne $ends) {
    Write-Error "Unbalanced starterkit markers in $dest ($starts start, $ends end). Fix it by hand; nothing was changed."
    exit 1
  }
  $content = [regex]::Replace($old, '(?s)<!-- (?:starterkit|proofkit|lean-kit):start -->.*?<!-- (?:starterkit|proofkit|lean-kit):end -->\r?\n?', '')
  # Drop trailing blank lines so re-runs do not accumulate them.
  $content = $content.TrimEnd()
  if ($content.Length -gt 0) { $content += "`n" }
}

if (-not $Remove) {
  $block = [System.IO.File]::ReadAllText($src)
  if ($content.Length -gt 0) { $content += "`n" }
  $content += $block
}

if ($content -ceq $old) {
  Write-Host "Already up to date: $dest"
  exit 0
}

if (Test-Path $dest) {
  $stamp = Get-Date -Format yyyyMMddHHmmss
  $backup = "$dest.bak-$stamp"
  $n = 1
  while (Test-Path $backup) { $backup = "$dest.bak-$stamp-$n"; $n++ }
  Copy-Item $dest $backup
  Write-Host "Backup: $backup"
}

[System.IO.File]::WriteAllText($dest, $content, $utf8)
if ($Remove) { Write-Host "Removed starterkit block from $dest" } else { Write-Host "Updated $dest" }
