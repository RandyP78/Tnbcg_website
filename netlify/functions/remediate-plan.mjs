/* Turns a signed snapshot into an ordered, dry-run plan.
 *
 * Takes the snapshot from remediate-snapshot rather than reading the
 * tenant again, so this function does only one slow thing (the Claude
 * call) and stays inside the runtime limit.
 *
 * Writes nothing. Every proposed step is dry-run through the executor so
 * the customer sees real before/after values, and blocked ones say why. */

import { unseal, readCookie, signPlan, verifySnapshot } from '../../lib/session.mjs';
import { createGraphClient } from '../../lib/providers/graph.mjs';
import { planRemediation } from '../../lib/planner.mjs';
import { planOperations } from '../../lib/executor.mjs';
import { checkRate } from '../../lib/ratelimit.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const cookie = readCookie(event.headers || {});
  const session = unseal(cookie);
  if (!session || session.stage !== 'ready') {
    return json(401, { error: 'Not signed in, or the session has expired. Sign in again.' });
  }

  // Every call here spends money on the Anthropic API.
  const rate = checkRate(`plan:${(cookie || '').slice(0, 32)}`, { limit: 10, windowMs: 3600000 });
  if (!rate.ok) {
    return json(429, { error: `Too many planning requests. Try again in ${rate.retryAfterMinutes} minutes.` });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request body.' }); }

  const snapshot = verifySnapshot(body.snapshotToken);
  if (!snapshot) return json(400, { error: 'Snapshot missing, altered, or expired. Re-run the scan.' });

  try {
    const ctx = {
      graph: createGraphClient({ accessToken: session.accessToken }),
      params: { breakGlassIds: body.breakGlassIds || [] },
    };

    // Claude is offered only the operations runnable for this run.
    const proposal = await planRemediation(snapshot, { ctx });
    const planned = await planOperations(proposal.operations.map(o => o.id), ctx);
    const runnable = planned.filter(p => p.outcome === 'planned').map(p => p.id);

    return json(200, {
      summary: proposal.summary,
      warnings: proposal.warnings,
      steps: planned.map(p => ({
        ...p,
        why: proposal.operations.find(o => o.id === p.id)?.why || '',
      })),
      planToken: signPlan(runnable),
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
