| Kind | Prefix/Pattern | Where it belongs | Status |
|---|---|---|---|
| Supabase publishable key | `sb_publishable_...` | Browser/client | PASS |
| Supabase secret key | `sb_secret_...` | Server HTTP / GitHub Actions | PASS |
| Supabase URL | `https://*.supabase.co` | `SUPABASE_URL` | PASS |
| Railway Postgres URL | `postgresql://postgres.` + `REF:pw@` + `*pooler*:6543/postgres` | `DATABASE_URL` | PASS |

Context: this kit expects `DATABASE_URL` to be the Railway pooler URL shape above.

| Fail example | Why FAIL |
|---|---|
| `YOUR16CHARPW` | Placeholder password, not a real credential |
| `[YOUR-PASSWORD]` | Placeholder password, not a real credential |
| `sb_secret_` inside a postgres URI | Mixed credential types |
| `db.*.supabase.co:6543` | Wrong host for this kit’s `DATABASE_URL` (Railway pooler expected) |
