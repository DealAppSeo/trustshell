// replay.mjs: replay a frozen corpus of break-it fixtures against an installed @hyperdag/trustshell. Node 22, built-ins only, no network, no key.
//   node docs/measurements/antifragile/replay.mjs --pkg <dir that holds dist/cli/index.js> --corpus docs/measurements/antifragile/corpus-2a4880e3.jsonl [--json]
// A trimmed copy of the runner the night's loop used (claims-contrib.mjs runFixture): each fixture's files are written to a scratch project, its steps run as
// `node <pkg>/dist/cli/index.js <args>` with no shell, a scratch home, and TRUSTSHELL_API_URL pointed at a closed port. A model proposed each fixture; THIS PROGRAM decides:
//   CONFIRMED       every `confirm` assertion held (the tool did what the fixture says is wrong; read the fixture before calling it a defect: some are ill-posed)
//   NOT_REPRODUCED  a `confirm` assertion did not hold
//   INVALID         the fixture's own `control` did not hold, or a step ran past 30 s and was killed (a loaded machine), so it proves nothing
// The corpus line's sha256 is its ruler. Exit 0 always (a CONFIRMED line is a reading to do, not a verdict); 2 on bad usage.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import http from "node:http";
import { spawn } from "node:child_process";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const PKG = arg("pkg") && path.resolve(arg("pkg")), CORPUS = arg("corpus") && path.resolve(arg("corpus"));
if (!PKG || !CORPUS || !fs.existsSync(path.join(PKG, "dist/cli/index.js")) || !fs.existsSync(CORPUS)) { console.log("usage: node replay.mjs --pkg <dir with dist/cli/index.js> --corpus <corpus-xxxxxxxx.jsonl> [--json]"); process.exit(2); }
const CLI = path.join(PKG, "dist/cli/index.js");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const CTRL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const ENV_OK = new Set(["TRUSTSHELL_HOME", "TRUSTSHELL_MEMORY", "TRUSTSHELL_LOCAL_ONLY", "OFFLINE", "NO_COLOR"]);
// a hash-chained session log for `inspect`, so a fixture can say {"inspect_chain":["bash","read_file"]} instead of computing hashes
const inspectChain = (tools) => { let prev = null; return tools.map((t, i) => { const e = { seq: i + 1, ts: `2026-10-21T10:${String((i + 1) % 60).padStart(2, "0")}:00Z`, tool: t, input_sha256: sha(`in${i + 1}`), output_sha256: sha(`out${i + 1}`), prev }; e.hash = sha(JSON.stringify([e.seq, e.ts, e.tool, e.input_sha256, e.output_sha256, e.prev])); prev = e.hash; return JSON.stringify(e); }).join("\n") + "\n"; };
const reTest = (rx, s) => { try { return !!vm.runInNewContext("re.test(s)", { re: new RegExp(rx, "u"), s: String(s).slice(0, 256 * 1024) }, { timeout: 250 }); } catch { return false; } };
const holds = (a, ctx) => {
  const kind = Object.keys(a).find((k) => k !== "step"), v = a[kind], st = ctx.steps[a.step];
  switch (kind) {
    case "exit": return st.code === v;
    case "exit_not": return st.code !== v;
    case "stdout_matches": return reTest(v, st.out);
    case "stdout_not_matches": return !reTest(v, st.out);
    case "stderr_matches": return reTest(v, st.err);
    case "stderr_not_matches": return !reTest(v, st.err);
    case "output_has_control_bytes": return CTRL.test(st.out + st.err) === v;
    case "hits_delta": return typeof v === "number" ? st.hits_delta === v : (v.min === undefined || st.hits_delta >= v.min) && (v.max === undefined || st.hits_delta <= v.max);
    case "file_exists": return ctx.exists(v);
    case "file_absent": return !ctx.exists(v);
    case "file_matches": return ctx.exists(v.path) && reTest(v.regex, ctx.read(v.path));
    default: return false;
  }
};
const SAFE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|DATABASE|SUPABASE|GITHUB|^GH_|NPM_CONFIG|ANTHROPIC|OPENAI|PRIVATE|TRUSTSHELL/i.test(k)));

async function runFixture(f, work) {
  const root = fs.mkdtempSync(path.join(work, "fx-")), home = path.join(root, "home"), proj = path.join(root, "proj");
  fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(proj, { recursive: true });
  const inside = (p) => { const r = path.relative(root, path.resolve(p)); return r !== "" && !r.startsWith("..") && !path.isAbsolute(r); };
  const sub = (s) => s.replace(/\$PROJ/g, proj).replace(/\$HOME_DIR/g, home);
  for (const [rel, v] of Object.entries(f.files || {})) {
    const t = path.join(proj, rel); if (!inside(t)) return { verdict: "INVALID", why: `files.${rel} resolves outside the project` };
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, typeof v === "string" ? v : v.base64 !== undefined ? Buffer.from(v.base64, "base64") : inspectChain(v.inspect_chain));
  }
  // A local server that only counts requests, for fixtures that ask "did this command dial out?" (a step with "network":"counting-server"). Every other step points at a closed port.
  let hits = 0; const srv = http.createServer((rq, rs) => { hits++; rs.writeHead(200, { "content-type": "application/json" }); rs.end("{}"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const port = srv.address().port;
  const steps = [];
  try {
    for (const s of f.steps) {
      const env = { ...SAFE_ENV, HOME: home, USERPROFILE: home, TRUSTSHELL_HOME: path.join(home, ".trustshell"), TRUSTSHELL_MEMORY: path.join(home, "memory.sqlite"), TRUSTSHELL_API_URL: s.network === "counting-server" ? `http://127.0.0.1:${port}` : "http://127.0.0.1:9" };
      for (const [k, v] of Object.entries(s.env || {})) { const val = sub(v); if (!ENV_OK.has(k) || (/^TRUSTSHELL_(HOME|MEMORY)$/.test(k) && !inside(val))) return { verdict: "INVALID", why: `env ${k} not allowed here` }; env[k] = val; }
      const before = hits;
      const r = await new Promise((resolve) => {
        const c = spawn(process.execPath, [CLI, ...s.run.map(sub)], { cwd: proj, env, windowsHide: true });
        let out = "", err = ""; c.stdout.on("data", (d) => { if (out.length < 512 * 1024) out += d; }); c.stderr.on("data", (d) => { if (err.length < 512 * 1024) err += d; });
        let killed = false; const t = setTimeout(() => { killed = true; c.kill(); }, 30000); c.stdin.on("error", () => {}); c.stdin.end(s.stdin || "");
        c.on("close", (code) => { clearTimeout(t); resolve({ code, out, err, killed }); });
      });
      // A step the clock killed says nothing about the tool. Scored as an exit code it flipped a case to the wrong label on a loaded machine (2026-10-24).
      if (r.killed) return { verdict: "INVALID", why: `a step ran past 30 s and was killed (${s.run[0]}): NOT_CHECKED, not a result` };
      steps.push({ ...r, hits_delta: hits - before });
    }
  } finally { try { srv.closeAllConnections?.(); } catch {} srv.close(); }
  const ctx = { steps, exists: (p) => fs.existsSync(path.join(proj, p)) || fs.existsSync(path.join(home, p)), read: (p) => { const a = path.join(proj, p), b = path.join(home, p); return fs.readFileSync(fs.existsSync(a) ? a : b, "utf8"); } };
  if ((f.control || []).some((a) => !holds(a, ctx))) return { verdict: "INVALID", why: "its own control did not hold" };
  return { verdict: f.confirm.every((a) => holds(a, ctx)) ? "CONFIRMED" : "NOT_REPRODUCED" };
}

const body = fs.readFileSync(CORPUS), rows = body.toString("utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "af-replay-")), pj = JSON.parse(fs.readFileSync(path.join(PKG, "package.json"), "utf8")), out = [];
for (const r of rows) { const o = await runFixture(r.fixture, work); out.push({ id: r.fixture.id, origin: r.origin, verdict: o.verdict, why: o.why }); if (!process.argv.includes("--json")) console.log(`${o.verdict.padEnd(15)} ${r.fixture.id}  [${r.origin}]`); }
fs.rmSync(work, { recursive: true, force: true });
const n = (v) => out.filter((x) => x.verdict === v).length;
// The hash is over the file with LF line endings, which is how it was frozen; git on Windows checks the same file out with CRLF, and the raw bytes would hash differently.
const summary = { corpus_sha256: sha(body.toString("utf8").replace(/\r\n/g, "\n")), fixtures: rows.length, artifact: `${pj.name}@${pj.version}`, CONFIRMED: n("CONFIRMED"), NOT_REPRODUCED: n("NOT_REPRODUCED"), INVALID: n("INVALID") };
if (process.argv.includes("--json")) console.log(JSON.stringify({ ...summary, results: out }, null, 2)); else console.log(`\nREPLAY ${JSON.stringify(summary)}`);
