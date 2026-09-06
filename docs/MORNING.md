# Morning — before anyone is invited

Do these in order. Stop if a step fails.

## 1. Site key (15 min)

The marketing page still renders. Browser calls to this Supabase project use a **legacy JWT disabled 2026-08-04**. That is why live scores sit on “Loading…”.

1. In Supabase → API keys: **create** a publishable key named `trustshell_landing`.
2. Vercel → project `trustshell-landing` → Settings → Environment Variables.
3. Find the var whose value is the old `eyJ…` JWT (likely `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Replace the value with the new `sb_publishable_…` key. Do not turn legacy JWTs back on.
5. Redeploy production.
6. Prove it (a green deploy log is not proof):

```bash
curl -sL https://trustshell.dev | grep -oE 'src="[^"]+\.js[^"]*"'
# fetch each bundle, then:
#   old JWT pattern  → want 0
#   sb_publishable_  → want ≥1
```

## 2. Claude Code + tarball (the CLI)

```
Repo: DealAppSeo/trustshell only.
Branch: feat/1.4.0-local.
Input: trustshell-1.4.0.tar.gz.
Land inspect / init / check / report. Keep verify / repid / proof / badge.
Keep the OpenClaw plugin. seq from last JSONL line.
No merge. No npm publish. No other repo.
```

When the PR is green, **you** merge and `npm publish` 1.4.0.

## 3. One real card

```bash
npx @hyperdag/trustshell@1.4.0 check https://github.com/DealAppSeo/trustshell/actions/runs/<real-id>
```

If that page is honest, you may invite.

## Do not, tonight or first thing

- Delete remaining Supabase **secrets** (fleet was Online; site 401 ≠ engine down).
- Apply the four-getter revoke until Railway `auto_updater.js` is confirmed on `SERVICE_ROLE`.
- Invite people to trustshell.dev while the bundle still contains the dead JWT.
- Publish a self-audit that names functions or exploit recipes.

## Invite (only after 1–3)

> Your AI says it’s done. Check it.
> `npx @hyperdag/trustshell@1.4.0 check <github-actions-url>`
> No account. Public API. Says what the evidence confirms and what it does not prove.
