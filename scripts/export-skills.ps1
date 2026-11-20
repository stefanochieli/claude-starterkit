# Exports the starterkit skills for use OUTSIDE Claude Code:
#   - one zip per skill, to upload to claude.ai (Customize > Skills, "Upload .zip");
#   - a copy in the GitHub Copilot skills folders (a repo's .github/skills, or ~/.copilot/skills).
# The exported SKILL.md keeps only `name` and `description` in the frontmatter, replaces the
# $ARGUMENTS placeholder (Claude Code only) with "what I wrote in my message", and adds a note.
# The hooks and the verifier subagent are not exported: they only work in Claude Code.
# Idempotent. An existing, different SKILL.md in a Copilot folder is first saved as SKILL.md.bak-*.
#
# Usage: ./scripts/export-skills.ps1 [-Zip] [-ZipDir DIR] [-CopilotRepo PATH] [-CopilotUser] [-Skills a,b]
#   -Zip / -ZipDir DIR  write <skill>.zip files to DIR (default: .\dist\skills). Default if no target is given.
#   -CopilotRepo PATH   copy to PATH\.github\skills\<skill>\SKILL.md
#   -CopilotUser        copy to ~\.copilot\skills\<skill>\SKILL.md ($env:COPILOT_HOME if set)
#   -Skills a,b         only these skills (default: all)
param(
  [switch]$Zip,
  [string]$ZipDir = '',
  [string]$CopilotRepo = '',
  [switch]$CopilotUser,
  [string[]]$Skills = @()
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$skillsDir = Join-Path $root 'plugins/starterkit/skills'
$doZip = $Zip.IsPresent -or ($ZipDir -ne '')
if (-not $doZip -and $CopilotRepo -eq '' -and -not $CopilotUser) { $doZip = $true }
if ($ZipDir -eq '') { $ZipDir = Join-Path (Get-Location) 'dist/skills' }
if ($CopilotRepo -ne '' -and -not (Test-Path -PathType Container $CopilotRepo)) {
  Write-Error "Not a directory: $CopilotRepo"; exit 1
}

$all = Get-ChildItem -Directory $skillsDir | ForEach-Object { $_.Name }
$names = if ($Skills.Count -gt 0) { $Skills } else { $all }
foreach ($n in $names) { if ($all -notcontains $n) { Write-Error "Unknown skill: $n"; exit 1 } }

$utf8 = New-Object System.Text.UTF8Encoding($false)   # UTF-8 without BOM
$note = '> Note: this skill was written for Claude Code. If a command, tool or file it mentions is not available here, say so and continue without it.'

function Convert-Skill([string]$name) {
  $text = [System.IO.File]::ReadAllText((Join-Path $skillsDir "$name/SKILL.md")).Replace("`r`n", "`n")
  $m = [regex]::Match($text, '(?s)\A---\n(.*?)\n---\n(.*)\z')
  if (-not $m.Success) { throw "No frontmatter in $name" }
  $keep = ($m.Groups[1].Value -split "`n") | Where-Object { $_ -match '^(name|description):' }
  $body = $m.Groups[2].Value.Replace('$ARGUMENTS', 'what I wrote in my message')
  return "---`n" + ($keep -join "`n") + "`n---`n`n$note`n" + $body
}

function Copy-Skill([string]$name, [string]$content, [string]$skillsRoot) {
  $dir = Join-Path $skillsRoot $name
  $dest = Join-Path $dir 'SKILL.md'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  if (Test-Path $dest) {
    if ([System.IO.File]::ReadAllText($dest) -ceq $content) { Write-Host "Already up to date: $dest"; return }
    $stamp = Get-Date -Format yyyyMMddHHmmss
    $backup = "$dest.bak-$stamp"; $i = 1
    while (Test-Path $backup) { $backup = "$dest.bak-$stamp-$i"; $i++ }
    Copy-Item $dest $backup; Write-Host "Backup: $backup"
  }
  [System.IO.File]::WriteAllText($dest, $content, $utf8)
  Write-Host "Updated $dest"
}

if ($doZip) { New-Item -ItemType Directory -Force -Path $ZipDir | Out-Null; $ZipDir = (Resolve-Path $ZipDir).Path }
foreach ($n in $names) {
  $content = Convert-Skill $n
  if ($doZip) {
    $out = Join-Path $ZipDir "$n.zip"
    if (Test-Path $out) { Remove-Item $out }
    # Entry names are written by hand with "/" (Compress-Archive in Windows PowerShell 5.1 writes "\").
    $fs = [System.IO.File]::Open($out, 'Create')
    $za = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
    $entry = $za.CreateEntry("$n/SKILL.md")
    $s = $entry.Open(); $bytes = $utf8.GetBytes($content); $s.Write($bytes, 0, $bytes.Length); $s.Dispose()
    $za.Dispose(); $fs.Dispose()
    Write-Host "Zip: $out"
  }
  if ($CopilotRepo -ne '') { Copy-Skill $n $content (Join-Path $CopilotRepo '.github/skills') }
  if ($CopilotUser) {
    $h = if ($env:COPILOT_HOME) { $env:COPILOT_HOME } else { Join-Path $HOME '.copilot' }
    Copy-Skill $n $content (Join-Path $h 'skills')
  }
}
