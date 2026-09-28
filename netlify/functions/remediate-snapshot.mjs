/* Reads the tenant and returns a snapshot. No AI, no writes.
 *
 * This is split out from remediate-plan deliberately. Collecting the
 * snapshot is several paginated Graph calls plus one lookup per global
 * admin (needed for the break-glass check, since onPremisesSyncEnabled
 * is absent from the members expansion). Doing that AND a Claude call
 * inside one function reliably exceeded Netlify's 10-second limit on
 * any tenant with a realistic number of admins.
 *
 * The snapshot is returned to the browser, which passes it back to
 * remediate-plan. It is signed so it cannot be forged on the way. */

import { unseal, readCookie, signSnapshot } from '../../lib/session.mjs';
import { createGraphClient } from '../../lib/providers/graph.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const session = unseal(readCookie(event.headers || {}));
  if (!session || session.stage !== 'ready') {
    return json(401, { error: 'Not signed in, or the session has expired. Sign in again.' });
  }

  try {
    const graph = createGraphClient({ accessToken: session.accessToken });
    const snapshot = await graph.snapshot();
    const admins = await graph.listGlobalAdmins();

    // Surface break-glass candidates so the customer can pick which to
    // exclude. Nothing about Conditional Access can proceed without one.
    const breakGlassCandidates = admins
      .filter(a => a.onPremisesSyncEnabled !== true &&
        a.userPrincipalName?.includes('.onmicrosoft.com'))
      .map(a => ({ id: a.id, userPrincipalName: a.userPrincipalName }));

    return json(200, {
      snapshot,
      breakGlassCandidates,
      providers: ['graph'],
      snapshotToken: signSnapshot(snapshot),
    });
  } catch (err) {
    return json(502, { error: err.message });
  }
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});
