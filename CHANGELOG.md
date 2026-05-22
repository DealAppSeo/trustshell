# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] - 2026-05-22

### Added
- **Lifecycle API**: Added high-level, 4-line onboarding lifecycle methods (`register()`, `verifyOutput()`, `agentStatus`) for registering, verifying outputs, and triggering automatic ERC-8004 minting on Base Sepolia.
- **Resilient Fetch**: Integrated robust HTTP calling logic with configurable abort timeouts, exponential backoff, and circuit breaker protection for lifecycle requests.
- **End-to-End Smoke Test**: Added `tests/smoke-base-sepolia.test.ts` to verify the full registration-to-mint flow.

### Changed
- **Dependencies**: Integrated `@types/jest`, `jest`, and `ts-jest` for local TypeScript testing.

## [0.3.0] - 2026-05-10

### Added
- **Local STARK Verification**: Integrated `@hyperdag/proof-verifier` (WASM) for client-side mathematical proof validation.
- **Auto-Verify**: Added `autoVerify` config option to `TrustShell` for automatic proof validation during `report()`.
- **Closure Support**: `RepIDResult` now includes a `verifyLocally()` closure for on-demand verification of specific decisions.
- **CLI Tool**: Added `trustshell-verify-demo` for terminal-based verification.
- **Narrative Context**: Surfaced extended narrative and on-chain mint status in verification results.

### Changed
- **Proof Endpoint**: Updated `getProof()` to use the new unauthenticated `/api/v1/repid/proof/:jobId` endpoint.
- **Types**: Extended `RepIDResult` and `ProofResult` with verification-specific fields.

## [0.2.1] - 2026-05-09
### Fixed
- Restored SDK metadata and README after template overwrite.
- Improved polling logic for `waitForProof()`.

## [0.2.0] - 2026-05-08
### Added
- 5-signal HAL extractor integration.
- Layer 1 cross-LLM agreement support.
- Phase 1.5 prompt classification.
