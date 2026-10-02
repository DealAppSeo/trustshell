/**
 * Reads the last assistant reply and draws one stamp under it.
 * A missing or empty reply is not-checked.
 * This script does not click, type, or send.
 */
(function () {
  var STAMP_ID = 'trustshell-stamp';
  var scheduled = false;

  function assistantNodes() {
    var nodes = Array.prototype.slice.call(
      document.querySelectorAll(
        '[data-message-author-role="assistant"], [data-turn="assistant"]'
      )
    );
    return nodes.filter(function (node) {
      return !nodes.some(function (other) {
        return other !== node && other.contains(node);
      });
    });
  }

  function readText(node) {
    var copy = node.cloneNode(true);
    var stamps = copy.querySelectorAll('#' + STAMP_ID + ', .ts-stamp');
    for (var i = 0; i < stamps.length; i++) stamps[i].remove();
    return (copy.textContent || '').trim();
  }

  function stampWord(text) {
    if (typeof text !== 'string' || text.trim().length === 0) return 'not-checked';
    var lines = text.split(/\r?\n/);
    var last = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim().toLowerCase();
      if (line.length > 0) last = line;
    }
    if (last === 'pass' || last === 'veto' || last === 'not-checked') return last;
    return 'not-checked';
  }

  function draw() {
    var nodes = assistantNodes();
    var last = nodes.length > 0 ? nodes[nodes.length - 1] : null;
    var word = last ? stampWord(readText(last)) : 'not-checked';
    var stamp = document.getElementById(STAMP_ID);
    var placed = false;
    if (stamp && stamp.dataset.stamp === word && stamp.textContent === word) {
      if (last) placed = stamp.previousElementSibling === last;
      else placed = stamp.parentNode === (document.querySelector('main') || document.body);
    }
    if (placed) return;

    if (!stamp) {
      stamp = document.createElement('div');
      stamp.id = STAMP_ID;
      stamp.className = 'ts-stamp';
      stamp.setAttribute('role', 'status');
    }
    stamp.dataset.stamp = word;
    stamp.textContent = word;

    if (last) {
      last.insertAdjacentElement('afterend', stamp);
      return;
    }
    var host = document.querySelector('main') || document.body;
    host.appendChild(stamp);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      draw();
    });
  }

  schedule();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
