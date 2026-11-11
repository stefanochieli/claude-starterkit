# claude-starterkit

A small, verification-first setup for Claude Code. It packages a few habits that work well with current models:

- **Little context.** The skills are manual-only and their full text loads only when you invoke them. The always-on footprint is about 60 tokens per session (v0.3.0, measured as the difference in input tokens with and without the plugin): only the `verifier` description is listed to the model. `claude plugin details starterkit` shows ~217 because it also counts the manual skills. Hooks cost no context.
- **Proof over diffs.** "Done" means an executable check passed, not that the agent said so.
- **Periodic cleanup.** Configuration that models no longer need gets removed.
- **Know when Claude needs you.** A voice or sound alert when Claude finishes, asks for permission, or asks a question, so you can look away while it works.

## What is inside

| Piece | Invoke | Purpose |
|---|---|---|
| `deeper` skill | `/starterkit:deeper <task>` | Rewrites a task into a *deeper* (not bigger) version: what a senior would add, which raw sources to read, which tools to use, what proves it is right. Does not execute; waits for your OK. |
| `setup-project` skill | `/starterkit:setup-project` | Analyzes the repo and proposes a lean CLAUDE.md, verification commands, and only the hooks, skills and subagents that earn their place. Approval required before any change. |
| `audit-config` skill | `/starterkit:audit-config [report\|apply]` | Monthly audit of usage and user-level config: heavy subagents, unused MCP servers, stale skills, bloated CLAUDE.md. Report-only by default; backups and diffs before any change. |
| `verifier` subagent | delegated by Claude, or "use the verifier" | Clean-context checker. Runs the project's checks and looks for weakened tests. It has no edit tools, but `Bash` is not restricted, so "does not edit" is an instruction, not a guarantee. |
| Alert hooks | automatic | Sound or voice alert on `Stop`, permission prompts, questions, and (optionally) idle. See [Alerts](#alerts-when-claude-finishes-or-needs-you). |
| Templates | `plugins/starterkit/templates/` | Global and per-project CLAUDE.md skeletons and an optional Stop-hook example (not enabled). |

The skills are stack-agnostic. They detect your build tool, test framework and conventions from the repository.

## Install

### As a plugin (recommended)

```bash
claude plugin marketplace add stefanochieli/claude-starterkit
claude plugin install starterkit@claude-starterkit
```

Inside a session you can also run `/plugin marketplace add stefanochieli/claude-starterkit` and then open `/plugin` to install it. Choose the **user** scope to have it in every project, or **project** scope to share it with your team through `.claude/settings.json`.

Try it without installing, from a local clone:

```bash
git clone https://github.com/stefanochieli/claude-starterkit
claude --plugin-dir ./claude-starterkit/plugins/starterkit
```

### Global working rules (optional)

Plugins cannot ship a CLAUDE.md, so a short block of global rules is installed by a script. It backs up your existing `~/.claude/CLAUDE.md`, and replaces its own block on re-run instead of duplicating it.

```bash
# macOS / Linux / WSL / Git Bash
./scripts/install-global.sh
./scripts/install-global.sh --remove     # undo
```

```powershell
# Windows PowerShell
./scripts/install-global.ps1
./scripts/install-global.ps1 -Remove     # undo
```

Set `CLAUDE_CONFIG_DIR` if your Claude config is not in `~/.claude`.

## Alerts when Claude finishes or needs you

The plugin registers hooks that run `scripts/notify.js`. They are asynchronous, so they never slow Claude down.

| Alert | Fires when | Default |
|---|---|---|
| `done` | Claude finishes its turn (`Stop`). This also covers a turn that ends with a plain-text question. | on |
| `permission` | Claude waits for you to approve a tool use. Claude Code raises this after the prompt has waited about six seconds. | on |
| `question` | Claude asks you a multiple-choice question (`AskUserQuestion`, immediate), or an MCP server opens a form or URL dialog. | on |
| `idle` | About 60 seconds after Claude finished and you have not typed. A reminder after `done`. | off |

By default the alert is a short sound, with a different pattern for "finished" and "needs you". Switch to a spoken message with one setting.

### Configure

Set variables in the `env` block of `~/.claude/settings.json` (or export them in your shell):

```json
{
  "env": {
    "STARTERKIT_NOTIFY": "voice",
    "STARTERKIT_NOTIFY_LANG": "it"
  }
}
```

| Variable | Values | Default |
|---|---|---|
| `STARTERKIT_NOTIFY` | `sound`, `voice`, `both`, `off` | `sound` |
| `STARTERKIT_NOTIFY_EVENTS` | comma list of `done,permission,question,idle` | `done,permission,question` |
| `STARTERKIT_NOTIFY_LANG` | `en`, `it` | system locale, else `en` |
| `STARTERKIT_NOTIFY_VOICE` | an installed voice name (for example `Microsoft Elsa Desktop - Italian (Italy)`) | automatic |
| `STARTERKIT_NOTIFY_PROJECT` | `1` to also say the project folder name | off |
| `STARTERKIT_NOTIFY_DRYRUN` | `1` to print what would run instead of playing it | off |

Spoken messages exist in English and Italian (`MESSAGES` at the top of `notify.js`; adding a language is a few lines). If the system has no voice for the chosen language, the English text is spoken instead.

### Requirements

- **Node.js on your PATH** (CI tests Node 20). The hooks run `node`.
- **Windows:** nothing else. Sounds and speech use the built-in `powershell.exe`, with console beeps (independent of your sound scheme) and `System.Speech`.
- **macOS:** nothing else (`afplay`, `say`).
- **Linux:** a sound player (`canberra-gtk-play`, `paplay` or `pw-play`) and, for voice, `spd-say`, `espeak-ng` or `espeak`. With none of them it tries the terminal bell (`/dev/tty`), which may not sound if the hook has no terminal. macOS and Windows have no bell fallback.
- **WSL:** uses the Windows `powershell.exe` through interop, and falls back to the Linux tools.
- Hooks run where Claude Code runs. In a remote or cloud session nothing plays on your own computer.

### Check that it works

```bash
node plugins/starterkit/scripts/notify.js done                          # sound
STARTERKIT_NOTIFY=voice node plugins/starterkit/scripts/notify.js done    # voice
```

```powershell
$env:STARTERKIT_NOTIFY='voice'; node plugins/starterkit/scripts/notify.js done
```

For an installed plugin the script is under `~/.claude/plugins/cache/claude-starterkit/starterkit/<version>/scripts/`. Add `STARTERKIT_NOTIFY_DRYRUN=1` to see the exact command without playing anything. If a value in the `env` block seems to be ignored, set it in your shell profile instead. Alerts of the same kind within four seconds are collapsed into one.

### Turn it off

Set `STARTERKIT_NOTIFY` to `off`, or disable the plugin with `/plugin` or `claude plugin disable starterkit`.

## Suggested workflow

1. In a repo, run `/starterkit:setup-project`, review the proposal, and remove anything excessive before approving.
2. For a complex task, run `/starterkit:deeper <task>`, correct the rewritten task, then approve.
3. Define "done" as a check the agent can run (for example an E2E test), and tell it not to modify that test.
4. When Claude makes a repeatable mistake, ask it to add one line to the project's CLAUDE.md.
5. Every ~30 days, run `/starterkit:audit-config`; apply only the changes you choose.

### Companion mod: effort-guard

[effort-guard](https://github.com/stefanochieli/claude-effort-guard) watches the session while you work: a band with context, cost and rate limit, a toast after repeated failing turns, a one-command rerun of only the failing tests (Maven, Gradle, Jest, Vitest, Angular, pytest) and hints that keep the failing command through `/compact`. `setup-project` recommends it when it is not installed.

```
claude plugin marketplace add stefanochieli/claude-effort-guard
claude plugin install effort-guard@effort-guard --scope user
```

## Notes and limits

- A plugin runs with your privileges. Read the files before installing; they are short and plain Markdown, JSON, JavaScript and shell.
- `audit-config` depends on the usage data your Claude Code version exposes. If it cannot get a data point it says so instead of estimating.
- The `verifier` agent covers what you defined as checks. Where you have no checks, nothing is verified.
- Skills are manual-only (`disable-model-invocation: true`) on purpose. Remove that line from a skill if you want Claude to invoke it by itself, which raises the always-on cost.
- Check the footprint any time with `claude plugin details starterkit`.
- The Windows branch of `notify.js` is covered by tests of the generated PowerShell (quoting, structure), and CI parses every variant with the real PowerShell parser on a Windows runner. Nothing automated can judge how it sounds, so please report anything that misbehaves on real hardware.

## Development

```bash
node --test                           # tests for the alert script and the repo layout
claude plugin validate .              # marketplace manifest
claude plugin validate plugins/starterkit
```

CI (`.github/workflows/checks.yml`) runs the tests on Linux, macOS and Windows, validates the manifests, and reports one summary job named `checks`. `.github/rulesets/protect-main.json` is an importable GitHub ruleset for `main`: pull request required, `checks` must pass, repository admins can bypass. A test keeps the ruleset and the workflow in agreement.

## Uninstall

```bash
claude plugin uninstall starterkit@claude-starterkit
claude plugin marketplace remove claude-starterkit
./scripts/install-global.sh --remove
```

## In italiano (sintesi)

Kit minimale per Claude Code: poco contesto (le skill si caricano solo se le richiami), prove eseguibili invece di revisione dei diff, pulizia periodica della configurazione e avvisi sonori o vocali quando Claude ha finito o ha bisogno di te.

- Installazione: `claude plugin marketplace add stefanochieli/claude-starterkit`, poi `claude plugin install starterkit@claude-starterkit`.
- Mod consigliata: [effort-guard](https://github.com/stefanochieli/claude-effort-guard) (banda con contesto, costo e rate limit, avviso dopo turni falliti, rilancio dei soli test falliti); `setup-project` la propone se manca.
- Comandi: `/starterkit:deeper`, `/starterkit:setup-project`, `/starterkit:audit-config`.
- Avvisi: per default un suono breve (diverso tra "ho finito" e "mi serve qualcosa"). Per la voce in italiano aggiungi a `~/.claude/settings.json`: `"env": { "STARTERKIT_NOTIFY": "voice", "STARTERKIT_NOTIFY_LANG": "it" }`. Serve Node.js nel PATH.
- Le regole globali opzionali si installano con `scripts/install-global.sh` (o `.ps1` su Windows), con backup automatico.

## License

MIT
