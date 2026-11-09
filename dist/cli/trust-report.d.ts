import { type SealableReceipt } from '../lib/owner-receipt';
export declare const TRUST_REPORT_SCHEMA: "dev.trustshell.trust-report/0.2-draft";
/** TrustShell 1.9.0 called a passed command SUPPORTED. `verify` rebuilds a report under its own schema, so a folder made then stays checkable. */
declare const TRUST_REPORT_SCHEMA_0_1: "dev.trustshell.trust-report/0.1-draft";
type ReportSchema = typeof TRUST_REPORT_SCHEMA | typeof TRUST_REPORT_SCHEMA_0_1;
export declare const TRUST_REPORT_USAGE = "trustshell trust-report --out <new dir> [--record <record.json>]... [--bind \"<tool or script>=<claim>\"]... [--title <text>] [--json]\ntrustshell trust-report verify <dir> [--root <0x key>] [--json]";
export declare const NOT_MEDIATED_ALWAYS = "Anything the agent did without `trustshell run`: edits it made directly, its own network calls, commands in another terminal. This report cannot see them.";
export interface Bind {
    claim: string;
    decided_by: string;
    tool: string | null;
    script_sha256: string | null;
}
export interface InspectRow {
    path: string;
    run_url: string;
    repo: string;
    run_id: number;
    head_sha: string;
    conclusion: string | null;
    verdict: string;
    fetched_at: string;
    digest: string;
    digest_matches: boolean;
    exit: number;
    claims: {
        status: string;
        claim: string;
        scope: string;
    }[];
}
export interface CommandRow {
    seq: number;
    ts: string;
    action: string;
    script_sha256: string | null;
    command_sha256: string | null;
    decision: string;
    reasons: string[];
    result: string;
    exit_code: number | null;
}
export interface BoundClaim {
    claim: string;
    decided_by: string;
    /** COMMAND_PASSED is the most an exit code can stand for: TrustShell cannot tell whether a command tested anything. */
    status: 'COMMAND_PASSED' | 'SUPPORTED' | 'CONTRADICTED' | 'NOT_CHECKED';
    why: string;
    record_seq: number | null;
}
export interface TrustReport {
    schema: ReportSchema;
    title: string;
    generated_at: string;
    generator: string;
    inputs: {
        binds: Bind[];
        records: string[];
    };
    inspect: InspectRow[];
    guard: {
        policy: {
            state: string;
            sha256: string | null;
            nonce: string | null;
            signed: boolean;
            actions: string[];
        };
        ledger: {
            verdict: string;
            count: number;
            breaks: string[];
        };
        commands: CommandRow[];
        mediated: string[];
        not_mediated: string[];
    };
    bound_claims: BoundClaim[];
    next_actions: string[];
    exit: number;
}
export interface BuildInput {
    /** Only `verify` sets this, to rebuild a report under the schema it was made with. */
    schema?: ReportSchema;
    title: string;
    generatedAt: string;
    generator: string;
    binds: Bind[];
    records: {
        path: string;
        text: string;
    }[];
    ledgerText: string;
    policyText: string | null;
}
/** PURE. The whole report, from its inputs. `verify` calls this again to prove the report matches its evidence. */
export declare function buildTrustReport(input: BuildInput): TrustReport;
export declare function renderTrustReportMarkdown(r: TrustReport): string;
export declare function renderTrustReportHtml(r: TrustReport): string;
interface IO {
    out: (s: string) => void;
    err: (s: string) => void;
}
/** The sealed receipt names the manifest's sha256 in args_hash, so one signature covers every listed file. */
export declare function sealBody(manifestSha: string, createdAt: string): SealableReceipt;
export declare function runTrustReport(argv: string[], io: IO, env?: NodeJS.ProcessEnv, cwd?: string): Promise<number>;
export {};
