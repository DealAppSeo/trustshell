/**
 * Build a local memory packet. The body is redacted. This module does not call a vendor.
 */
import { redact } from './redact';

export type PacketKind = 'note' | 'pref' | 'do_not_send';

export type MemoryPacket = {
  kind: PacketKind;
  body: string;
};

export function buildPacket(input: MemoryPacket): MemoryPacket {
  return { kind: input.kind, body: redact(input.body) };
}
