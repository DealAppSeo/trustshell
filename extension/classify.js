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
  /** Past this the call is over and the stamp is Not checked. The same wait as laya.js. */
  const SLOW_MS = 6000;
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
    ask: 'Check this reply',
    // Was "Checking with Groq and Cerebras" until 2026-10-06: wrong whenever a backup took a turn.
    checking: 'Asking two checkers',
    pass: 'Checks out',
    veto: 'Caught',
    'not-checked': 'Not checked',
  };
  const VETO_LINE = 'Checked and found false.';

  /**
   * LATENCY AS OPPORTUNITY (Sean, 2026-10-05). When the first checkers are busy the engine asks
   * another, and the answer can take a few seconds. Past STILL_MS the Checking stamp says why the
   * wait is worth it instead of looking stuck. It is true whether or not a stand-in was asked, so
   * it claims nothing the response has not said yet.
   */
  const STILL_MS = 2500;
  const CHECKING_LONGER = 'Still checking. Two checkers must agree.';

  /**
   * The row a host paints. `by` / `voters` (what produced the label, from laya.js pathOf) ride
   * along only when the label is the endpoint's own and in time; a label this file overrode
   * carries no path, because the endpoint's path described a different answer.
   */
  /**
   * Copies what produced the label (`by`, `voters`, `deciders`) from a row onto `out`. The ONE
   * place these fields are copied: content.js, grok.js and select.js each used to copy `voters`
   * by hand, and when `deciders` arrived (2026-10-05) the browser stamp dropped it while every unit
   * test passed, so a stand-in's answer read "Groq, Cerebras and OpenRouter all said false". The
   * extension e2e caught it. A new field is added here once, not in four files.
   */
  function copyPath(row, out) {
    if (!row || typeof row !== 'object' || typeof row.by !== 'string') return out;
    out.by = row.by;
    if (Array.isArray(row.voters)) out.voters = row.voters.slice();
    if (Array.isArray(row.deciders)) out.deciders = row.deciders.slice();
    return out;
  }

  function finish(started, row) {
    const elapsed = Date.now() - started;
    const label = row && typeof row === 'object' ? row.label : row;
    const known = label === 'pass' || label === 'veto' || label === 'not-checked';
    if (!known || elapsed > SLOW_MS) return { label: 'not-checked', latency_ms: elapsed };
    return copyPath(row, { label, latency_ms: elapsed });
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

  /** settings.js (Your TrustShell). Absent outside the extension, where nothing changes. */
  function settingsApi() {
    return typeof globalThis !== 'undefined' && globalThis.trustshellSettings ? globalThis.trustshellSettings : null;
  }

  function thisSite(api) {
    return typeof location !== 'undefined' && location ? api.siteOf(location.hostname) : null;
  }

  /**
   * Whether this page may check at all (Your TrustShell, "Where it checks"). A site switched off
   * sends nothing and shows no stamp. Settings that could not be read check nothing: a site the
   * person switched off is never sent from because storage was slow.
   */
  function siteAllowed(api) {
    return api.ready().then(
      (cfg) => Boolean(cfg) && api.siteOn(cfg, thisSite(api)),
      () => false,
    );
  }

  /** A site switched off keeps no stamp, line or toast from before. */
  function clearStamp() {
    if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return;
    const ids = ['trustshell-stamp', 'trustshell-check-line', 'trustshell-toast'];
    for (let i = 0; i < ids.length; i++) {
      const node = document.getElementById(ids[i]);
      if (node && typeof node.remove === 'function') node.remove();
    }
  }

  /**
   * A streaming reply changes on every token. Call run only after the text has
   * stopped changing for about a second. A newer call cancels the one still waiting.
   * Every host's automatic draw comes through here, so this is where a site switched off stops.
   */
  function whenSettled(run, ms) {
    const wait = Number.isFinite(ms) ? ms : QUIET_MS;
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      quietTimer = null;
      if (typeof run !== 'function') return;
      // Without settings.js (unit tests, the service worker) it runs at once, as before the page.
      const api = settingsApi();
      if (!api) {
        run();
        return;
      }
      siteAllowed(api).then((ok) => {
        if (ok) run();
        else clearStamp();
      });
    }, wait);
  }

  /**
   * ONLY WHEN I CLICK (Your TrustShell, "When it checks"). The reply is not sent until the person
   * clicks the stamp, which then reads Check this reply. `approved` is the text they clicked for;
   * `asking` is the text the stamp is offering to check. A new reply asks again.
   */
  let approved = null;
  let asking = null;

  function askRow(key) {
    const api = settingsApi();
    const cfg = api && api.current();
    if (!cfg || cfg.mode !== api.CLICK || approved === key) return null;
    asking = key;
    return { label: 'ask', latency_ms: 0 };
  }

  /**
   * Tells the service worker which stamp this page painted, for the record on the Options page:
   * the label, how it was reached and who decided. Never the text; the service worker reads the
   * site from this tab's URL. The same text and label twice in a row is one stamp, not two.
   */
  let lastRecorded = null;
  function record(text, row) {
    if (!row || LABELS.indexOf(row.label) < 0 || !settingsApi()) return;
    const sig = text + '\u0000' + row.label;
    if (lastRecorded === sig) return;
    lastRecorded = sig;
    try {
      if (typeof chrome === 'undefined' || !chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') return;
      // Who decided, as the stamp's own line reads it: the deciders, or for an endpoint that sends
      // only voters, those voters when there were exactly two of them.
      const deciders = Array.isArray(row.deciders) && row.deciders.length > 0
        ? row.deciders
        : Array.isArray(row.voters) && row.voters.length === 2 ? row.voters : [];
      chrome.runtime.sendMessage(
        { type: 'trustshell-record', label: row.label, by: row.by, deciders },
        () => void chrome.runtime.lastError,
      );
    } catch (_err) {
      /* the record is a convenience; a stamp never waits on it */
    }
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
      record(key, row);
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
    if (memo.text === key && memo.row) {
      const decided = memo.row.label === 'pass' || memo.row.label === 'veto';
      if (decided || Date.now() - memo.at < RETRY_MS) return memo.row;
    }
    // Only when I click: a reply not yet clicked for is known already. It is Check this reply.
    return askRow(key);
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
    openrouter: 'OpenRouter',
    zai: 'Z.ai',
    mistral: 'Mistral',
    together: 'Together',
    fireworks: 'Fireworks',
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
        // Who answered, when the endpoint says; else everyone it was sent to (an older endpoint).
        const who = Array.isArray(row.deciders) && row.deciders.length > 0 ? row.deciders : row.voters;
        if (!Array.isArray(who) || who.length === 0) return '';
        const p = voterPhrase(who);
        const all = !p.many ? '' : who.length === 2 ? ' both' : ' all';
        if (row.label === 'pass') return p.names + all + ' said true.';
        if (row.label === 'veto') return p.names + all + ' said false.';
        // Mid-sentence, so "Two Groq models" is lower-cased: "Asked two Groq models."
        return 'Asked ' + p.names.replace(/^Two /, 'two ') + '. No agreed answer.';
      }
      default:
        return '';
    }
  }

  /**
   * The one line under the stamp: why it is Not checked when the call took over SLOW_MS, else
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

  /** The state a label paints. Only exactly pass, veto, checking or ask is itself; all else is not-checked. */
  function stampState(label) {
    return label === 'pass' || label === 'veto' || label === 'checking' || label === 'ask' ? label : 'not-checked';
  }

  /**
   * Check this reply is a button: a click or Enter checks the reply it sits under. Painting
   * Checking is itself a DOM change, so the host's observer draws again, and this time the text
   * is approved and goes out. Bound once per stamp; it does nothing once the stamp shows another state.
   */
  function askable(stamp, state) {
    if (typeof stamp.setAttribute === 'function') stamp.setAttribute('role', state === 'ask' ? 'button' : 'status');
    if (state === 'ask') stamp.tabIndex = 0;
    else if (typeof stamp.removeAttribute === 'function') stamp.removeAttribute('tabindex');
    if (state !== 'ask' || stamp.dataset.askBound === '1' || typeof stamp.addEventListener !== 'function') return;
    stamp.dataset.askBound = '1';
    const go = (event) => {
      if (!stamp.dataset || stamp.dataset.stamp !== 'ask') return;
      if (event && event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      approved = asking;
      paintStamp(stamp, 'checking');
    };
    stamp.addEventListener('click', go);
    stamp.addEventListener('keydown', go);
  }

  /**
   * The words for a state. Caught carries a second line that says who voted. A stamp that has been
   * Checking for STILL_MS or more says so (CHECKING_LONGER); `since` is when it started checking.
   */
  function stampText(label, since, now) {
    const state = stampState(label);
    if (state === 'veto') return STAMP_WORDS.veto + '\n' + VETO_LINE;
    if (state === 'checking' && Number.isFinite(since) && (now === undefined ? Date.now() : now) - since >= STILL_MS) {
      return CHECKING_LONGER;
    }
    return STAMP_WORDS[state];
  }

  function checkingSince(stamp) {
    const raw = stamp && stamp.dataset ? Number(stamp.dataset.checkingSince) : NaN;
    return Number.isFinite(raw) ? raw : undefined;
  }

  /** True when the stamp already shows this state, so painting it again would be a DOM change for nothing. */
  function stampShows(stamp, label) {
    const state = stampState(label);
    return Boolean(
      stamp && stamp.dataset && stamp.dataset.stamp === state && stamp.textContent === stampText(state, checkingSince(stamp)),
    );
  }

  /**
   * Paint one state: the words, the machine label in the title tooltip, and data-stamp for the CSS.
   * Every host paints through this, so the five of them cannot disagree about what a label says.
   */
  function paintStamp(stamp, label) {
    if (!stamp) return stamp;
    const state = stampState(label);
    if (!stamp.dataset) stamp.dataset = {};
    const wasChecking = stamp.dataset.stamp === 'checking';
    stamp.dataset.stamp = state;
    if (state !== 'checking') {
      delete stamp.dataset.checkingSince;
    } else if (!wasChecking || checkingSince(stamp) === undefined) {
      stamp.dataset.checkingSince = String(Date.now());
      // One timer per stretch of Checking: if the stamp is still Checking at STILL_MS, say why.
      if (typeof setTimeout === 'function') {
        setTimeout(() => {
          if (stamp.dataset && stamp.dataset.stamp === 'checking') stamp.textContent = stampText('checking', checkingSince(stamp));
        }, STILL_MS);
      }
    }
    stamp.textContent = stampText(state, checkingSince(stamp));
    stamp.title = state;
    askable(stamp, state);
    return stamp;
  }

  const api = {
    LABELS,
    SLOW_MS,
    SLOW_LINE,
    QUIET_MS,
    STAMP_WORDS,
    VETO_LINE,
    STILL_MS,
    CHECKING_LONGER,
    copyPath,
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
