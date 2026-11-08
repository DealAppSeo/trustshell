/**
 * Text a person saved on any platform. Windows PowerShell 5.1's `>` writes UTF-16 with a byte-order mark, so
 * `trustshell sign-receipt body.json > r.json`, the documented command, produced a file `verify-receipt` called
 * "not valid JSON". A byte-order mark says how the bytes are encoded and is never part of the text.
 */
export declare function decodeText(raw: Buffer | string): string;
