/* Content scripts in one manifest entry share one global scope. Each shared script keeps its
   names inside this function so two files can never redeclare the same top-level name. */
(function () {
  'use strict';


  /**
   * One classifier call. Labels are pass, veto, and not-checked.
   * A missing endpoint, a timeout, and an empty body are not-checked, never 0, never pass.
   * The reply text is not printed.
   */
  const LABELS = ['pass', 'veto', 'not-checked'];
  const SLOW_MS = 3000;
  /**
   * Shown under a Not checked stamp when the answer came past SLOW_MS. It used to read
   * 'Still checking', which sat under a stamp saying the opposite: past the cap the call is
   * over and nothing is still checking. It names the reason instead, with no number in it.
   */
  const SLOW_LINE = 'No answer in time.';

  /**
   * What a stranger reads on the stamp. Unmarked text reads as true, so every checked reply
   * shows exactly one of these, and anything that is not exactly pass, veto or checking shows
   * Not checked: a timeout, a skip, a non-200, a network error, an unreadable body, an unknown
   * label. Nothing paints Checks out by default.
   * The machine label (pass / veto / not-checked) goes in the tooltip, never in place of the words.
   * The second line on Caught names no voter on purpose. /classify checks a whole-text equation
   * by exact calculation BEFORE any model is asked (repid-engine src/routes/classify.ts), so
   * "Groq and Cerebras both said this is false" would be false for "2 + 2 = 5". Who answered goes
   * in the line under the stamp (lineFor / pathLine), and only when the response says so: its
   * `by` and `voters` fields (added 2026-10-05). An endpoint that sends neither gets no line.
   */
  const STAMP_WORDS = {
    checking: 'Checking with Groq and Cerebras',
    pass: 'Checks out',
    veto: 'Caught',
    'not-checked': 'Not checked',
  };
  const VETO_LINE = 'Checked and found false.';

  /**
   * The row a host paints. `by` / `voters` (what produced the label, from laya.js pathOf) ride
   * along only when the label is the endpoint's own and in time; a label this file overrode
   * carries no path, because the endpoint's path described a different answer.
   */
  function finish(started, row) {
    const elapsed = Date.now() - started;
    const label = row && typeof row === 'object' ? row.label : row;
    const known = label === 'pass' || label === 'veto' || label === 'not-checked';
    if (!known || elapsed > SLOW_MS) return { label: 'not-checked', latency_ms: elapsed };
    const out = { label, latency_ms: elapsed };
    if (row && typeof row === 'object' && typeof row.by === 'string') {
      out.by = row.by;
      if (Array.isArray(row.voters)) out.voters = row.voters.slice();
    }
    return out;
  }

  /** laya.js is the hardened call: http(s) only, no cookies, no redirects, a body cap. */
  function layaApi() {
    if (typeof globalThis !== 'undefined' && globalThis.trustshellLaya && globalThis.trustshellLaya.callLaya) {
      return globalThis.trustshellLaya;
    }
    if (typeof require === 'function') {
      try {
        return require('./laya.js');
      } catch {
        return null;
      }
    }
    return null;
  }

  function callClassifier(text, options) {
    const opts = options || {};
    const started = Date.now();
    const endpoint = Object.prototype.hasOwnProperty.call(opts, 'endpoint')
      ? opts.endpoint
      : String(opts.baseUrl || 'https://repid-engine-production.up.railway.app').replace(/\/$/, '') + '/api/v1/classify';
    if (typeof endpoint !== 'string' || endpoint.trim() === '' || /anthropic/i.test(endpoint)) {
      return Promise.resolve(finish(started, 'not-checked'));
    }
    const fetchImpl = opts.fetchImpl || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
    if (typeof fetchImpl !== 'function') return Promise.resolve(finish(started, 'not-checked'));
    // Unset, laya.js waits just past SLOW_MS, so an answer past the cap is shown as not-checked.
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : undefined;

    // laya.js makes the call: http(s) only, no cookies, no redirects, a body cap.
    // The manifest loads it before this file on every host. Missing is not-checked.
    const laya = layaApi();
    if (!laya) return Promise.resolve(finish(started, 'not-checked'));
    return laya
      .callLaya(text, { modelUrl: endpoint, fetchImpl, timeoutMs, now: () => Date.now() })
      .then((row) => finish(started, row))
      .catch(() => finish(started, 'not-checked'));
  }

  /**
   * The hosts redraw on every DOM change, and painting the stamp is itself a DOM change.
   * Without this, one finished reply is sent to the classifier again on every redraw.
   * Only the browser path (no options) is cached: one call in flight per text, and a
   * pass or veto is kept for that text.
   *
   * not-checked is kept too, but only for RETRY_MS, after which the next redraw retries.
   * It used to be kept for no time at all. Once the route answers not-checked for most prose
   * (repid-engine #1151 decides only whole-text arithmetic), that meant the last reply was
   * re-sent on EVERY DOM change: on chatgpt, every keystroke typed into the next prompt.
   * That spends the route's per-IP limit (30 a minute) in seconds, and the limit is shared
   * with every other door on the same connection. It also sends the reply again and again.
   */
  const RETRY_MS = 15000;
  const QUIET_MS = 1000;
  const memo = { text: null, promise: null, row: null, at: 0 };
  let quietTimer = null;

  /**
   * A streaming reply changes on every token. Call run only after the text has
   * stopped changing for about a second. A newer call cancels the one still waiting.
   */
  function whenSettled(run, ms) {
    const wait = Number.isFinite(ms) ? ms : QUIET_MS;
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      quietTimer = null;
      if (typeof run === 'function') run();
    }, wait);
  }

  function classifyOnce(text) {
    const key = String(text == null ? '' : text);
    const known = knownRow(key);
    if (known) return Promise.resolve(known);
    if (memo.text === key && memo.promise) return memo.promise;
    memo.text = key;
    memo.row = null;
    const promise = callClassifier(key, {}).then((row) => {
      if (memo.text === key && memo.promise === promise) {
        memo.promise = null;
        memo.row = row;
        memo.at = Date.now();
      }
      return row;
    });
    memo.promise = promise;
    return promise;
  }

  /**
   * The row the browser cache already holds for this text, or null. A host paints the
   * Checking stamp only when this is null: a known answer is painted straight away, so a
   * redraw never flickers a settled stamp back to Checking.
   */
  function knownRow(text) {
    const key = String(text == null ? '' : text);
    if (memo.text !== key || !memo.row) return null;
    const decided = memo.row.label === 'pass' || memo.row.label === 'veto';
    return decided || Date.now() - memo.at < RETRY_MS ? memo.row : null;
  }

  /** The hosts call this with no options in the browser, so they all share the cache. */
  function classifyReply(text, options) {
    return options === undefined ? classifyOnce(text) : callClassifier(text, options);
  }

  /** How people see each voter id. Unknown ids show as sent. Same table as src/lib/claim.ts. */
  const VOTER_NAMES = {
    groq: 'Groq',
    cerebras: 'Cerebras',
    'nvidia-nim': 'NVIDIA NIM',
    'workers-ai': 'Cloudflare Workers AI',
  };

  function voterPhrase(voters) {
    const names = Array.from(new Set(voters.map((v) => VOTER_NAMES[v] || v)));
    if (names.length === 1) {
      return voters.length > 1 ? { names: 'Two ' + names[0] + ' models', many: true } : { names: names[0], many: false };
    }
    return { names: names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1], many: true };
  }

  /**
   * What produced the label, in one line, or '' when the endpoint did not say. A port of
   * src/lib/claim.ts pathLine: tests/claim-path-parity.test.ts fails if the two disagree.
   */
  function pathLine(row) {
    if (!row) return '';
    switch (row.by) {
      case 'arithmetic':
        return 'Decided by exact calculation. No model was asked.';
      case 'skipped':
        return 'No checker was asked.';
      case 'deadline':
        return 'No answer in time.';
      case 'votes': {
        if (!Array.isArray(row.voters) || row.voters.length === 0) return '';
        const p = voterPhrase(row.voters);
        const all = !p.many ? '' : row.voters.length === 2 ? ' both' : ' all';
        if (row.label === 'pass') return p.names + all + ' said true.';
        if (row.label === 'veto') return p.names + all + ' said false.';
        return 'Asked ' + p.names + '. No agreed answer.';
      }
      default:
        return '';
    }
  }

  /**
   * The one line under the stamp: why it is Not checked when the call took over 3 seconds, else
   * what produced the label when the endpoint said so, else nothing.
   */
  function lineFor(row) {
    if (!row) return '';
    if (row.label === 'not-checked' && typeof row.latency_ms === 'number' && row.latency_ms > SLOW_MS) return SLOW_LINE;
    return pathLine(row);
  }

  function showCheckLine(doc, after, line) {
    if (!doc || typeof doc.getElementById !== 'function') return null;
    const nodeId = 'trustshell-check-line';
    let node = doc.getElementById(nodeId);
    if (!line) {
      if (node && typeof node.remove === 'function') node.remove();
      return null;
    }
    if (!node && typeof doc.createElement === 'function') {
      node = doc.createElement('div');
      node.id = nodeId;
      node.className = 'ts-check-line';
      if (typeof node.setAttribute === 'function') node.setAttribute('role', 'status');
    }
    if (!node) return null;
    node.textContent = line;
    if (after && typeof after.insertAdjacentElement === 'function') after.insertAdjacentElement('afterend', node);
    else if (doc.body && typeof doc.body.appendChild === 'function' && node.parentNode !== doc.body) doc.body.appendChild(node);
    return node;
  }

  /** The state a label paints. Only exactly pass, veto or checking is itself; all else is not-checked. */
  function stampState(label) {
    return label === 'pass' || label === 'veto' || label === 'checking' ? label : 'not-checked';
  }

  /** The words for a state. Caught carries a second line that says who voted. */
  function stampText(label) {
    const state = stampState(label);
    return state === 'veto' ? STAMP_WORDS.veto + '\n' + VETO_LINE : STAMP_WORDS[state];
  }

  /** True when the stamp already shows this state, so painting it again would be a DOM change for nothing. */
  function stampShows(stamp, label) {
    const state = stampState(label);
    return Boolean(stamp && stamp.dataset && stamp.dataset.stamp === state && stamp.textContent === stampText(state));
  }

  /**
   * Paint one state: the words, the machine label in the title tooltip, and data-stamp for the CSS.
   * Every host paints through this, so the five of them cannot disagree about what a label says.
   */
  function paintStamp(stamp, label) {
    if (!stamp) return stamp;
    const state = stampState(label);
    if (!stamp.dataset) stamp.dataset = {};
    stamp.dataset.stamp = state;
    stamp.textContent = stampText(state);
    stamp.title = state;
    return stamp;
  }

  const api = {
    LABELS,
    SLOW_MS,
    SLOW_LINE,
    QUIET_MS,
    STAMP_WORDS,
    VETO_LINE,
    classifyReply,
    knownRow,
    lineFor,
    pathLine,
    showCheckLine,
    whenSettled,
    stampState,
    stampText,
    stampShows,
    paintStamp,
  };

  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.trustshellClassify = api;
})();
