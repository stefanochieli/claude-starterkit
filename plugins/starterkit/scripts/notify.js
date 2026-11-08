#!/usr/bin/env node
'use strict';
/*
 * starterkit notify: voice or sound alerts for Claude Code hooks.
 *
 * Usage:  node notify.js <done|permission|question|idle>
 *
 * Claude Code runs this from hooks/hooks.json. It reads the hook JSON from stdin
 * (only to find the project folder name) and always exits 0, so it can never
 * block or break a session.
 *
 * Configuration, all optional. Set them in the "env" block of ~/.claude/settings.json:
 *   STARTERKIT_NOTIFY          sound | voice | both | off        (default: sound)
 *   STARTERKIT_NOTIFY_EVENTS   comma list of done,permission,question,idle
 *                            (default: done,permission,question)
 *   STARTERKIT_NOTIFY_LANG     en | it   (default: system locale, else en)
 *   STARTERKIT_NOTIFY_VOICE    voice name to use instead of the automatic choice
 *   STARTERKIT_NOTIFY_PROJECT  1 = also say the project folder name
 *   STARTERKIT_NOTIFY_DRYRUN   1 = print what would run as JSON lines, play nothing
 *   STARTERKIT_NOTIFY_PLATFORM win32 | darwin | linux | wsl  (testing override)
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const env = process.env;
const DRY = env.STARTERKIT_NOTIFY_DRYRUN === '1';
const KINDS = ['done', 'permission', 'question', 'idle'];
const DEBOUNCE_MS = 4000;

const MESSAGES = {
  en: {
    done: 'Claude is done',
    permission: 'Claude needs your permission',
    question: 'Claude has a question',
    idle: 'Claude is waiting for you',
    project: 'project',
  },
  it: {
    done: 'Claude ha finito',
    permission: 'Claude ha bisogno del tuo permesso',
    question: 'Claude ha una domanda',
    idle: 'Claude ti sta aspettando',
    project: 'progetto',
  },
};

// Windows beeps as [frequency Hz, duration ms]. Console beeps do not depend on the
// user's sound scheme, so they still play when "No Sounds" is selected.
const BEEPS = {
  done: [[784, 120], [1047, 200]],
  permission: [[880, 140], [880, 140], [1175, 220]],
  question: [[880, 140], [880, 140], [1175, 220]],
  idle: [[660, 200]],
};
const MAC_SOUNDS = { done: 'Glass', permission: 'Ping', question: 'Ping', idle: 'Pop' };
const LINUX_SOUND_DIR = '/usr/share/sounds/freedesktop/stereo/';
const LINUX_SOUNDS = {
  done: { id: 'complete', file: 'complete.oga' },
  permission: { id: 'dialog-warning', file: 'dialog-warning.oga' },
  question: { id: 'message', file: 'message.oga' },
  idle: { id: 'bell', file: 'bell.oga' },
};

// ---------------------------------------------------------------- helpers

function exec(cmd, args, note) {
  if (DRY) {
    process.stdout.write(JSON.stringify(Object.assign({ cmd, args }, note)) + '\n');
    return true;
  }
  const r = spawnSync(cmd, args, { stdio: 'ignore', timeout: 15000, windowsHide: true });
  return !r.error && r.status === 0;
}

function detectPlatform() {
  if (env.STARTERKIT_NOTIFY_PLATFORM) return env.STARTERKIT_NOTIFY_PLATFORM;
  if (process.platform === 'linux') {
    let v = '';
    try { v = fs.readFileSync('/proc/version', 'utf8'); } catch (e) { /* not linux-like */ }
    if (env.WSL_DISTRO_NAME || /microsoft/i.test(v)) return 'wsl';
  }
  return process.platform;
}

function detectLang() {
  const forced = (env.STARTERKIT_NOTIFY_LANG || '').toLowerCase().slice(0, 2);
  if (MESSAGES[forced]) return forced;
  const fromEnv = [env.LC_ALL, env.LC_MESSAGES, env.LANG].find((v) => v && !/^(C|POSIX)(\.|$)/i.test(v));
  let loc = fromEnv || '';
  if (!loc) {
    try { loc = Intl.DateTimeFormat().resolvedOptions().locale || ''; } catch (e) { /* ignore */ }
  }
  return /^it/i.test(loc) ? 'it' : 'en';
}

function cleanName(s) {
  return String(s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
}

function projectName(raw) {
  try {
    const cwd = JSON.parse(raw).cwd;
    if (typeof cwd !== 'string') return '';
    return cleanName(cwd.split(/[\\/]/).filter(Boolean).pop() || '');
  } catch (e) {
    return '';
  }
}

function readStdin(cb) {
  if (process.stdin.isTTY) return cb('');
  let data = '';
  let finished = false;
  const finish = () => { if (!finished) { finished = true; clearTimeout(timer); cb(data); } };
  const timer = setTimeout(finish, 400);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { data += c; });
  process.stdin.on('end', finish);
  process.stdin.on('error', finish);
  process.stdin.resume();
}

// Skip an alert if the same group fired a moment ago (a question can raise both a
// PreToolUse hook and a Notification).
// The stamp lives in a private per-user folder: /tmp is shared on Linux, and a
// predictable file name there could be pre-created as a symlink by another user.
function stampDir() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  if (env.XDG_RUNTIME_DIR) return env.XDG_RUNTIME_DIR;
  if (uid === null) return os.tmpdir(); // Windows: the temp folder is already per user
  const dir = path.join(os.tmpdir(), 'starterkit-' + uid);
  try { fs.mkdirSync(dir, { mode: 0o700 }); } catch (e) { /* exists, checked below */ }
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.uid !== uid) throw new Error('unsafe stamp dir');
  return dir;
}

function debounced(kind) {
  if (DRY) return false;
  const group = kind === 'permission' || kind === 'question' ? 'input' : kind;
  let stamp;
  try { stamp = path.join(stampDir(), 'starterkit-notify-' + group + '.stamp'); } catch (e) { return false; }
  try {
    if (Date.now() - fs.statSync(stamp).mtimeMs < DEBOUNCE_MS) return true;
  } catch (e) { /* no previous stamp */ }
  try {
    const fd = fs.openSync(stamp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW || 0), 0o600);
    fs.writeSync(fd, String(Date.now()));
    fs.closeSync(fd);
  } catch (e) { /* best effort */ }
  return false;
}

// ---------------------------------------------------------------- Windows / WSL

// A PowerShell single-quoted literal. All four typographic quotes end a string in
// PowerShell, so every one of them is doubled.
function psq(s) {
  return "'" + String(s).replace(/['‘’‚‛]/g, "''") + "'";
}

function windowsScript(o) {
  const beep =
    'foreach($x in (' + psq(o.beeps) + " -split ';')){$a=$x -split ',';[Console]::Beep([int]$a[0],[int]$a[1])}";
  const voiceSelect = o.voice
    ? 'try{$s.SelectVoice(' + psq(o.voice) + ')}catch{}'
    : '$v=$s.GetInstalledVoices()|Where-Object{$_.Enabled -and $_.VoiceInfo.Culture.Name -like ' +
      psq(o.culture + '*') +
      '}|Select-Object -First 1;if($v){$s.SelectVoice($v.VoiceInfo.Name)}else{$t=' +
      psq(o.fallbackText) +
      '}';
  const speak = [
    'Add-Type -AssemblyName System.Speech',
    '$s=New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$t=' + psq(o.text),
    voiceSelect,
    '$s.Speak($t)',
  ].join(';');

  const parts = ["$ErrorActionPreference='Stop'"];
  if (o.sound) parts.push(beep);
  // Voice only: if speech is unavailable, fall back to the beeps.
  if (o.voiceOn) parts.push('try{' + speak + '}catch{' + (o.sound ? '' : beep) + '}');
  return parts.join(';');
}

function alertWindows(o) {
  const script = windowsScript(o);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return exec(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    DRY ? { script } : undefined
  );
}

// ---------------------------------------------------------------- macOS

function alertMac(o) {
  let ok = false;
  if (o.sound) ok = exec('afplay', ['/System/Library/Sounds/' + MAC_SOUNDS[o.kind] + '.aiff']) || ok;
  if (o.voiceOn) {
    const voice = o.voice || (o.lang === 'it' ? 'Alice' : '');
    // "--" so a project folder name that starts with "-" is never read as an option.
    let spoke = voice ? exec('say', ['-v', voice, '--', o.text]) : exec('say', ['--', o.text]);
    // Requested voice not installed: speak the English text with the default voice.
    if (!spoke && voice && !o.voice) spoke = exec('say', ['--', o.fallbackText]);
    if (!spoke && !o.sound) spoke = exec('afplay', ['/System/Library/Sounds/' + MAC_SOUNDS[o.kind] + '.aiff']);
    ok = spoke || ok;
  }
  return ok;
}

// ---------------------------------------------------------------- Linux

function bell() {
  if (DRY) { process.stdout.write(JSON.stringify({ bell: '/dev/tty' }) + '\n'); return true; }
  try { fs.writeFileSync('/dev/tty', '\x07'); return true; } catch (e) { return false; }
}

function linuxSound(kind) {
  const ev = LINUX_SOUNDS[kind];
  const file = LINUX_SOUND_DIR + ev.file;
  if (exec('canberra-gtk-play', ['-i', ev.id])) return true;
  if (fs.existsSync(file)) {
    if (exec('paplay', [file])) return true;
    if (exec('pw-play', [file])) return true;
  }
  return bell();
}

function linuxSpeak(o) {
  const spd = ['-w', '-l', o.lang].concat(o.voice ? ['-y', o.voice] : [], ['--', o.text]);
  const voice = o.voice || o.lang;
  return (
    exec('spd-say', spd) ||
    exec('espeak-ng', ['-v', voice, '--', o.text]) ||
    exec('espeak', ['-v', voice, '--', o.text])
  );
}

function alertLinux(o) {
  let ok = false;
  if (o.sound) ok = linuxSound(o.kind) || ok;
  if (o.voiceOn) {
    const spoke = linuxSpeak(o);
    ok = spoke || ok;
    if (!spoke && !o.sound) ok = linuxSound(o.kind) || ok;
  }
  return ok;
}

// ---------------------------------------------------------------- main

function main(raw) {
  const kind = (process.argv[2] || '').toLowerCase();
  if (!KINDS.includes(kind)) return;

  let mode = (env.STARTERKIT_NOTIFY || 'sound').trim().toLowerCase();
  if (['off', '0', 'false', 'no', 'none'].includes(mode)) return;
  if (!['sound', 'voice', 'both'].includes(mode)) mode = 'sound';

  const events = (env.STARTERKIT_NOTIFY_EVENTS || 'done,permission,question')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!events.includes(kind)) return;

  if (debounced(kind)) return;

  const lang = detectLang();
  let text = MESSAGES[lang][kind];
  let fallbackText = MESSAGES.en[kind];
  if (env.STARTERKIT_NOTIFY_PROJECT === '1') {
    const name = projectName(raw);
    if (name) {
      text += ', ' + MESSAGES[lang].project + ' ' + name;
      fallbackText += ', project ' + name;
    }
  }

  const o = {
    kind,
    lang,
    text,
    fallbackText,
    culture: lang,
    voice: cleanName(env.STARTERKIT_NOTIFY_VOICE || ''),
    sound: mode === 'sound' || mode === 'both',
    voiceOn: mode === 'voice' || mode === 'both',
    beeps: BEEPS[kind].map((b) => b.join(',')).join(';'),
  };

  const plat = detectPlatform();
  if (plat === 'win32') { alertWindows(o); return; }
  if (plat === 'wsl' && alertWindows(o)) return;
  if (plat === 'darwin') { alertMac(o); return; }
  alertLinux(o);
}

readStdin((raw) => {
  try { main(raw); } catch (e) { /* an alert must never break a session */ }
  process.exit(0);
});
