/* Applies ONE operation. One per request, because Netlify's standard
   functions time out at 10 seconds and because the customer approved
   each item individually. */

import { unseal, readCookie, verifyPlan } from '../../lib/session.mjs';
import { createGraphClient } from '../../lib/providers/graph.mjs';
import { applyOperation, createAudit } from '../../lib/executor.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const session = unseal(readCookie(event.headers || {}));
  if (!session || session.stage !== 'ready') {
    return json(401, { error: 'Session expired. Sign in again.' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request body.' }); }

  const { id, planToken, breakGlassIds } = body;
  if (!id) return json(400, { error: 'No operation id supplied.' });

  // The signed plan is the authorisation. A caller cannot invent an
  // operation id and have it run, even with a valid session cookie.
  const plan = verifyPlan(planToken);
  if (!plan) return json(400, { error: 'Plan token missing, altered, or expired. Re-run the plan.' });
  if (!plan.ids.includes(id)) return json(403, { error: 'That operation was not part of the approved plan.' });

  const audit = createAudit();
  try {
    const ctx = {
      graph: createGraphClient({ accessToken: session.accessToken }),
      params: { breakGlassIds: breakGlassIds || [] },
      audit,
    };
    const result = await applyOperation(id, ctx, { approvedIds: plan.ids });
    return json(200, { ...result, audit: audit.all() });
  } catch (err) {
    return json(502, { error: err.message, audit: audit.all() });
  }
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});
