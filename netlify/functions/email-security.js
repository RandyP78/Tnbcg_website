/* ============================================================
   TEKNIK — email security checker (free tier)

   PASSIVE DNS LOOKUPS ONLY. This reads public DNS records, the
   same thing any mail server does. It does not connect to, probe,
   or scan the target host. Do not extend this to port scanning or
   vulnerability probing against domains the visitor doesn't own —
   that needs written authorisation and is a CFAA problem without it.
   ============================================================ */

const dns = require('node:dns').promises;

// Common DKIM selectors. We can't enumerate selectors from DNS, so we
// probe the well-known ones. A miss is inconclusive, not a failure —
// the copy below says so.
const SELECTORS = [
  ['selector1', 'Microsoft 365'],
  ['selector2', 'Microsoft 365'],
  ['google',    'Google Workspace'],
  ['k1',        'Mailchimp / Mandrill'],
  ['s1',        'generic'],
  ['s2',        'generic'],
  ['dkim',      'generic'],
  ['default',   'generic'],
  ['mail',      'generic'],
  ['zoho',      'Zoho'],
];

const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

function clean(input) {
  if (typeof input !== 'string') return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0];
  if (d.includes('@')) d = d.split('@').pop();
  return DOMAIN_RE.test(d) ? d : null;
}

async function txt(name) {
  try {
    const recs = await dns.resolveTxt(name);
    return recs.map(r => r.join(''));
  } catch { return []; }
}

async function checkMx(domain) {
  try {
    const mx = await dns.resolveMx(domain);
    if (!mx.length) throw new Error('none');
    mx.sort((a, b) => a.priority - b.priority);
    const provider = guessProvider(mx.map(m => m.exchange).join(' '));
    return {
      id: 'mx', status: 'ok',
      title: 'Mail servers found',
      detail: `${mx.length} MX record${mx.length > 1 ? 's' : ''}. Primary: ${mx[0].exchange}${provider ? ` (${provider})` : ''}.`,
      value: mx[0].exchange,
    };
  } catch {
    return {
      id: 'mx', status: 'bad',
      title: 'No mail servers found',
      detail: 'This domain has no MX records, so it cannot receive email. If that is deliberate you should still publish a null MX and a reject-all SPF policy so nobody can spoof it.',
    };
  }
}

function guessProvider(s) {
  if (/outlook|protection\.outlook/i.test(s)) return 'Microsoft 365';
  if (/google|googlemail/i.test(s)) return 'Google Workspace';
  if (/zoho/i.test(s)) return 'Zoho';
  if (/proofpoint|pphosted/i.test(s)) return 'Proofpoint';
  if (/mimecast/i.test(s)) return 'Mimecast';
  if (/barracuda/i.test(s)) return 'Barracuda';
  return null;
}

async function checkSpf(domain) {
  const records = (await txt(domain)).filter(r => /^v=spf1/i.test(r));

  if (!records.length) {
    return {
      id: 'spf', status: 'bad',
      title: 'No SPF record',
      detail: 'Nothing tells receiving servers which hosts may send mail as this domain. Anyone can forge your address, and legitimate mail is more likely to land in junk.',
    };
  }
  if (records.length > 1) {
    return {
      id: 'spf', status: 'bad',
      title: 'Multiple SPF records',
      detail: 'More than one SPF record is a permanent error under RFC 7208. Receivers may ignore all of them. These must be merged into a single record.',
      value: records.join(' | '),
    };
  }

  const rec = records[0];
  const all = (rec.match(/([~\-+?])all\s*$/i) || [])[1];
  const lookups = (rec.match(/\b(include|a|mx|ptr|exists|redirect)[:=]?/gi) || []).length;

  let status = 'ok';
  let detail = '';
  if (all === '-') detail = 'Ends in -all (hard fail). Unlisted senders are rejected. This is the strongest setting.';
  else if (all === '~') { status = 'warn'; detail = 'Ends in ~all (soft fail). Unlisted senders are accepted but marked. Common, and fine while you are still finding every legitimate sender, but -all is the goal.'; }
  else if (all === '?') { status = 'bad'; detail = 'Ends in ?all (neutral), which enforces nothing at all. Effectively the same as having no SPF record.'; }
  else if (all === '+') { status = 'bad'; detail = 'Ends in +all, which authorises the entire internet to send as you. This should be changed today.'; }
  else { status = 'warn'; detail = 'No explicit all mechanism, so the policy is treated as neutral.'; }

  if (lookups > 10) {
    status = status === 'ok' ? 'warn' : status;
    detail += ` It also has roughly ${lookups} DNS-lookup mechanisms; the RFC limit is 10, and going over causes a permanent error.`;
  }

  return { id: 'spf', status, title: 'SPF record found', detail, value: rec };
}

async function checkDmarc(domain) {
  const records = (await txt(`_dmarc.${domain}`)).filter(r => /^v=DMARC1/i.test(r));

  if (!records.length) {
    return {
      id: 'dmarc', status: 'bad',
      title: 'No DMARC record',
      detail: 'Without DMARC, receiving servers have no instruction about what to do with mail that fails SPF and DKIM, and you get no reporting on who is sending as you. This is the single highest-value fix on most domains.',
    };
  }

  if (records.length > 1) {
    return {
      id: 'dmarc', status: 'bad',
      title: 'Multiple DMARC records',
      detail: `Found ${records.length} DMARC records at _dmarc. RFC 7489 says that when more than one is published, receivers must treat the domain as having no DMARC policy at all — so despite the records being there, none of them are being enforced and you are receiving incomplete reporting. These need to be merged into a single record.`,
      value: records.join('  ||  '),
    };
  }

  const rec = records[0];
  const p = (rec.match(/[;\s]p=([a-z]+)/i) || [])[1];
  const pct = (rec.match(/[;\s]pct=(\d+)/i) || [])[1];
  const rua = /rua=/i.test(rec);

  let status = 'ok';
  let detail = '';
  if (p === 'reject') detail = 'Policy is p=reject. Mail failing authentication is rejected outright. This is the goal state.';
  else if (p === 'quarantine') { status = 'warn'; detail = 'Policy is p=quarantine. Failing mail goes to junk rather than being rejected. A reasonable staging point on the way to reject.'; }
  else { status = 'warn'; detail = 'Policy is p=none, which is monitor-only. It collects reports but blocks nothing, so spoofed mail still gets delivered. Many domains stop here and never move on.'; }

  if (pct && Number(pct) < 100) {
    detail += ` It applies to only ${pct}% of messages (pct=${pct}).`;
    status = status === 'ok' ? 'warn' : status;
  }
  if (!rua) detail += ' No rua address is set, so you receive no aggregate reports and have no visibility into who is sending as you.';

  return { id: 'dmarc', status, title: 'DMARC record found', detail, value: rec };
}

async function checkDkim(domain) {
  const found = [];
  await Promise.all(SELECTORS.map(async ([sel, label]) => {
    const [t, c] = await Promise.all([
      txt(`${sel}._domainkey.${domain}`),
      dns.resolveCname(`${sel}._domainkey.${domain}`).catch(() => []),
    ]);
    if (t.some(r => /v=DKIM1|p=/i.test(r)) || c.length) found.push(`${sel} (${label})`);
  }));

  if (found.length) {
    return {
      id: 'dkim', status: 'ok',
      title: 'DKIM signing keys found',
      detail: `Published at ${found.join(', ')}. Outbound mail can be cryptographically signed.`,
    };
  }
  return {
    id: 'dkim', status: 'warn',
    title: 'No DKIM keys found at common selectors',
    detail: 'We probe the well-known selectors, but DKIM selectors cannot be enumerated from DNS, so a custom one would not show up here. Inconclusive rather than a definite failure — worth confirming in your mail platform.',
  };
}

async function checkMtaSts(domain) {
  const recs = (await txt(`_mta-sts.${domain}`)).filter(r => /^v=STSv1/i.test(r));
  return recs.length
    ? { id: 'mtasts', status: 'ok', title: 'MTA-STS published', detail: 'Enforces TLS on inbound mail, which protects against downgrade attacks.', value: recs[0] }
    : { id: 'mtasts', status: 'warn', title: 'No MTA-STS policy', detail: 'Optional, and not required by any framework yet. It enforces encryption in transit for inbound mail and is worth adding once SPF, DKIM and DMARC are settled.' };
}

function grade(checks) {
  const w = { mx: 1, spf: 3, dmarc: 4, dkim: 2, mtasts: 1 };
  const pts = { ok: 1, warn: 0.5, bad: 0 };
  let got = 0, max = 0;
  for (const c of checks) { got += (w[c.id] || 1) * pts[c.status]; max += (w[c.id] || 1); }
  const pc = Math.round((got / max) * 100);
  if (pc >= 90) return { letter: 'A', tone: 'ok',   pc, summary: 'Your email authentication is in good shape.' };
  if (pc >= 75) return { letter: 'B', tone: 'ok',   pc, summary: 'Mostly solid, with a couple of things worth tightening.' };
  if (pc >= 55) return { letter: 'C', tone: 'warn', pc, summary: 'Partially configured. There are real gaps a spoofer could use.' };
  if (pc >= 35) return { letter: 'D', tone: 'warn', pc, summary: 'Significant gaps. Your domain is fairly easy to impersonate.' };
  return              { letter: 'F', tone: 'bad',  pc, summary: 'Little or no protection. Anyone can send mail as your domain today.' };
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': process.env.SITE_ORIGIN || '*',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body.' }) }; }

  const domain = clean(body.domain);
  if (!domain) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'That does not look like a valid domain. Try something like example.com.' }) };
  }

  try {
    const checks = await Promise.all([
      checkMx(domain), checkSpf(domain), checkDmarc(domain), checkDkim(domain), checkMtaSts(domain),
    ]);
    return { statusCode: 200, headers, body: JSON.stringify({ domain, checks, grade: grade(checks), checkedAt: new Date().toISOString() }) };
  } catch (err) {
    console.error('email-security failure', err && err.code);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'DNS lookup failed. The domain may not exist, or the resolver timed out. Try again in a moment.' }) };
  }
};

/* NOTE ON ABUSE
   Netlify functions are stateless, so there is no rate limiting here.
   Before you promote this tool anywhere, put a limiter in front of it —
   Netlify's built-in rate limiting on the function, or a small
   Upstash/Redis counter keyed on IP. Ten requests per minute is plenty. */
