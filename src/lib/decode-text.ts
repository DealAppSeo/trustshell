/**
 * Text a person saved on any platform. Windows PowerShell 5.1's `>` writes UTF-16 with a byte-order mark, so
 * `trustshell sign-receipt body.json > r.json`, the documented command, produced a file `verify-receipt` called
 * "not valid JSON". A byte-order mark says how the bytes are encoded and is never part of the text.
 */
export function decodeText(raw: Buffer | string): string {
  if (typeof raw === 'string') return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  if (raw[0] === 0xff && raw[1] === 0xfe) return raw.subarray(2).toString('utf16le');
  if (raw[0] === 0xfe && raw[1] === 0xff) return Buffer.from(raw.subarray(2)).swap16().toString('utf16le');
  const text = raw.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
