# Test record — 3 October 2026

Ran the **local checker**, not any app's code. Downloaded only public `Gemfile.lock` text via HTTPS at immutable Git revisions; did not install gems, fetch dependencies, deploy, or contact a Heroku app. Node.js in the test environment was available; `node --check check.js` passed. All three public lockfile checks exited **0**. A clean static report is not a successful stack migration.

Reproduce (in this draft directory):

```sh
mkdir -p /tmp/heroku22-mastodon /tmp/heroku22-discourse
curl -fsSL -o /tmp/heroku22-mastodon/Gemfile.lock https://raw.githubusercontent.com/mastodon/mastodon/79f21a20736ba85a0b59c976cddbf88e880b28c9/Gemfile.lock
curl -fsSL -o /tmp/heroku22-discourse/Gemfile.lock https://raw.githubusercontent.com/discourse/discourse/67bc74d0d83f8037ec538c1299b8d8cb59211319/Gemfile.lock
sha256sum /tmp/heroku22-{mastodon,discourse}/Gemfile.lock
node --check check.js
node check.js /tmp/heroku22-mastodon
node check.js /tmp/heroku22-discourse
```

SHA-256 of downloaded files: Mastodon `6317d6089341aad2a8a9dc3aeb6325b3a4aa4501d4127f33a4dba76b3b94eceb`; Discourse `5d496ef71e608d592884bd73eab5742445963b136d08d1704c0325407e121348`.

## Mastodon (`mastodon/mastodon`, commit `79f21a2`)

```text
Heroku-22 → heroku-24 local preflight (rules checked 2026-10-03)
Reads local files only; does not contact Heroku or change any app.
Files: Gemfile.lock found; .ruby-version absent; package.json absent; Procfile absent; app.json absent

Found in this code copy:
- Gemfile.lock RUBY VERSION: ruby 4.0.7
- Ruby 4.0.7 was on Heroku's supported MRI patch list on 2026-10-03 [R].
- Gemfile.lock BUNDLED WITH: 4.0.22 (Heroku normally installs the locked Bundler version) [R].
- Gemfile.lock rails gem: 8.1.4 (not a Rails/Ruby compatibility verdict) [L].

Review before a stack move:
- No listed static flags; this does not mean the app will build or run.

Always verify with the app owner/developer [S, H, B, P]:
- Confirm the live stack/release with `heroku stack -a APP` and `heroku releases -a APP`; this directory may not be the deployed revision.
- Check live buildpacks with `heroku buildpacks -a APP`; app.json does not update an existing app. Inspect OS/native gems, Aptfile, packages, locales, time zones and external binaries by testing on a separate heroku-24 app.
- Test key pages, jobs, integrations and rollback; a build alone cannot establish runtime compatibility.
Sources: keys [R, U, N, L, S, H, B, P] and URLs in README.md.
```

## Discourse (`discourse/discourse`, commit `67bc74d`)

```text
Heroku-22 → heroku-24 local preflight (rules checked 2026-10-03)
Reads local files only; does not contact Heroku or change any app.
Files: Gemfile.lock found; .ruby-version absent; package.json absent; Procfile absent; app.json absent

Found in this code copy:
- Gemfile.lock RUBY VERSION: ruby 3.4.7p58
- Gemfile.lock BUNDLED WITH: 4.0.11 (Heroku normally installs the locked Bundler version) [R].
- Gemfile.lock railties component: 8.1.4 (not proof of a rails meta-gem or compatibility) [L].

Review before a stack move:
- Ruby 3.4.7 is listed as available on heroku-24 but not supported by Heroku. Plan a supported patch/version separately from the stack move. [R]

Always verify with the app owner/developer [S, H, B, P]:
- Confirm the live stack/release with `heroku stack -a APP` and `heroku releases -a APP`; this directory may not be the deployed revision.
- Check live buildpacks with `heroku buildpacks -a APP`; app.json does not update an existing app. Inspect OS/native gems, Aptfile, packages, locales, time zones and external binaries by testing on a separate heroku-24 app.
- Test key pages, jobs, integrations and rollback; a build alone cannot establish runtime compatibility.
Sources: keys [R, U, N, L, S, H, B, P] and URLs in README.md.
```

Discourse uses Rails components but its lockfile has no `rails` meta-gem; the checker reports `railties` rather than falsely claiming it isn't a Rails app. The downloaded directories contain **only** a lockfile, so the absence of `package.json`, `Procfile`, `app.json` and `.ruby-version` in these outputs says nothing about the actual app repositories or deployments. None of the projects' live stacks was checked.

## Independent third check: Tracks (`TracksApp/tracks`, commit `8dcca98c6c48404d8328bbee220a8b19d48799ce`)

Quality fetched the public lockfile at this immutable commit on **3 October 2026**; Commercial did not test this revision. SHA-256: `5e13e0a489e75c34de1cd327b592ecd00f8dc5c23af6b21697b424381e16c69a`. Run the checker against that file alone; it does not run Tracks:

```sh
mkdir -p /tmp/heroku22-tracks
curl -fsSL -o /tmp/heroku22-tracks/Gemfile.lock https://raw.githubusercontent.com/TracksApp/tracks/8dcca98c6c48404d8328bbee220a8b19d48799ce/Gemfile.lock
node check.js /tmp/heroku22-tracks
```

Exit **0**; it reported Bundler `2.4.19`, Rails `7.2.3.2` and **no `RUBY VERSION` section**, correctly warning that it cannot identify the release's Ruby version. SHA-256 before and after the check matched. Only `Gemfile.lock` was downloaded; the missing other files say nothing about the Tracks repository or any Heroku deployment. A symlinked lockfile was rejected with exit **2** and no content printed.

## Controlled edge cases

A local, synthetic fixture (no external code) with Ruby `3.1.7p222`, no `BUNDLED WITH`, Node `20.x`, `app.json` stack `heroku-22`, old Chrome/Redis buildpacks (one pinned), a `US/Eastern` TZ, and `Procfile` `release`, Git and Python references produced **11 review items** and no commands were executed. An invalid `package.json` produced `Cannot inspect: package.json is not valid JSON; not inspected` and exit **2**. These exercise static detections, not a real deploy. Only the three immutable public lockfile outputs above are evidence of real-world parsing.
