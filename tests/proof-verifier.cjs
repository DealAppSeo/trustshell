/**
 * Jest stand-in for @hyperdag/proof-verifier. Same verify() contract as the
 * ESM entry, backed by the package's CommonJS Node WASM build.
 */
const { verify_proof, init_panic_hook } = require('@hyperdag/proof-verifier/pkg-node/hyperdag_proof_verifier.js');

let ready = false;

async function verify(proofBytes, statement) {
  if (!ready) {
    init_panic_hook();
    ready = true;
  }
  return JSON.parse(verify_proof(JSON.stringify({ proof_bytes: proofBytes, statement })));
}

module.exports = { verify };
