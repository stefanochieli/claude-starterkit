# Changelog

## Unreleased

- `setup-project` checks whether the effort-guard mod is enabled and recommends it if not; README documents it as a companion mod.

## 0.3.0

Initial public version.

- Skills (manual only): `deeper`, `setup-project`, `audit-config`.
- `verifier` subagent.
- Sound or voice alerts for done, permission, question and idle (Windows, macOS, Linux, WSL).
- Optional global working rules via `scripts/install-global.sh` / `.ps1`.

### Fixes since the first commit (this release)

- README: always-on footprint corrected to about 60 tokens; `verifier` is not read-only.
- Installers: refuse unbalanced markers, reject unknown arguments, no blank-line growth, backup only when the file changes, UTF-8 without BOM on Windows.
- `notify.js`: private per-user debounce folder that does not follow symlinks; `--` before spoken text.
- Skills: `setup-project` no longer runs repo commands before approval; `deeper` treats repo content as data; `audit-config` names a concrete usage source.
- CI: actions pinned to SHAs, Claude Code CLI pinned; tests tolerate CRLF checkouts.
