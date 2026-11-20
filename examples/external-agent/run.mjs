// wrapExecute (from the published @hyperdag/trustshell) around an agent this project did not
// write: ELIZA, from the npm package eliza-as-promised. Everything runs on this machine.
//
//   node run.mjs supported     the agent answers, a LOCAL STUB checker says PASS, the output is released
//   node run.mjs unavailable   no checker is asked, the verdict is NOT_CHECKED, fail-closed withholds the output
//
// Exit codes are this example's own (wrapExecute is a function and has none): 0 = the supported
// case came out as expected, 3 = the unavailable case came out NOT_CHECKED as expected (3 is what
// the trustshell CLI uses for "not checked"), 1 = anything else.
import { appendFileSync } from 'node:fs';
import Eliza from 'eliza-as-promised';
import { TrustShell, wrapExecute } from '@hyperdag/trustshell';
import { startStubHal } from './stub-hal.mjs';

// Refuse any request that would leave this machine, so a mistake here cannot reach a real backend.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const host = new URL(typeof input === 'string' ? input : input.url).hostname;
  if (host !== '127.0.0.1') throw new Error(`blocked: this example only talks to 127.0.0.1, not ${host}`);
  return realFetch(input, init);
};

// The external agent. `true` turns off ELIZA's random choice, so the same input gives the same reply.
const INPUT = 'I need some help';
const agent = async () => (await new Eliza(true).getResponse(INPUT)).reply;

const record = (label) => (rec) => appendFileSync('records.jsonl', JSON.stringify({ case: label, ...rec }) + '\n');
const show = (label, r) => console.log(JSON.stringify({ case: label, ...r, halLatencyMs: undefined }, null, 2));

const which = process.argv[2];

if (which === 'supported') {
  const stub = await startStubHal();
  const client = new TrustShell({ apiUrl: stub.url }); // prints one WARNING line on stderr: expected
  const r = await wrapExecute(client, agent, { prompt: INPUT, onRecord: record('supported') });
  stub.close();
  show('supported', r);
  const ok =
    r.checked === true &&
    r.verdict === 'PASS' &&
    r.blocked === false &&
    r.disposition === 'released' &&
    typeof r.output === 'string' &&
    r.output.length > 0 &&
    stub.seen.length === 1 &&
    stub.seen[0] === r.output; // the checker was sent exactly what the agent said
  console.log(ok ? 'RESULT: released, verdict PASS from the LOCAL STUB (wiring shown, truth not checked)' : 'RESULT: unexpected');
  process.exit(ok ? 0 : 1);
}

if (which === 'unavailable') {
  // localOnly: the SDK sends nothing and answers NOT_CHECKED. No stub is started.
  const client = new TrustShell({ localOnly: true });
  const byDefault = await wrapExecute(client, agent, { prompt: INPUT, onRecord: record('unavailable-default') });
  const failClosed = await wrapExecute(client, agent, {
    prompt: INPUT,
    blockAtOrAbove: 'VETO',
    onUnavailable: 'withhold',
    onRecord: record('unavailable-fail-closed'),
  });
  show('unavailable-default', byDefault);
  show('unavailable-fail-closed', failClosed);
  const ok =
    byDefault.verdict === 'NOT_CHECKED' &&
    byDefault.checked === false &&
    byDefault.blocked === false && // the default records and still hands the output over
    typeof byDefault.output === 'string' &&
    failClosed.verdict === 'NOT_CHECKED' &&
    failClosed.checked === false &&
    failClosed.blocked === true &&
    failClosed.disposition === 'withheld' &&
    failClosed.output === undefined;
  console.log(ok ? 'RESULT: NOT_CHECKED. Default released the output; fail-closed withheld it. Not a pass.' : 'RESULT: unexpected');
  process.exit(ok ? 3 : 1);
}

console.error('usage: node run.mjs supported|unavailable');
process.exit(2);
