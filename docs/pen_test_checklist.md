# TrustShell Pen-Test & Security Audit Checklist

This checklist documents the security protocols, configuration rules, and verification paths required to secure the TrustShell frontend and API integrations.

---

## 1. Rate-Limiting Public Endpoints

Public-facing API endpoints must be protected against brute force, denial of service, and resource exhaustion.

- [ ] **Next.js API Routes Rate Limiting**:
  - Implement IP-based sliding window rate-limiting middleware for:
    - `/api/verify-proof` (limit: 60 requests/minute per IP)
    - `/api/dashboard` (limit: 120 requests/minute per IP)
    - `/api/landing` (limit: 30 requests/minute per IP)
  - Return HTTP `429 Too Many Requests` on breach.

- [ ] **Supabase REST API Limits**:
  - Verify that the anonymous client key has REST API caps configured in the Supabase Dashboard under *Settings > API*.
  - Keep default Max Rows returned per query capped at `1000`.

- [ ] **RPC Endpoint Protection**:
  - Protect custom Ethereum provider calls by proxying RPC queries or using rate-limited API keys for public nodes (e.g. Infura/Alchemy/LlamaNodes).

---

## 2. Row Level Security (RLS) Verification Harness

Ensure that no data leaks can occur through direct Postgres or REST API queries.

- [ ] **Enable RLS Globally**:
  - Run SQL script to enable RLS across all tables:
    ```sql
    ALTER TABLE trinity_leads ENABLE ROW LEVEL SECURITY;
    ALTER TABLE repid_zkp_proofs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE repid_agents ENABLE ROW LEVEL SECURITY;
    ```
- [ ] **RLS Verification Harness**:
  - Establish automated tests executing anonymous select/insert queries:
    - Assert that anonymous inserts to `trinity_leads` are permitted (only for email collection).
    - Assert that anonymous select on `trinity_leads` is blocked (returning `401 Unauthorized` or empty arrays).
    - Assert that anonymous writes to configuration and proof tables are blocked.
  - Verify that service role keys (`SUPABASE_SERVICE_ROLE_KEY`) bypass RLS only on backend administrative functions.

---

## 3. Key-Handling & Secrets Hygiene

Keep private parameters in safe environments.

- [ ] **Client-Side Storage**:
  - Verify that private keys (such as `TRUSTSHELL_KEY`) are stored in IndexedDB (`localDb` / `vault`) and encrypted using **AES-GCM** derived from a user-provided passphrase.
  - Confirm that keys are never sent to Next.js API routes or logged in application telemetry.
  - Set `httpOnly` flags for any sensitive session cookies.

- [ ] **Server-Side Environment Variables**:
  - Confirm that no production credentials (e.g. Supabase service role key) are checked into version control.
  - Keep `.env.production` files restricted and inject variables securely via production hosting providers.
  - Periodically rotate keys and verify that leaked keys triggers automated revocation.
