/**
 * Cheap first does not put their model first.
 */
export {};

const route = require('../extension/route.js') as {
  WRITER: string;
  orderFor: (value?: string) => Array<{ host: string; role: string }>;
};

describe('cheap first', () => {
  it('cheap first does not put their model first', () => {
    const rows = route.orderFor('cheap first');
    const first = rows[0];
    expect(first).toBeDefined();
    expect(first && first.host).not.toBe(route.WRITER);
    expect(first && first.role).toBe('check');
    const writerAt = rows.findIndex((row) => row.host === route.WRITER);
    expect(writerAt).toBeGreaterThan(0);
  });
});
