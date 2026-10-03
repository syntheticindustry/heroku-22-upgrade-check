#!/usr/bin/env node
'use strict';

// A read-only preflight. Source keys point to the official links in README.md.
// The Ruby patch list is a snapshot, checked 2026-10-03, not a live API.
const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_RUBY = new Set(['3.3.12', '3.4.11', '4.0.7']); // [R]
const OLDER_AVAILABLE_RUBY = { '3.1': 7, '3.2': 11, '3.3': 11, '3.4': 10, '4.0': 6 }; // [R]
const findings = [];
const facts = [];

function read(name, maxBytes = 5 * 1024 * 1024) {
  const file = path.join(root, name);
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!stat.isFile()) throw new Error(`${name} is not a regular file (symlinks are not inspected)`);
  const noFollow = fs.constants.O_NOFOLLOW || 0; // lstat still rejects links on platforms without O_NOFOLLOW.
  let fd;
  try { fd = fs.openSync(file, fs.constants.O_RDONLY | noFollow | fs.constants.O_NONBLOCK); }
  catch (error) {
    if (error.code === 'ELOOP') throw new Error(`${name} is a symbolic link; not inspected`);
    throw error;
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error(`${name} is not a regular file; not inspected`);
    if (stat.size > maxBytes) throw new Error(`${name} is over ${maxBytes} bytes; not inspected`);
    return fs.readFileSync(fd, 'utf8');
  } finally { fs.closeSync(fd); }
}
function json(name) {
  const text = read(name, 512 * 1024);
  if (text === null) return null;
  try { return JSON.parse(text); }
  catch { throw new Error(`${name} is not valid JSON; not inspected`); }
}
function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === heading && line === heading);
  if (start === -1) return null;
  const data = [];
  for (let i = start + 1; i < lines.length && (lines[i].startsWith(' ') || !lines[i]); i++) {
    if (lines[i].trim()) data.push(lines[i].trim());
  }
  return data;
}
function note(text, source) { findings.push(`- ${text} [${source}]`); }
function fact(text) { facts.push(`- ${text}`); }
// Local text is untrusted: never send its control characters to the terminal.
function safeText(text) {
  const chars = Array.from(text);
  return chars.slice(0, 120).join('').replace(/\p{C}/gu, c => `\\u{${c.codePointAt(0).toString(16)}}`) + (chars.length > 120 ? '…' : '');
}
function rubyStatus(version, engine) {
  if (engine) {
    note(`JRuby detected (${safeText(engine)}); the MRI patch table does not assess it. Check Heroku's JRuby list.`, 'R');
    return;
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    note('Ruby version is not an exact MRI patch; compare it with Heroku Ruby support manually.', 'R');
    return;
  }
  if (SUPPORTED_RUBY.has(version)) {
    fact(`Ruby ${version} was on Heroku's supported MRI patch list on 2026-10-03 [R].`);
    return;
  }
  const [major, minor, patch] = version.split('.').map(Number);
  const series = `${major}.${minor}`;
  if (Object.hasOwn(OLDER_AVAILABLE_RUBY, series) && patch <= OLDER_AVAILABLE_RUBY[series]) {
    const eol = series === '3.1' || series === '3.2';
    note(`Ruby ${version} is listed as available on heroku-24 but not supported by Heroku. ${eol ? 'Ruby Core has ended support for this series. ' : ''}Plan a supported patch/version separately from the stack move.`, eol ? 'R, U' : 'R');
  } else {
    note(`Ruby ${version} was not on the heroku-24 MRI list checked 2026-10-03. Check the current list; this is not proof the build will fail.`, 'R');
  }
}

let root;
function main() {
  if (process.argv.length > 3 || process.argv[2] === '--help' || process.argv[2] === '-h') {
    console.log('Usage: node check.js [path-to-app-directory]');
    process.exitCode = process.argv.length > 3 ? 2 : 0;
    return;
  }
  root = path.resolve(process.argv[2] || '.');
  if (!fs.statSync(root).isDirectory()) throw new Error('argument must be an app directory');
  const lock = read('Gemfile.lock');
  const rubyFile = read('.ruby-version', 1024);
  const pkg = json('package.json');
  const app = json('app.json');
  const procfile = read('Procfile', 512 * 1024);

  console.log('Heroku-22 → heroku-24 local preflight (rules checked 2026-10-03)');
  console.log('Reads local files only; does not contact Heroku or change any app.');
  console.log(`Files: ${['Gemfile.lock', '.ruby-version', 'package.json', 'Procfile', 'app.json'].map(n => `${n} ${fs.existsSync(path.join(root, n)) ? 'found' : 'absent'}`).join('; ')}`);

  if (lock === null) {
    note('No Gemfile.lock: cannot identify the deployed Ruby, Bundler or Rails version from this copy.', 'R');
  } else {
    const rubyLines = section(lock, 'RUBY VERSION');
    const rubyEntry = rubyLines && rubyLines[0];
    if (rubyEntry) {
      const version = rubyEntry.match(/^ruby\s+(\d+\.\d+\.\d+)(?:p\d+)?/);
      fact(`Gemfile.lock RUBY VERSION: ${safeText(rubyEntry)}`);
      if (version) rubyStatus(version[1], /\(jruby\s+([^)]+)\)/.exec(rubyEntry)?.[1]);
      else note('Cannot classify this lockfile Ruby implementation/version against the MRI list.', 'R');
    } else {
      note('Gemfile.lock has no RUBY VERSION. Heroku may use a default or a previously selected version; check the deployed release and pin Ruby in Gemfile/lockfile.', 'R');
    }
    const bundler = section(lock, 'BUNDLED WITH')?.[0];
    if (bundler) fact(`Gemfile.lock BUNDLED WITH: ${safeText(bundler)} (Heroku normally installs the locked Bundler version) [R].`);
    else note('Gemfile.lock has no BUNDLED WITH: Bundler selection depends on the builder and Ruby; lock it rather than assuming a version.', 'R');
    const rails = lock.match(/^    rails \(([^\n)]+)\)/m)?.[1];
    const railties = lock.match(/^    railties \(([^\n)]+)\)/m)?.[1];
    if (rails) fact(`Gemfile.lock rails gem: ${safeText(rails)} (not a Rails/Ruby compatibility verdict) [L].`);
    else if (railties) fact(`Gemfile.lock railties component: ${safeText(railties)} (not proof of a rails meta-gem or compatibility) [L].`);
    else fact('No rails gem or railties component version found in Gemfile.lock.');
  }
  if (rubyFile !== null) {
    const candidate = rubyFile.trim();
    if (candidate && /^\S{1,60}$/.test(candidate)) fact(`.ruby-version: ${safeText(candidate)} (local hint, not proof of the live release) [R].`);
    else note('.ruby-version is empty or unexpected; inspect manually, without assuming Heroku used it.', 'R');
  }
  if (pkg !== null) {
    const engines = pkg && typeof pkg === 'object' && !Array.isArray(pkg) && pkg.engines;
    const node = engines && typeof engines === 'object' && !Array.isArray(engines) && engines.node;
    if (typeof node === 'string') {
      fact(`package.json engines.node: ${safeText(JSON.stringify(node))} [N].`);
      const simple = node.trim().match(/^v?(\d+)(?:\.(?:x|\*|\d+)){0,2}$/i);
      if (simple && ![22, 24, 26].includes(Number(simple[1]))) note(`Node ${simple[1]} is outside Heroku's currently supported Node major versions (22, 24, 26). Older versions may still install; check the buildpack and plan a supported version.`, 'N');
      else if (!simple) note('Node engine is a range or unrecognised format: check what the live build resolves to; this check does not resolve semver.', 'N');
    } else {
      note('package.json has no string engines.node: the Heroku Node.js buildpack defaults to Node 24.x if used. Pin and test a version instead of assuming the existing app uses that default.', 'N');
    }
  }
  if (app !== null) {
    if (app && typeof app === 'object' && !Array.isArray(app)) {
      if (typeof app.stack === 'string') {
        fact(`app.json stack for *new* review/CI/Button apps: ${safeText(JSON.stringify(app.stack))} [S].`);
        if (app.stack === 'heroku-22') note('app.json still requests heroku-22 for new apps; set an appropriate newer stack in the test branch.', 'S');
      }
      const buildpacks = Array.isArray(app.buildpacks) ? app.buildpacks : [];
      for (const item of buildpacks) {
        const url = typeof item === 'string' ? item : item && typeof item.url === 'string' ? item.url : '';
        if (/heroku-buildpack-google-chrome/i.test(url)) note('app.json lists the old Google Chrome buildpack, incompatible with heroku-24; review Chrome for Testing migration and check the live buildpacks.', 'H, B');
        if (/heroku-buildpack-redis/i.test(url)) note('app.json lists the old Redis buildpack, incompatible with heroku-24; review native Redis TLS and check the live buildpacks.', 'H, B');
        if (url.includes('#')) note('app.json lists a buildpack pinned to a ref; review compatibility fixes before changing the pin.', 'S, B');
      }
      const tz = app.env && typeof app.env === 'object' && app.env.TZ;
      const tzValue = typeof tz === 'string' ? tz : tz && typeof tz.value === 'string' ? tz.value : null;
      if (tzValue?.startsWith('US/')) note('app.json proposes a legacy US/* time zone. heroku-24 removed those zone names; use an equivalent Area/City zone and check Ruby tzinfo-data guidance.', 'H');
    } else note('app.json does not contain a JSON object; no app settings inspected.', 'S');
  }
  if (procfile !== null) {
    const processes = procfile.split(/\r?\n/).map(line => line.match(/^([\w-]+):\s*(.*)$/)).filter(Boolean);
    if (processes.some(p => p[1] === 'release')) note('Procfile has a release process; it reruns on rollback. Review migrations/external side effects before relying on rollback.', 'P');
    for (const p of processes) {
      if (/\bgit\b/.test(p[2])) note(`Procfile process ${JSON.stringify(p[1])} mentions git; Git is build-time only on heroku-24. Check whether this runs at runtime.`, 'H');
      if (/\b(?:python|python3)\b/.test(p[2])) note(`Procfile process ${JSON.stringify(p[1])} mentions Python; system Python is build-time only on heroku-24. A Python buildpack may supply it at runtime.`, 'H');
    }
  }

  console.log('\nFound in this code copy:');
  console.log(facts.length ? facts.join('\n') : '- No version facts found.');
  console.log('\nReview before a stack move:');
  console.log(findings.length ? findings.join('\n') : '- No listed static flags; this does not mean the app will build or run.');
  console.log('\nAlways verify with the app owner/developer [S, H, B, P]:');
  console.log('- Confirm the live stack/release with `heroku stack -a APP` and `heroku releases -a APP`; this directory may not be the deployed revision.');
  console.log('- Check live buildpacks with `heroku buildpacks -a APP`; app.json does not update an existing app. Inspect OS/native gems, Aptfile, packages, locales, time zones and external binaries by testing on a separate heroku-24 app.');
  console.log('- Test key pages, jobs, integrations and rollback; a build alone cannot establish runtime compatibility.');
  console.log('Sources: keys [R, U, N, L, S, H, B, P] and URLs in README.md.');
}

try { main(); } catch (error) {
  console.error(`Cannot inspect: ${safeText(String(error.message))}`);
  process.exitCode = 2;
}
