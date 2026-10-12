"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAgentId = resolveAgentId;
exports.myJob = myJob;
/**
 * my_job — an agent asks "what is my job?" and gets the answer its owner set, from the engine.
 *
 * The web app sends a job card with every run (lib/job-card.ts). An agent running in Claude
 * Desktop, Cursor or Claude Code gets no such card, so the MCP server exposes the same facts as a
 * tool: the role, the tools it may use, and until when — read from its live grants.
 *
 * WHICH AGENT. The MCP server does not know which agent it is serving unless told. It reads, in
 * order: TRUSTSHELL_AGENT_ID, then `agentId` in `<TRUSTSHELL_HOME or .trustshell>/credentials.json`
 * (what `trustshell init --pai` writes). An AI app often starts the server in a directory you did
 * not choose, so the env var in the MCP config is the reliable way. With neither, the answer is
 * NOT_CHECKED with the fix, never an empty job.
 *
 * Only the agent id is read from credentials.json. The key in that file is never read here.
 */
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const claim_1 = require("./claim");
const TOOL_PREFIX = 'read:tool:';
function resolveAgentId(env = process.env, read = (p) => (0, node_fs_1.readFileSync)(p, 'utf8')) {
    const fromEnv = env.TRUSTSHELL_AGENT_ID?.trim();
    if (fromEnv)
        return fromEnv;
    try {
        const creds = JSON.parse(read((0, node_path_1.join)(env.TRUSTSHELL_HOME || '.trustshell', 'credentials.json')));
        return typeof creds.agentId === 'string' && creds.agentId.trim() ? creds.agentId.trim() : null;
    }
    catch {
        return null;
    }
}
async function myJob(opts = {}) {
    const env = opts.env ?? process.env;
    const agentId = resolveAgentId(env, opts.read);
    if (!agentId) {
        return {
            status: 'NOT_CHECKED',
            reason: 'This server does not know which agent it serves. Add "env": { "TRUSTSHELL_AGENT_ID": "<your agent id>" } to the trustshell entry in your MCP config, or start it from the folder that holds .trustshell/credentials.json.',
        };
    }
    const base = (env.TRUSTSHELL_API_URL?.trim() || claim_1.DEFAULT_API_URL).replace(/\/+$/, '');
    const doFetch = opts.fetchImpl ?? ((url) => fetch(url));
    let grants;
    try {
        const res = await doFetch(`${base}/api/v1/grants?principal=${encodeURIComponent(agentId)}`);
        if (!res.ok)
            return { status: 'NOT_CHECKED', reason: `The engine answered ${res.status} when asked for this agent's grants.` };
        const body = (await res.json());
        if (!Array.isArray(body.grants))
            return { status: 'NOT_CHECKED', reason: 'The engine did not return a list of grants.' };
        grants = body.grants;
    }
    catch {
        return { status: 'NOT_CHECKED', reason: 'Could not reach the engine to read this agent\'s grants.' };
    }
    const mine = grants.filter((g) => g.live === true && g.grantee_agent_id === agentId);
    const role = mine.map((g) => (g.role ?? '').toLowerCase()).find((r) => r) ?? null;
    const caps = Array.from(new Set(mine.flatMap((g) => g.capabilities ?? [])));
    const tools = caps.filter((c) => c.startsWith(TOOL_PREFIX)).map((c) => c.slice(TOOL_PREFIX.length));
    const other = caps.filter((c) => !c.startsWith(TOOL_PREFIX));
    const until = mine.map((g) => g.expires_at ?? '').filter(Boolean).sort()[0] ?? null;
    const lines = [];
    if (mine.length === 0) {
        lines.push('No role yet: your owner has not given you one. You may answer and check claims; nothing else is granted.');
    }
    else {
        lines.push(role ? `Your role: ${role.toUpperCase()}.` : 'Your owner has given you the permissions below.');
        if (tools.length)
            lines.push(`Tools you may use, read-only${until ? `, until ${until.slice(0, 10)}` : ''}: ${tools.join(', ')}.`);
        if (other.length)
            lines.push(`Other permissions: ${other.join(', ')}.`);
        lines.push('You may not spend, post in public, or use any other tool unless your owner approves it.');
    }
    return { status: 'OK', agent_id: agentId, role, tools, other_permissions: other, until, card: lines.join('\n') };
}
