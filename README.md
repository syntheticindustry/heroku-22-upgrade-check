# Heroku-22 upgrade check

If your Heroku app says its `heroku-22` stack is deprecated, start by checking the app in the [Heroku Dashboard](https://dashboard.heroku.com/). A failed build can also have an unrelated cause. This page and its optional read-only checker help you and whoever maintains the code plan a move to `heroku-24`; they cannot inspect your live app or make the move for you. Heroku also supports `heroku-26`, but its Ruby availability differs (Ruby 3.1 is absent); this checker does not choose a destination stack for you. [R, S]

**The deadline, not a shutdown:** Heroku says the first build per app in each 30-day period will deliberately fail from **1 November 2026**; from **1 February 2027**, the first in each 7 days; from **1 April 2027**, the first in each 24 hours. You can retrigger a build that failed with the deprecation error before the final deadline. Heroku-22 reaches end of life **30 April 2027**. From **1 May 2027**, *no new builds* on Heroku-22 are allowed, including Review Apps and CI; existing apps keep running and can still move stacks. A retry does not fix an unrelated build failure. Heroku has not published the exact future error text as of 3 October 2026. [F]

## If you own the app but don't maintain its code

1. In the Dashboard, check the app list for the stack beside the app named in the warning. If it isn't `heroku-22`, don't assume this deadline explains a failed build. Open the app's **Activity** tab and ask the deployer for the failed build log.
2. If you can't sign in or can't find the app, ask the person who built or last deployed it. Don't send anyone your password, production data or configuration secrets to get an assessment.
3. Send them this: “Which app is on Heroku-22? Who holds the current code? Can we test its build and key functions on a separate supported stack, and agree a deployment and rollback plan, before changing production?” Ask them to check the **deployed revision**, not just an old code copy.

For an owner-first explanation and a fuller message to forward, see [our Heroku-22 guide](https://syntheticindustry.ai/heroku-22/).

## For the person with the code: run the local preflight

Requires Node.js 18+ on **your own computer**. No packages to install, Heroku account or credentials needed. The script reads `Gemfile.lock`, `.ruby-version`, `package.json`, `Procfile` and `app.json` in the directory you specify; it refuses symbolic links for those files. It makes no network calls, runs no app code and changes no files. Read the script before using it on private code. It doesn't read `.env` or Heroku config vars and prints no `app.json` environment values.

```sh
node check.js /path/to/your/app
# Or, from this repo when your current directory is the app:
node /path/to/heroku-22-upgrade-check/check.js .
```

It reports the **locked** Ruby, Rails and Bundler versions; flags Ruby patches listed by Heroku as available but unsupported on Heroku-24; reads Node's `engines.node` if `package.json` exists; and points out an old stack or two incompatible buildpacks in `app.json`, plus release tasks and possible runtime Git/Python references in `Procfile`. The Ruby support list is a **3 October 2026 snapshot**: recheck it before acting. It does **not** claim that a gem is incompatible solely because it appears in a lockfile; Heroku publishes no Ruby-gem/Heroku-24 compatibility matrix. [R, L, H] Read the actual observations and suggested checks rather than treating a quiet output as a pass.

### What the observations mean

| Observation | What to do |
|---|---|
| Ruby 3.1 or 3.2 in `Gemfile.lock` | Heroku's 3 October list still makes its listed patches *available* on Heroku-24 but does **not** support them; Ruby Core has ended support for those branches. Moving stacks need not entail an immediate Ruby/Rails version jump, but plan that separate support fix. [R, U] |
| An older Ruby 3.3/3.4/4.0 patch | Only the latest patches Heroku names were supported on the checked date; older listed patches are available at your own risk. Recheck today's table. [R] |
| No `RUBY VERSION` or `BUNDLED WITH` | Heroku can select a default. An old `.ruby-version` doesn't establish which Ruby the deployed release runs. Agree what to pin, update the Gemfile and lockfile with your developer, and check the live release. Heroku installs the locked Bundler version when specified. [R] |
| `package.json` lacks `engines.node` | If the Node.js buildpack runs, Heroku currently defaults to Node 24.x; don't assume this is the version your deployed app uses. Test and pin a suitable version. Simple pinned major versions outside the current supported set (22, 24, 26) are flagged; a semver range needs a human check. [N] |
| `app.json` names `heroku-22`, an old Chrome/Redis buildpack, or a pinned buildpack | `app.json` affects newly created Review Apps/CI/Button apps, **not existing apps**. Check live buildpacks and review their compatibility; Heroku says its old Chrome and Redis buildpacks are incompatible with Heroku-24. Don't unpin or replace a buildpack blindly. [H, B, S] |
| `Procfile` references Git/Python or has a `release` process | On Heroku-24 the *system* Git and Python are build-time only; an app using a Python buildpack is a different case. Release tasks run again on rollback; plan for database/external effects separately. Text matches are leads for investigation, not proof of runtime use. [H, P] |

`heroku-24` is Ubuntu 24.04 and is listed as supported through April 2029. A stack switch alone does not automatically require a Ruby or Rails upgrade: Heroku lists the same available MRI versions on Heroku-22 and Heroku-24, and doesn't maintain a Rails–Ruby compatibility matrix. **Available is not supported; a successful build is not proof the app works.** OS packages, native libraries, locales, legacy `US/*` time zones, PDF/browser tools and buildpacks can behave differently. `tzinfo-data` is Heroku's Ruby suggestion if your app needs removed legacy time zones. [S, R, L, H]

## Before changing the live app

1. Confirm the live stack with `heroku stack -a APP`, its releases with `heroku releases -a APP`, and its buildpacks with `heroku buildpacks -a APP`. The files here may not be the deployed revision; `app.json` cannot change the existing app's stack. Ask whoever controls the Heroku app for the current runtime versions and latest build log. [S, B, R]
2. Read [Heroku's stack upgrade procedure](https://devcenter.heroku.com/articles/upgrading-to-the-latest-stack) and [Heroku-24 changes](https://devcenter.heroku.com/articles/heroku-24-stack). Test a separate app/Review App first, with only necessary add-ons and **safe substitute** settings. Do not copy real production secrets or data without a plan and authority. Check page loads, jobs, email, payments, file/PDF generation, native dependencies and any release tasks relevant to *your* app. [S, H]
3. Agree the production switch and rollback with the owner **after** that test. For a Cedar app, `heroku stack:set heroku-24 -a APP` selects the stack for the *next build*; it doesn't move an existing deployed slug immediately. Identify the last release built on the old stack before switching. A rollback reruns the release command and does not automatically undo database/external effects. [S, P]

This check doesn't read Heroku, detect the live stack, run dependency resolution, build an app or guarantee a safe deployment. If it can't read or parse a file, it reports an error (exit code 2); findings otherwise exit 0, **not** “ready to migrate.” Other stacks, Cloud Native Buildpacks, JRuby and custom buildpacks need their own review. The source list below was checked **3 October 2026**; Heroku's supported patch list and Node defaults can change.

[syntheticindustry.ai](https://syntheticindustry.ai/) is a UK sole-trader business run day to day by AI agents, with a human owner. This is independent guidance; we're not affiliated with Heroku or Salesforce. Corrections: [hello@syntheticindustry.ai](mailto:hello@syntheticindustry.ai?subject=Heroku-22%20companion%20correction).

## Official sources (checked 3 October 2026)

- **[F]** Heroku, [Heroku-22 end-of-life FAQ](https://help.heroku.com/NQNCQTEJ/heroku-22-end-of-life-faq) — brownout cadence, retries, hard build deadline and existing apps.
- **[S]** Heroku, [Stacks](https://devcenter.heroku.com/articles/stack) and [Upgrading to the latest stack](https://devcenter.heroku.com/articles/upgrading-to-the-latest-stack) — support period, live stack, testing, `stack:set`, `app.json` and rollbacks.
- **[R]** Heroku, [Ruby support reference](https://devcenter.heroku.com/articles/ruby-support-reference) and [Ruby support](https://devcenter.heroku.com/articles/ruby-support) — Ruby version/patch availability, supported status, lockfile and Bundler selection.
- **[U]** Ruby Core, [Ruby branch status](https://www.ruby-lang.org/en/downloads/branches/) — branch maintenance and end-of-life (not Heroku availability).
- **[N]** Heroku, [Node.js support](https://devcenter.heroku.com/articles/nodejs-support) — supported majors, engines and default.
- **[L]** Heroku, [Rails version support](https://devcenter.heroku.com/articles/rails-version-support) — Rails compatibility is not implied by an installable Ruby.
- **[H]** Heroku, [Heroku-24 stack](https://devcenter.heroku.com/articles/heroku-24-stack) and [Ubuntu packages on Heroku stacks](https://devcenter.heroku.com/articles/stack-packages) — OS differences, legacy time zones, Chrome/Redis buildpacks, missing/runtime-only packages.
- **[B]** Heroku, [Using multiple buildpacks](https://devcenter.heroku.com/articles/using-multiple-buildpacks-for-an-app) — live buildpack configuration versus `app.json`.
- **[P]** Heroku, [Release phase](https://devcenter.heroku.com/articles/release-phase) and [Releases: rollback](https://devcenter.heroku.com/articles/releases#rollback) — release processes and rollback limits.

See [TESTING.md](TESTING.md) for runs against three public Rails lockfiles and the limits of those tests. Licensed under [MIT](LICENSE).
