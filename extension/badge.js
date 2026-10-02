'use strict';

const LABEL = 'Trust Harness';

/** The badge names the harness. It does not ask for a role. */
function badge() {
  return { label: LABEL, ask: false };
}

module.exports = {
  LABEL,
  badge,
};
