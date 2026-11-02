/**
 * Promotion writer: the only thing that turns a quarantined candidate into a trusted artifact.
 *
 * It holds its OWN Ed25519 key (src/lib/install-key.ts) in a directory that is never mounted into a
 * mission container, and it signs every decision, promote or refuse. It does not trust the airlock's
 * verdict: for each candidate it re-reads the quarantine copy, re-hashes it, re-classifies it and
 * re-scans it for canaries. Promoted bytes land in the trusted store (`<store>/<sha256>`, read-only);
 * nothing else writes there.
 *
 * Refused, for every candidate in a request: a revoked mission token, a token that is not the one
 * registered for the mission, no approval, an approval that claims the worker's identity, an approval
 * that did not come from the trusted side (e.g. from the outbox). Refused per candidate: anything without
 * a quarantine copy, a copy whose hash changed, a canary, a worker-written approval or policy, a tool
 * config or proposed memory (held for a human), anything the approval does not name.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KeyObject } from 'node:crypto';
import { signValue, signingKey, verifyValue, type Signer } from '../lib/install-key';
import { canaryHit, classify, HELD_CLASSES, REFUSED_CLASSES, sha256hex, type Candidate } from './airlock';

/** The only approval source the gate accepts. An approval read from a worker's outbox is never trusted. */
export const TRUSTED_APPROVAL_SOURCES: readonly string[] = ['trusted-harness'];
export const REVOKED_REASON = 'mission token revoked';

export interface Approval { approver: string; source: string; approved_sha256: string[] }
export interface PromotionRequest { mission_id: string; token: string; worker_identity: string; approval: Approval | null; candidates: Candidate[] }
export interface Decision {
  mission_id: string;
  seq: number;
  name: string;
  sha256: string | null;
  decision: 'promote' | 'refuse';
  reasons: string[];
  token_sha256: string;
  approver: string | null;
  at: string;
}
export interface SignedDecision { decision: Decision; signature: string }

const SHA = /^[0-9a-f]{64}$/;

export class Promoter {
  readonly signer: Signer;
  private readonly key: KeyObject;
  private readonly missions = new Map<string, string>();
  private seq = 0;

  constructor(private readonly o: { keyDir: string; stateDir: string; quarantineDir: string; storeDir: string; canaries: string[] }) {
    const k = signingKey(o.keyDir);
    this.key = k.key;
    this.signer = k.signer;
    mkdirSync(o.stateDir, { recursive: true, mode: 0o700 });
    mkdirSync(o.storeDir, { recursive: true, mode: 0o755 });
  }

  private get revocationFile(): string {
    return join(this.o.stateDir, 'revoked-tokens.json');
  }

  /** Revoked token hashes, from disk, so a restarted promoter still refuses them. */
  revoked(): string[] {
    if (!existsSync(this.revocationFile)) return [];
    const v: unknown = JSON.parse(readFileSync(this.revocationFile, 'utf8'));
    if (!Array.isArray(v)) throw new Error('revocation list is not an array');
    return v.map(String);
  }

  revoke(tokenSha256: string): void {
    const list = this.revoked();
    if (!list.includes(tokenSha256)) list.push(tokenSha256);
    writeFileSync(this.revocationFile, JSON.stringify(list), { mode: 0o600 });
  }

  registerMission(missionId: string, tokenSha256: string): void {
    if (this.revoked().includes(tokenSha256)) throw new Error('cannot register a revoked token');
    this.missions.set(missionId, tokenSha256);
  }

  decide(req: PromotionRequest): SignedDecision[] {
    const tokenSha = sha256hex(req.token);
    const gate: string[] = [];
    if (this.revoked().includes(tokenSha)) gate.push(REVOKED_REASON);
    if (this.missions.get(req.mission_id) !== tokenSha) gate.push('token is not the one registered for this mission');
    const a = req.approval;
    if (!a) gate.push('no approval');
    else {
      if (a.approver === req.worker_identity || a.approver.startsWith('mission:')) gate.push('approval claims the worker identity (self-approval)');
      if (!TRUSTED_APPROVAL_SOURCES.includes(a.source)) gate.push(`approval came from "${a.source}", not the trusted side`);
    }
    return req.candidates.map((c) => {
      const d = this.decideOne(req, c, tokenSha, gate);
      return { decision: d, signature: signValue(d, this.key) };
    });
  }

  private decideOne(req: PromotionRequest, c: Candidate, tokenSha: string, gate: string[]): Decision {
    const reasons = [...gate];
    const sha = c.sha256 && SHA.test(c.sha256) ? c.sha256 : null;
    let body: Buffer | null = null;
    if (c.status !== 'quarantined' || !sha) {
      reasons.push(`no quarantine copy (airlock: ${c.reasons.join('; ') || 'refused'})`);
    } else {
      const q = join(this.o.quarantineDir, sha);
      body = existsSync(q) ? readFileSync(q) : null;
      if (!body) reasons.push('quarantine copy missing');
      else {
        if (sha256hex(body) !== sha) reasons.push('quarantine copy does not match its hash');
        const cls = classify(c.name, body);
        if (HELD_CLASSES.includes(cls)) reasons.push(`${cls} is held for human review, never auto-promoted`);
        if (REFUSED_CLASSES.includes(cls)) reasons.push(`worker-written ${cls}`);
        const hit = canaryHit(body, this.o.canaries);
        if (hit >= 0) reasons.push(`contains registered canary #${hit}`);
      }
      if (req.approval && !req.approval.approved_sha256.includes(sha)) reasons.push('not named in the approval');
    }
    if (reasons.length === 0 && body && sha) {
      try {
        writeFileSync(join(this.o.storeDir, sha), body, { flag: 'wx', mode: 0o444 });
      } catch (e) {
        const p = join(this.o.storeDir, sha);
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || sha256hex(readFileSync(p)) !== sha) reasons.push('trusted store write failed');
      }
    }
    return {
      mission_id: req.mission_id,
      seq: ++this.seq,
      name: c.name,
      sha256: c.sha256,
      decision: reasons.length === 0 ? 'promote' : 'refuse',
      reasons,
      token_sha256: tokenSha,
      approver: req.approval?.approver ?? null,
      at: new Date().toISOString(),
    };
  }
}

export function verifyDecision(sd: SignedDecision, promoter: Signer): boolean {
  return verifyValue(sd.decision, promoter, sd.signature);
}
