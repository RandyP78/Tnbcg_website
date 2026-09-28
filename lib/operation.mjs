/* ============================================================
   TEKNIK remediation engine — the operation contract.

   Every change this system can make to a customer's system is an
   Operation. There is no other path to a write. The planner (which is
   an LLM) may only choose operations from this catalogue by id; it can
   never author an API payload. See lib/planner.js for why.

   An Operation must implement all five phases:

     preconditions  Is it safe and sensible to run this right now?
     plan           What exactly would change? Human-readable, no writes.
     apply          Make the change. Returns undo data.
     verify         Independently confirm the change took effect.
     undo           Reverse it using the data apply returned.

   An operation without a working undo does not ship.
   ============================================================ */

export const RISK = {
  LOW: 'low',        // additive, reversible, no user-facing impact
  MEDIUM: 'medium',  // changes behaviour, reversible
  HIGH: 'high',      // could lock people out if wrong
};

export const OUTCOME = {
  SKIPPED: 'skipped',
  BLOCKED: 'blocked',       // preconditions refused
  PLANNED: 'planned',       // dry run only
  APPLIED: 'applied',
  VERIFY_FAILED: 'verify_failed',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back',
};

/**
 * @typedef {Object} Operation
 * @property {string}  id            stable identifier, referenced by the planner
 * @property {string}  provider      'godaddy' | 'graph'
 * @property {string}  title         short human label
 * @property {string}  rationale     why this matters, in plain English
 * @property {string}  risk          one of RISK
 * @property {string[]} scopes       permissions required
 * @property {boolean} [reportOnly]  true if the op deliberately lands in a non-enforcing state
 * @property {(ctx) => Promise<{ok: boolean, reason?: string}>} preconditions
 * @property {(ctx) => Promise<{summary: string, before: any, after: any}>} plan
 * @property {(ctx) => Promise<{undo: any, detail?: string}>} apply
 * @property {(ctx) => Promise<{ok: boolean, reason?: string}>} verify
 * @property {(ctx, undo) => Promise<void>} undo
 */

export function defineOperation(op) {
  const required = ['id', 'provider', 'title', 'rationale', 'risk', 'scopes',
    'preconditions', 'plan', 'apply', 'verify', 'undo'];
  for (const k of required) {
    if (op[k] === undefined) {
      throw new Error(`Operation "${op.id || '?'}" is missing required field: ${k}`);
    }
  }
  if (!Object.values(RISK).includes(op.risk)) {
    throw new Error(`Operation "${op.id}" has invalid risk: ${op.risk}`);
  }
  return Object.freeze(op);
}
