/**
 * PyPI API token shapes starting with `pypi-` must be stripped from escalate packs.
 */
import { outboundFor, packEscalate } from '../src/memory/outbound';

const PYPI_TOKEN = 'pypi-AgEEcHkiOiJleGFtcGxlLWNyZWRzLWZvci10cnVzdHNoZWxs';

describe('outbound PyPI silence', () => {
  it('packEscalate strips pypi- tokens from task and claims', () => {
    const packed = packEscalate(
      `publish ${PYPI_TOKEN} package`,
      [`token ${PYPI_TOKEN}`, `ok claim`],
    );
    expect(JSON.stringify(packed)).not.toMatch(/pypi-/);
    expect(packed.task).toBe('publish  package');
    expect(packed.claims).toEqual(['token ', 'ok claim']);
  });

  it('outboundFor escalate strips pypi- tokens from the packed JSON', () => {
    const packed = outboundFor('escalate', `upload ${PYPI_TOKEN}`, [
      `use ${PYPI_TOKEN}`,
    ]);
    expect(packed).not.toBeNull();
    expect(JSON.stringify(packed)).not.toMatch(/pypi-/);
    expect(packed).toEqual({
      task: 'upload ',
      claims: ['use '],
    });
  });

  it('ask and cheap still send nothing', () => {
    expect(outboundFor('ask', `send ${PYPI_TOKEN}`, [`claim ${PYPI_TOKEN}`])).toBeNull();
    expect(outboundFor('cheap')).toBeNull();
  });
});
