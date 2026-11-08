import { decodeText } from '../src/lib/decode-text';

describe('decodeText', () => {
  const text = '{"a":"é"}\n';
  it('reads what Windows PowerShell 5.1 > writes', () => {
    expect(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]))).toBe(text);
  });
  it('reads UTF-16 big-endian', () => {
    expect(decodeText(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()]))).toBe(text);
  });
  it('drops one UTF-8 byte-order mark and keeps the rest', () => {
    expect(decodeText(Buffer.from(`﻿${text}`, 'utf8'))).toBe(text);
    expect(decodeText(`﻿﻿${text}`)).toBe(`﻿${text}`);
  });
  it('leaves plain UTF-8 alone', () => {
    expect(decodeText(Buffer.from(text, 'utf8'))).toBe(text);
  });
});
