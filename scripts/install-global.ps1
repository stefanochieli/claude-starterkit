# Adds (or removes) the starterkit working rules in your global ~/.claude/CLAUDE.md.
# Plugins cannot ship a CLAUDE.md, so this is a separate, optional step.
# Idempotent: the block between the starterkit markers is replaced, never duplicated.
# A timestamped backup is made before every change.
#
# Usage: ./scripts/install-global.ps1 [-Remove]
param([switch]$Remove)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'plugins/starterkit/templates/global-claude.md'
$dir  = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$dest = Join-Path $dir 'CLAUDE.md'

New-Item -ItemType Directory -Force -Path $dir | Out-Null

$content = ''
if (Test-Path $dest) {
  $backup = "$dest.bak-$(Get-Date -Format yyyyMMddHHmmss)"
  Copy-Item $dest $backup
  Write-Host "Backup: $backup"
  $content = Get-Content $dest -Raw
  if ($null -eq $content) { $content = '' }
  # Also drops blocks written under the project's earlier names (proofkit, lean-kit).
  $content = [regex]::Replace($content, '(?s)<!-- (?:starterkit|proofkit|lean-kit):start -->.*?<!-- (?:starterkit|proofkit|lean-kit):end -->\r?\n?', '')
}

if (-not $Remove) {
  $block = Get-Content $src -Raw
  if ($content.Trim().Length -gt 0) { $content = $content.TrimEnd() + "`n`n" }
  $content = $content + $block
}

Set-Content -Path $dest -Value $content -NoNewline -Encoding utf8
if ($Remove) { Write-Host "Removed starterkit block from $dest" } else { Write-Host "Updated $dest" }
