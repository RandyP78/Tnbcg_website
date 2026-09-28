import { admin } from '@netlify/identity';

export { admin };

/**
 * Triggers Netlify Identity's password-setup / recovery e-mail.
 * Uses the public GoTrue /recover endpoint directly so this behaves identically
 * whether it runs in a function, a scheduled job, or local `netlify dev`.
 * Never throws — a failed mail must not fail the scan ingest that triggered it.
 */
export async function sendRecoveryEmail(email) {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  try {
    const r = await fetch(`${base}/.netlify/identity/recover`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email })
    });
    if (!r.ok) console.warn('identity recover mail failed', r.status, await r.text());
    return r.ok;
  } catch (e) { console.warn('identity recover mail error', e.message); return false; }
}

/** Finds an Identity user by e-mail (case-insensitive), or null. */
export async function findUserByEmail(email) {
  const target = String(email).toLowerCase();
  const users = await admin.listUsers({ perPage: 1000 }).catch(() => []);
  return users.find(u => (u.email || '').toLowerCase() === target) || null;
}
