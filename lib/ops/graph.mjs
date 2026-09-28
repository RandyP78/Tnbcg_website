/* ============================================================
   Microsoft 365 (Entra ID) hardening operations.

   THE RULE THAT MATTERS: every Conditional Access policy created here
   is created in "enabledForReportingButNotEnforced" state, and the
   preconditions hard-fail unless a break-glass account is excluded.

   Locking a tenant out of its own directory is the classic Entra
   catastrophe. It is caused by enabling a policy that applies to All
   Users with no emergency-access exclusion, and it cannot be undone
   from inside the tenant. Report-only plus a mandatory exclusion makes
   it structurally impossible for this tool to cause it.
   ============================================================ */

import { defineOperation, RISK } from '../operation.mjs';

const REPORT_ONLY = 'enabledForReportingButNotEnforced';

/**
 * A break-glass account is a cloud-only global admin, excluded from CA,
 * used only when normal access fails. Microsoft recommends two.
 * We will not write any CA policy unless at least one is excluded.
 */
export async function findBreakGlassCandidates(ctx) {
  const admins = await ctx.graph.listGlobalAdmins();
  return admins.filter(u =>
    u.userPrincipalName?.includes('.onmicrosoft.com') &&
    u.onPremisesSyncEnabled !== true);
}

async function requireBreakGlass(ctx) {
  const candidates = await findBreakGlassCandidates(ctx);
  if (candidates.length === 0) {
    return {
      ok: false,
      reason:
        'No cloud-only emergency-access (break-glass) account found. Creating Conditional ' +
        'Access policies without one risks locking every administrator out of the tenant. ' +
        'Create a break-glass account first, then re-run.',
    };
  }
  const excluded = ctx.params?.breakGlassIds || [];
  if (excluded.length === 0) {
    return { ok: false, reason: 'Break-glass account(s) found but none selected for exclusion. Selection is required.' };
  }
  const validIds = new Set(candidates.map(c => c.id));
  const bad = excluded.filter(id => !validIds.has(id));
  if (bad.length) {
    return { ok: false, reason: `Selected exclusion account(s) are not valid break-glass candidates: ${bad.join(', ')}` };
  }
  return { ok: true };
}

/* ---------------------------------------------------------------
   Block legacy authentication.

   Legacy protocols (POP, IMAP, SMTP AUTH, older Office clients) cannot
   present an MFA challenge, so they are the standard way MFA gets
   bypassed in password-spray attacks. This is usually the single
   highest-value change in a neglected tenant.
   --------------------------------------------------------------- */
export const blockLegacyAuth = defineOperation({
  id: 'graph.ca.block_legacy_auth',
  provider: 'graph',
  title: 'Block legacy authentication (report-only)',
  rationale:
    'Legacy protocols cannot show an MFA prompt, so attackers use them to sidestep MFA ' +
    'entirely. This creates a policy to block them, in report-only mode so you can see ' +
    'exactly who would be affected before enforcing it.',
  risk: RISK.HIGH,
  scopes: ['Policy.ReadWrite.ConditionalAccess', 'Directory.Read.All'],
  reportOnly: true,

  async preconditions(ctx) {
    const bg = await requireBreakGlass(ctx);
    if (!bg.ok) return bg;
    const existing = await ctx.graph.listConditionalAccessPolicies();
    if (existing.some(p => p.displayName === POLICY_NAMES.legacyAuth)) {
      return { ok: false, reason: 'A policy with this name already exists.' };
    }
    return { ok: true };
  },

  async plan(ctx) {
    return {
      summary:
        'Create a Conditional Access policy blocking legacy authentication clients for all ' +
        'users, in REPORT-ONLY mode. Nothing is enforced until you enable it yourself.',
      before: [],
      after: [`${POLICY_NAMES.legacyAuth} (report-only, break-glass excluded)`],
    };
  },

  async apply(ctx) {
    const policy = buildLegacyAuthPolicy(ctx.params.breakGlassIds);
    const created = await ctx.graph.createConditionalAccessPolicy(policy);
    return { undo: { policyId: created.id }, detail: `Created report-only policy ${created.id}.` };
  },

  async verify(ctx) {
    const policies = await ctx.graph.listConditionalAccessPolicies();
    const p = policies.find(x => x.displayName === POLICY_NAMES.legacyAuth);
    if (!p) return { ok: false, reason: 'Policy not found after creation.' };
    if (p.state !== REPORT_ONLY) {
      return { ok: false, reason: `Policy is in state "${p.state}", expected report-only. Investigate immediately.` };
    }
    const excluded = p.conditions?.users?.excludeUsers || [];
    if (excluded.length === 0) return { ok: false, reason: 'Policy has no excluded users. Break-glass exclusion missing.' };
    return { ok: true };
  },

  async undo(ctx, undo) {
    await ctx.graph.deleteConditionalAccessPolicy(undo.policyId);
  },
});

export const POLICY_NAMES = {
  legacyAuth: 'TEKNIK — Block legacy authentication',
  adminMfa: 'TEKNIK — Require MFA for administrators',
};

export function buildLegacyAuthPolicy(excludeUsers) {
  return {
    displayName: POLICY_NAMES.legacyAuth,
    state: REPORT_ONLY,
    conditions: {
      clientAppTypes: ['exchangeActiveSync', 'other'],
      applications: { includeApplications: ['All'] },
      users: { includeUsers: ['All'], excludeUsers },
    },
    grantControls: { operator: 'OR', builtInControls: ['block'] },
  };
}

/* ---------------------------------------------------------------
   Require MFA for administrative roles.
   --------------------------------------------------------------- */
export const requireAdminMfa = defineOperation({
  id: 'graph.ca.require_admin_mfa',
  provider: 'graph',
  title: 'Require MFA for administrator roles (report-only)',
  rationale:
    'Administrative accounts are the highest-value target in the tenant. This requires ' +
    'multi-factor authentication for privileged roles, in report-only mode first.',
  risk: RISK.HIGH,
  scopes: ['Policy.ReadWrite.ConditionalAccess', 'Directory.Read.All'],
  reportOnly: true,

  async preconditions(ctx) {
    const bg = await requireBreakGlass(ctx);
    if (!bg.ok) return bg;
    const existing = await ctx.graph.listConditionalAccessPolicies();
    if (existing.some(p => p.displayName === POLICY_NAMES.adminMfa)) {
      return { ok: false, reason: 'A policy with this name already exists.' };
    }
    return { ok: true };
  },

  async plan() {
    return {
      summary: 'Create a report-only Conditional Access policy requiring MFA for privileged directory roles.',
      before: [],
      after: [`${POLICY_NAMES.adminMfa} (report-only, break-glass excluded)`],
    };
  },

  async apply(ctx) {
    const created = await ctx.graph.createConditionalAccessPolicy({
      displayName: POLICY_NAMES.adminMfa,
      state: REPORT_ONLY,
      conditions: {
        clientAppTypes: ['all'],
        applications: { includeApplications: ['All'] },
        users: {
          includeRoles: ADMIN_ROLE_TEMPLATE_IDS,
          excludeUsers: ctx.params.breakGlassIds,
        },
      },
      grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    });
    return { undo: { policyId: created.id } };
  },

  async verify(ctx) {
    const policies = await ctx.graph.listConditionalAccessPolicies();
    const p = policies.find(x => x.displayName === POLICY_NAMES.adminMfa);
    if (!p) return { ok: false, reason: 'Policy not found after creation.' };
    if (p.state !== REPORT_ONLY) return { ok: false, reason: `Unexpected state "${p.state}".` };
    return { ok: true };
  },

  async undo(ctx, undo) {
    await ctx.graph.deleteConditionalAccessPolicy(undo.policyId);
  },
});

/** Entra built-in role template ids for the roles worth protecting first. */
export const ADMIN_ROLE_TEMPLATE_IDS = [
  '62e90394-69f5-4237-9190-012177145e10', // Global Administrator
  '194ae4cb-b126-40b2-bd5b-6091b380977d', // Security Administrator
  'f28a1f50-f6e7-4571-818b-6a12f2af6b6c', // SharePoint Administrator
  '29232cdf-9323-42fd-ade2-1d097af3e4de', // Exchange Administrator
  'b1be1c3e-b65d-4f19-8427-f6fa0d97feb9', // Conditional Access Administrator
];

export const graphOperations = [blockLegacyAuth, requireAdminMfa];
