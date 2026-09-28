/* ============================================================
   The executor.

   Single entry point for every change. Enforces, in order:

     1. the operation id is in the registry (never trust a caller)
     2. preconditions pass
     3. a dry-run plan is produced
     4. the plan was explicitly approved for THIS operation id
     5. apply
     6. verify — and if verification fails, roll back immediately

   The approval set is passed in per run. An operation that was planned
   but not approved cannot execute. There is no flag to skip this.
   ============================================================ */

import { OUTCOME } from './operation.mjs';
import { dnsOperations } from './ops/dns.mjs';
import { graphOperations } from './ops/graph.mjs';

export const REGISTRY = new Map(
  [...dnsOperations, ...graphOperations].map(op => [op.id, op]),
);

export function getOperation(id) {
  return REGISTRY.get(id) || null;
}

/**
 * Which providers does this run actually have a client for?
 * A run against Microsoft 365 alone has no DNS client, and offering the
 * planner a DNS operation it cannot execute produces a customer-facing
 * error instead of a clean "not applicable".
 */
export function availableProviders(ctx = {}) {
  const providers = [];
  if (ctx.dns && typeof ctx.dns.listRecords === 'function') providers.push('godaddy');
  if (ctx.graph && typeof ctx.graph.listConditionalAccessPolicies === 'function') providers.push('graph');
  return providers;
}

/**
 * @param {object} [ctx] when supplied, only operations whose provider is
 *   connected for this run are returned.
 */
export function catalogue(ctx) {
  const allowed = ctx ? new Set(availableProviders(ctx)) : null;
  return [...REGISTRY.values()]
    .filter(op => !allowed || allowed.has(op.provider))
    .map(op => ({
      id: op.id,
      provider: op.provider,
      title: op.title,
      rationale: op.rationale,
      risk: op.risk,
      reportOnly: Boolean(op.reportOnly),
    }));
}

/**
 * Dry run. Produces the plan the customer will approve. Never writes.
 */
export async function planOperations(ids, ctx) {
  const connected = new Set(availableProviders(ctx));
  const results = [];
  for (const id of ids) {
    const op = getOperation(id);
    if (!op) {
      results.push({ id, outcome: OUTCOME.BLOCKED, reason: 'Unknown operation id.' });
      continue;
    }
    // Without a client for this operation's provider we cannot even read
    // current state. Skip cleanly rather than letting the precondition
    // throw a TypeError that would surface to the customer.
    if (!connected.has(op.provider)) {
      results.push({
        id, title: op.title, outcome: OUTCOME.SKIPPED,
        reason: `Not applicable: no ${op.provider} connection for this run.`,
      });
      continue;
    }
    try {
      const pre = await op.preconditions(ctx);
      if (!pre.ok) {
        results.push({ id, title: op.title, outcome: OUTCOME.BLOCKED, reason: pre.reason });
        continue;
      }
      const plan = await op.plan(ctx);
      results.push({
        id, title: op.title, risk: op.risk, reportOnly: Boolean(op.reportOnly),
        outcome: OUTCOME.PLANNED, ...plan,
      });
    } catch (err) {
      results.push({ id, title: op.title, outcome: OUTCOME.FAILED, reason: err.message });
    }
  }
  return results;
}

/**
 * Apply one operation. Requires explicit approval of that exact id.
 *
 * One operation per call, deliberately: Netlify's standard functions
 * time out at 10 seconds, and per-item execution matches the per-item
 * approval the customer already gave.
 */
export async function applyOperation(id, ctx, { approvedIds }) {
  const op = getOperation(id);
  if (!op) return { id, outcome: OUTCOME.BLOCKED, reason: 'Unknown operation id.' };

  if (!availableProviders(ctx).includes(op.provider)) {
    return { id, title: op.title, outcome: OUTCOME.BLOCKED, reason: `No ${op.provider} connection for this run.` };
  }

  if (!Array.isArray(approvedIds) || !approvedIds.includes(id)) {
    return { id, outcome: OUTCOME.BLOCKED, reason: 'Operation was not approved by the customer.' };
  }

  // Re-check preconditions at apply time. State may have changed between
  // planning and approval, and the plan may be minutes old.
  const pre = await op.preconditions(ctx);
  if (!pre.ok) return { id, title: op.title, outcome: OUTCOME.BLOCKED, reason: pre.reason };

  let undoData;
  try {
    const applied = await op.apply(ctx);
    undoData = applied.undo;
    ctx.audit?.record({ id, phase: 'apply', undo: undoData, detail: applied.detail });
  } catch (err) {
    return { id, title: op.title, outcome: OUTCOME.FAILED, reason: err.message };
  }

  let verification;
  try {
    verification = await op.verify(ctx);
  } catch (err) {
    verification = { ok: false, reason: `Verification threw: ${err.message}` };
  }

  if (!verification.ok) {
    // Verification failing means we are not sure what state the system is
    // in. Roll back rather than leave it ambiguous.
    try {
      await op.undo(ctx, undoData);
      ctx.audit?.record({ id, phase: 'rollback', reason: verification.reason });
      return {
        id, title: op.title, outcome: OUTCOME.ROLLED_BACK,
        reason: `Verification failed (${verification.reason}); change was rolled back.`,
      };
    } catch (err) {
      return {
        id, title: op.title, outcome: OUTCOME.VERIFY_FAILED,
        reason: `Verification failed (${verification.reason}) AND rollback failed (${err.message}). Manual intervention required.`,
        undo: undoData,
      };
    }
  }

  return { id, title: op.title, outcome: OUTCOME.APPLIED, undo: undoData };
}

/** Reverse a previously applied operation using its recorded undo data. */
export async function rollbackOperation(id, ctx, undoData) {
  const op = getOperation(id);
  if (!op) throw new Error(`Unknown operation id: ${id}`);
  await op.undo(ctx, undoData);
  ctx.audit?.record({ id, phase: 'manual_rollback' });
  return { id, outcome: OUTCOME.ROLLED_BACK };
}

/** Minimal in-memory audit trail; swap for durable storage in production. */
export function createAudit() {
  const entries = [];
  return {
    record(e) { entries.push({ ...e, at: new Date().toISOString() }); },
    all() { return [...entries]; },
  };
}
