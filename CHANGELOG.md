# Changelog

## 0.4.0

- New `failed` alert: `StopFailure` hook, on by default, with its own sound and spoken text. A turn that dies on a rate limit or another API error no longer ends in silence (Claude Code does not fire `Stop` for it).
- Skill evals for `claude plugin eval` under `plugins/starterkit/evals/` (two cases, deterministic graders; run by hand, not in CI).
- `audit-config` asks for the output of `/doctor`, `/skill-doctor` and `/doctor prompt-audit` and builds on it instead of repeating the analysis.
- `setup-project` separates advice (skills, CLAUDE.md) from enforcement (hooks) and suggests `/run-skill-generator` for apps with a non-standard launch; `verifier` looks for a recorded verify/run recipe before build files.
- Opus 5.5 prompting habits: `deeper` rewrites tasks as goal, finished output, checks and stop-and-ask conditions, and no longer invites "think hard"; `audit-config` flags leftover "think hard" lines, retyped chart values and vague style rules; `setup-project` mentions Medium default effort, connectors and a house-style section; project template gets an optional Style section.
- Subagents and long-running work (from Anthropic's guides on folding subagents into the main loop and on always-on agents): `setup-project` prefers one agent with skills over specialist subagents and mentions deferred tool calls for unattended runs; `audit-config` flags subagent sprawl, contradicting rules and memory that copies what lives elsewhere; project template and README say to save pointers, not copies.
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
