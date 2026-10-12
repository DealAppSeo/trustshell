// Shared reporter. Three outcomes, never two: HELD / BREACHED / NOT_CHECKED (exit 2).
//
// Two modes:
//   regress (default)  a check that is KNOWN-OPEN must still breach; if it now holds, the run FAILS with
//                      "FIXED: delete the knownOpen marker" (the it.failing idiom: a finding cannot go stale
//                      silently). Anything not known-open must hold, or the run FAILS (a regression).
//   fixed              every check must hold. This is the bar the scrubber PR must reach.
export function parseMode(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--mode');
  const m = i >= 0 ? argv[i + 1] : 'regress';
  if (m !== 'regress' && m !== 'fixed') { console.error(`unknown --mode ${m} (regress | fixed)`); process.exit(2); }
  return m;
}
export function makeReporter(mode) {
  const rows = [];
  return {
    mode,
    /** secureOk = true when the system behaved the SECURE way. knownOpen = documented hole, expected to breach today. */
    check(id, secureOk, evidence = '', { knownOpen = false } = {}) {
      let verdict, pass;
      if (mode === 'fixed') { pass = secureOk; verdict = secureOk ? 'HELD' : 'BREACHED'; }
      else if (knownOpen) { pass = !secureOk; verdict = secureOk ? 'FIXED (stale knownOpen marker: delete it)' : 'BREACHED (known open)'; }
      else { pass = secureOk; verdict = secureOk ? 'HELD' : 'REGRESSED'; }
      rows.push({ id, pass, verdict });
      console.log(`${pass ? 'ok  ' : 'FAIL'} ${verdict.padEnd(40)} ${id}${evidence ? '  | ' + evidence : ''}`);
    },
    finish(extra = '') {
      const bad = rows.filter((r) => !r.pass);
      const count = (v) => rows.filter((r) => r.verdict.startsWith(v)).length;
      console.log(`\n${rows.length} checks | HELD ${count('HELD')} | BREACHED(known open) ${count('BREACHED (known')} | BREACHED ${rows.filter((r) => r.verdict === 'BREACHED').length} | REGRESSED ${count('REGRESSED')} | stale markers ${count('FIXED')}${extra ? ' | ' + extra : ''}`);
      if (bad.length) { console.log(`FAILED (${mode}): ${bad.map((b) => b.id).join(', ')}`); process.exit(1); }
      console.log(`OK (${mode})`); process.exit(0);
    },
  };
}
