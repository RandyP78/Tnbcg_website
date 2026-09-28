/* ============================================================
   TEKNIK — deep remediation report (the paid tier)

   THE GATE LIVES HERE, ON THE SERVER. Never gate in the browser:
   a hidden div or a localStorage flag is bypassed in seconds, and
   for a security company that is an embarrassing thing to be caught
   doing. The paid content never reaches the client without a valid
   session.

   TESTING PHASE
   -------------
   Set PAYWALL_ENABLED=false (or leave it unset) and this returns the
   full report to everyone. That is how you run the free test.
   Flip it to true when you want to start charging. No code change.

   Environment variables:
     PAYWALL_ENABLED   "true" to enforce payment. Default false.
     STRIPE_SECRET_KEY your Stripe secret key (only needed when enforcing)
   ============================================================ */

const PAYWALL_ENABLED = String(process.env.PAYWALL_ENABLED).toLowerCase() === 'true';

/* ---------- the gated content ---------- */

const EMAIL_FIXES = {
  spf: {
    title: 'Fix your SPF record',
    why: 'SPF tells receiving servers which hosts are allowed to send mail using your domain. Without a strict policy, anyone can forge your address — which is how invoice fraud usually starts.',
    steps: [
      'List every system that legitimately sends mail as you: your mail platform, CRM, invoicing tool, marketing platform, ticketing system, scanners and copiers.',
      'Build a single TXT record at the root of the domain. One record only — a second one is a permanent error and receivers may ignore both.',
      'Use include: mechanisms your vendors publish rather than raw IPs where possible, so their infrastructure changes do not break you.',
      'Stay under 10 DNS-lookup mechanisms. Over that is a permanent error. Flatten or drop unused includes if you are close.',
      'Publish with ~all first, watch DMARC aggregate reports for two to four weeks to catch senders you forgot, then move to -all.',
    ],
    example: 'v=spf1 include:spf.protection.outlook.com include:_spf.yourcrm.com -all',
  },
  dmarc: {
    title: 'Publish and enforce DMARC',
    why: 'DMARC ties SPF and DKIM together, tells receivers what to do when mail fails both, and is the only one of the three that reports back to you on who is sending as your domain.',
    steps: [
      'Start at p=none with an rua address so you collect reports without changing delivery. Nothing breaks at this stage.',
      'Send reports somewhere they will actually be read. Raw XML is unreadable at volume — use a report parser.',
      'Review two to four weeks of reports and authenticate every legitimate sender you find.',
      'Move to p=quarantine, ideally ramping with pct= so you can watch the effect on a slice of mail first.',
      'Finish at p=reject, pct=100. Anything short of reject still lets spoofed mail through.',
      'Add a DMARC record on parked domains too, with p=reject. Unused domains are attractive precisely because nobody is watching them.',
    ],
    example: 'v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com; fo=1; adkim=s; aspf=s',
  },
  dkim: {
    title: 'Turn on DKIM signing',
    why: 'DKIM cryptographically signs outbound mail so receivers can confirm it was not altered in transit and did genuinely originate from your infrastructure. DMARC cannot reach enforcement reliably without it.',
    steps: [
      'Enable DKIM in your mail platform. In Microsoft 365 this is in the Defender portal under email authentication settings.',
      'Publish the CNAME records your platform gives you, then enable signing — in that order, or signing fails.',
      'Enable DKIM separately in every third-party platform that sends as you. Each one has its own selector.',
      'Use 2048-bit keys where offered.',
      'Rotate keys periodically. Annually is a reasonable cadence for most organisations.',
    ],
    example: 'selector1._domainkey.yourdomain.com  CNAME  selector1-yourdomain-com._domainkey.tenant.onmicrosoft.com',
  },
  mx: {
    title: 'Mail routing',
    why: 'MX records determine where inbound mail goes. Misconfiguration here causes silent mail loss, and stale records left pointing at a decommissioned host are a real interception risk.',
    steps: [
      'Confirm every MX record points at infrastructure you currently control.',
      'Remove records for platforms you have migrated away from.',
      'If a domain does not receive mail at all, publish a null MX (priority 0, target ".") plus v=spf1 -all so it cannot be abused.',
    ],
  },
  mtasts: {
    title: 'Add MTA-STS and TLS reporting',
    why: 'MTA-STS requires that inbound mail arrives over TLS, closing off downgrade attacks where an interceptor strips encryption. Not yet required by any framework, but it is where things are heading.',
    steps: [
      'Publish a policy file at https://mta-sts.yourdomain.com/.well-known/mta-sts.txt',
      'Add the _mta-sts TXT record pointing at that policy.',
      'Run in testing mode first, then move to enforce.',
      'Add TLS-RPT so you receive reports on delivery failures.',
    ],
  },
};

const M365_FIXES = {
  mfa: { title: 'Enforce MFA for every account', where: 'Entra admin centre → Protection → Conditional Access', why: 'The single highest-impact control available. The overwhelming majority of account compromises involve accounts without it.', steps: ['Create a Conditional Access policy requiring MFA for all users, all cloud apps.', 'Exclude only a single break-glass account, and store its credentials offline.', 'Run in report-only mode for a week, then enforce.', 'Prefer an authenticator app or hardware key. SMS is better than nothing but is defeated by SIM swapping.'] },
  legacy: { title: 'Block legacy authentication', where: 'Entra admin centre → Conditional Access', why: 'Legacy protocols such as IMAP, POP and SMTP AUTH do not support MFA. Leaving them on means the MFA policy above can be walked straight around.', steps: ['Check the sign-in logs, filtered on legacy client apps, to find anything still using them.', 'Migrate or retire those clients — usually old scanners, copiers and line-of-business apps.', 'Create a Conditional Access policy blocking legacy authentication for all users.'] },
  admin: { title: 'Separate admin accounts from daily-use accounts', where: 'Entra admin centre → Roles and administrators', why: 'If a global admin also reads email and browses the web on that account, one phishing click hands over the entire tenant.', steps: ['Create dedicated admin accounts with no mailbox and no licence beyond what is needed.', 'Strip admin roles from all daily-use accounts.', 'Keep fewer than five global admins, and prefer least-privilege roles over global admin.', 'Turn on Privileged Identity Management for just-in-time elevation if you hold Entra ID P2.'] },
  audit: { title: 'Enable unified audit logging with adequate retention', where: 'Microsoft Purview → Audit', why: 'This is the evidence an auditor asks for. Default retention is far shorter than most frameworks expect, and you cannot retroactively generate logs you never kept.', steps: ['Confirm unified audit logging is on.', 'Set retention to at least one year — most frameworks assume a twelve-month look-back.', 'Check your licence tier: longer retention needs the right add-on.', 'Export to a SIEM or archive if your framework requires longer than the tenant will hold.'] },
  consent: { title: 'Restrict user app consent', where: 'Entra admin centre → Enterprise applications → Consent and permissions', why: 'By default users can grant third-party applications access to their own mailbox and files. Consent phishing exploits exactly this, and it survives a password reset.', steps: ['Set user consent to allow only apps from verified publishers for low-impact permissions, or block user consent entirely.', 'Turn on the admin consent request workflow so users can still ask.', 'Review the applications that already hold consent — there are usually surprises.'] },
  sharing: { title: 'Restrict external sharing', where: 'SharePoint admin centre → Policies → Sharing', why: 'Default settings permit anonymous "anyone" links that never expire and can be forwarded without limit. Under HIPAA or PCI scope, that is a disclosure waiting to happen.', steps: ['Set sharing to new and existing guests at minimum; disable anonymous links for sites holding regulated data.', 'Set link expiry and default links to internal-only.', 'Apply tighter settings per-site for sites holding PHI or cardholder data.'] },
  forwarding: { title: 'Block automatic external forwarding', where: 'Microsoft Defender → Email & collaboration → Policies → Outbound spam filter', why: 'Creating a forwarding rule is the classic persistence step after a mailbox compromise. It quietly exfiltrates mail long after the password is changed.', steps: ['Set the outbound spam filter policy to block automatic forwarding.', 'Audit existing forwarding rules and mailbox delegations across the tenant now.', 'Alert on new forwarding-rule creation.'] },
  backup: { title: 'Back up Microsoft 365 independently', where: 'Third-party backup platform', why: 'Microsoft operates on a shared responsibility model: they guarantee the service, you are responsible for your data. Retention policies are not backup, and deleted items age out permanently.', steps: ['Back up Exchange Online, SharePoint, OneDrive and Teams to a platform outside the tenant.', 'Set retention to match your regulatory obligation, not the default.', 'Test a restore. An untested backup is a hypothesis.'] },
  offboard: { title: 'Harden your offboarding process', where: 'Documented procedure', why: 'Revoking a licence does not kill an active session. Tokens can stay valid for hours or longer, which is the gap departing employees use.', steps: ['Revoke sessions and refresh tokens explicitly, not just the password.', 'Convert the mailbox to shared, or block sign-in and retain per your policy.', 'Remove the account from all groups and applications.', 'Check for forwarding rules and delegations created before departure.'] },
  phishing: { title: 'Configure anti-phishing and safe attachments', where: 'Microsoft Defender → Email & collaboration → Policies', why: 'The default anti-spam policy does not include impersonation protection. Business email compromise targets your finance staff specifically.', steps: ['Enable anti-phishing with mailbox intelligence and impersonation protection for your executives and finance team.', 'Turn on Safe Attachments and Safe Links if licensed.', 'Enable the external sender tag so staff can see at a glance what came from outside.'] },
  dns: { title: 'Authenticate your domain', where: 'Your DNS provider', why: 'SPF, DKIM and DMARC are how the rest of the world knows mail claiming to be from you actually is.', steps: ['Run our free email security checker for a specific breakdown of your current records.'], link: '/tools/email-security/' },
  training: { title: 'Run security awareness training', where: 'Defender → Attack simulation training, or a dedicated platform', why: 'Most successful intrusions start with a person rather than a system. Technical controls reduce the blast radius; training reduces the number of detonations.', steps: ['Run a baseline phishing simulation before any training, so you have a starting number.', 'Deliver short, frequent training rather than one annual session.', 'Track repeat clickers and give them targeted follow-up rather than punishment.', 'Keep completion records — most frameworks require evidence of training.'] },
};

/* ---------- payment verification ---------- */

async function sessionIsPaid(sessionId) {
  if (!sessionId) return false;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { console.error('PAYWALL_ENABLED is true but STRIPE_SECRET_KEY is not set'); return false; }

  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return false;
  const session = await res.json();
  return session.payment_status === 'paid';
}

/* ---------- handler ---------- */

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body.' }) }; }

  const { tool, findings = [], sessionId } = body;

  if (PAYWALL_ENABLED) {
    const paid = await sessionIsPaid(sessionId);
    if (!paid) {
      return { statusCode: 402, headers, body: JSON.stringify({ error: 'payment_required', message: 'This report requires a purchase.' }) };
    }
  }

  const source = tool === 'm365' ? M365_FIXES : EMAIL_FIXES;
  const ids = Array.isArray(findings) ? findings.filter(f => typeof f === 'string' && source[f]) : [];
  const sections = (ids.length ? ids : Object.keys(source)).map(id => ({ id, ...source[id] }));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ tool: tool === 'm365' ? 'm365' : 'email', free: !PAYWALL_ENABLED, sections }),
  };
};
