// Wires the popup's agent box to agent.js and the vendored WASM verifier.
// An ES module so it can import the verifier; agent.js stays a classic script for tests.
import init, { verify_proof } from './vendor/proof-verifier/hyperdag_proof_verifier.js';

let ready = null;
function verifier() {
  if (!ready) ready = init(new URL('./vendor/proof-verifier/hyperdag_proof_verifier_bg.wasm', import.meta.url));
  return ready;
}

async function verify(proofBytes, statement) {
  await verifier();
  return JSON.parse(verify_proof(JSON.stringify({ proof_bytes: proofBytes, statement })));
}

const form = document.querySelector('#agent-form');
const input = document.querySelector('#agent-id');
const out = document.querySelector('#agent-result');
if (form && input && out) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    out.textContent = 'Checking…';
    const api = globalThis.trustshellAgent;
    const result = await api.checkAgent(input.value, { verify });
    out.textContent = '';
    for (const line of api.agentLines(result)) {
      const p = document.createElement('p');
      p.textContent = line;
      out.appendChild(p);
    }
  });
}
