/**
 * The three C-level belt pages, served only at an UNLISTED address: /b/<key>/<role>, where <key> is
 * the BELTS_SHARE_KEY setting on the deployment (app/b/[key]/[role]/route.ts). They used to be
 * public/belts/<role>.html, which anyone could guess. Sean, 2026-10-06: "not navigable, so that I
 * can share them with someone that they would have to actually have the entire URL to see it."
 *
 * UNLISTED, NOT SECRET. This repository is public, so the words below can be read on GitHub by
 * anyone who looks. What the key keeps private is the address on trustshell.dev, and the key is
 * never in this repository: it lives only in the deployment's settings.
 *
 * Each page asks search engines not to index it and the browser not to send the address on when a
 * reader follows a link out (the address carries the key).
 */

export const BELT_ROLES = ['cmo', 'cto', 'cfo'] as const;
export type BeltRole = (typeof BELT_ROLES)[number];

export const BELT_HTML: Record<BeltRole, string> = {
  cmo: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>CMO belt</title>
</head>
<body>
  <article class="belt">
    <h1>CMO</h1>
    <p>A belt is a clip for the PAI or a 2nd or 3rd agent.</p>
    <p>These names are methods. They do not endorse this page.</p>
    <p>Prices and licences were read on 2026-10-02 and can change. This page does not install anything.</p>
    <table>
      <thead>
        <tr><th>name</th><th>kind</th><th>why</th><th>free or paid</th></tr>
      </thead>
      <tbody>
        <tr><td>Hormozi</td><td>method</td><td>Offer method, named only.</td><td>free</td></tr>
        <tr><td>Vaynerchuk</td><td>method</td><td>Content method, named only.</td><td>free</td></tr>
        <tr><td>Godin</td><td>method</td><td>Permission method, named only.</td><td>free</td></tr>
        <tr><td>CapCut (capcut.com)</td><td>tool</td><td>Captions on a phone clip.</td><td>free tier, paid plans</td></tr>
        <tr><td>OpenMontage (github.com/calesthio/OpenMontage)</td><td>tool</td><td>Local assembly. No paid key. AGPL-3.0.</td><td>free</td></tr>
        <tr><td>Publora (publora.com)</td><td>tool</td><td>A draft. A person publishes.</td><td>free tier, paid plans</td></tr>
        <tr><td>marketingskills (github.com/coreyhaines31/marketingskills)</td><td>skill</td><td>Social, video, and referral lists. MIT.</td><td>free</td></tr>
        <tr><td>trustshell</td><td>MCP</td><td>Checks a claim before a post.</td><td>free</td></tr>
        <tr><td>social-sdk (github.com/opencoredev/social-sdk)</td><td>repo</td><td>Mock until a person says post.</td><td>free</td></tr>
        <tr><td>trustshell</td><td>repo</td><td>The shell this belt clips onto.</td><td>free</td></tr>
      </tbody>
    </table>
  </article>
</body>
</html>
`,
  cto: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>CTO belt</title>
</head>
<body>
  <article class="belt">
    <h1>CTO</h1>
    <p>A belt is a clip for the PAI or a 2nd or 3rd agent.</p>
    <p>No key printed.</p>
    <table>
      <thead>
        <tr><th>name</th><th>kind</th><th>why</th><th>free or paid</th></tr>
      </thead>
      <tbody>
        <tr><td>trustshell verify</td><td>tool</td><td>Sends the last text to the check. A miss is not-checked.</td><td>free</td></tr>
        <tr><td>proof --verify</td><td>tool</td><td>Checks the proof the shell already holds.</td><td>free</td></tr>
        <tr><td>secret-shape check</td><td>tool</td><td>Refuses a value that looks like a key. The value is not printed.</td><td>free</td></tr>
        <tr><td>trustshell status</td><td>tool</td><td>Reads the lines the shell prints.</td><td>free</td></tr>
        <tr><td>redact</td><td>skill</td><td>Strips a secret shape before anything is stored.</td><td>free</td></tr>
        <tr><td>present_proof</td><td>MCP</td><td>Shares the proof hash. No key in the call.</td><td>free</td></tr>
        <tr><td>trustshell</td><td>repo</td><td>The CLI that runs these checks.</td><td>free</td></tr>
      </tbody>
    </table>
  </article>
</body>
</html>
`,
  cfo: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>CFO belt</title>
</head>
<body>
  <article class="belt">
    <h1>CFO</h1>
    <p>A belt is a clip for the PAI or a 2nd or 3rd agent.</p>
    <table>
      <thead>
        <tr><th>name</th><th>kind</th><th>why</th><th>free or paid</th></tr>
      </thead>
      <tbody>
        <tr><td>cap</td><td>tool</td><td>Spend is off.</td><td>free</td></tr>
        <tr><td>receipt</td><td>tool</td><td>No receipt, no spend.</td><td>free</td></tr>
        <tr><td>invoice check</td><td>tool</td><td>A proof is read before an invoice is approved.</td><td>free</td></tr>
        <tr><td>grants</td><td>skill</td><td>A person raises a limit. This page does not.</td><td>free</td></tr>
        <tr><td>trustshell</td><td>MCP</td><td>Reads a receipt. It does not pay.</td><td>free</td></tr>
        <tr><td>trustshell</td><td>repo</td><td>The cap lives in shell config.</td><td>free</td></tr>
      </tbody>
    </table>
  </article>
</body>
</html>
`,
};
