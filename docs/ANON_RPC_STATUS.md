# Anon RPC status — 6 Sep 2026

Proven over HTTP with a publishable key, no session (Claude, qnnpjhlxljtqyigedwkb).

Closed (401 / anon EXECUTE = false):
- peer_verify_collusion_cap_exceeded
- peer_verify_reward_multiplier
- peer_verify_claim_has_anchor

Still 200 as anon:
- get_validation_queue_status_24h — no args, live aggregates. Only in-repo caller: repid-engine observability-queries.ts via service db.rpc. No frontend found in trinity-ecosystem / trustrails-dev / trustshell.
- get_pending_updates — called from trinity-symphony-shared/auto_updater.js. Key fallback includes NEXT_PUBLIC_SUPABASE_ANON_KEY. Do not revoke anon until every Railway agent has service_role.
- get_user_ai_name / get_user_latest_ai_personality — 200 with fake uuid returns null. Real uuid is the exposure. Definitions in DealAppSeo/defuzzyai (private). No TrustShell caller found.

Triggers / zero-arg functions that 404 PGRST202: deprioritise.

Do not apply further prod REVOKE without Sean. Rollback for peer_verify is GRANT EXECUTE to public/anon/authenticated — logged as revoke_anon_peer_verify_oracle / revoke_public_peer_verify_oracle.
