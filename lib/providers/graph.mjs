/* Microsoft Graph client, delegated auth.

   Takes an access token obtained through the customer's own admin
   consent. Holds no credentials of its own and cannot refresh — when
   the token expires the run ends. That is deliberate; see lib/session.js. */

const GRAPH = process.env.GRAPH_BASE || 'https://graph.microsoft.com/v1.0';
const GLOBAL_ADMIN_TEMPLATE = '62e90394-69f5-4237-9190-012177145e10';

export function createGraphClient({ accessToken, fetchImpl = fetch } = {}) {
  if (!accessToken) throw new Error('No Graph access token supplied.');

  async function call(path, init = {}) {
    const res = await fetchImpl(path.startsWith('http') ? path : `${GRAPH}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (res.status === 401) throw new Error('Graph token expired or was revoked. The customer must sign in again.');
    if (res.status === 403) throw new Error('Graph returned 403. Consent was granted for fewer scopes than this operation needs.');
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Graph ${init.method || 'GET'} ${path} failed: ${res.status} ${detail.slice(0, 300)}`);
    }
    return res.status === 204 ? null : res.json();
  }

  /** Follows @odata.nextLink. Graph pages aggressively and a partial
      admin list would silently defeat the break-glass check. */
  async function callAll(path) {
    const out = [];
    let next = path;
    let guard = 0;
    while (next && guard++ < 50) {
      const page = await call(next);
      out.push(...(page.value || []));
      next = page['@odata.nextLink'] || null;
    }
    return out;
  }

  return {
    async listGlobalAdmins() {
      const roles = await callAll('/directoryRoles');
      const ga = roles.find(r => r.roleTemplateId === GLOBAL_ADMIN_TEMPLATE);
      if (!ga) return []; // role not activated in this tenant
      const members = await callAll(`/directoryRoles/${ga.id}/members`);
      const users = members.filter(m => m['@odata.type'] === '#microsoft.graph.user');
      // onPremisesSyncEnabled is not returned by the members expansion,
      // so fetch it per user — it is the field that distinguishes a
      // genuine cloud-only break-glass account from a synced admin.
      const detailed = [];
      for (const u of users) {
        try {
          const full = await call(`/users/${u.id}?$select=id,userPrincipalName,onPremisesSyncEnabled,accountEnabled`);
          if (full.accountEnabled !== false) detailed.push(full);
        } catch {
          // If we cannot confirm a user's sync status, exclude them from
          // break-glass candidacy rather than assume they qualify.
        }
      }
      return detailed;
    },

    async listConditionalAccessPolicies() {
      return callAll('/identity/conditionalAccess/policies');
    },

    async createConditionalAccessPolicy(policy) {
      return call('/identity/conditionalAccess/policies', {
        method: 'POST', body: JSON.stringify(policy),
      });
    },

    async deleteConditionalAccessPolicy(id) {
      await call(`/identity/conditionalAccess/policies/${id}`, { method: 'DELETE' });
    },

    /** Read-only snapshot handed to the planner. Treated as untrusted. */
    async snapshot() {
      const [org, policies, admins] = await Promise.all([
        call('/organization').catch(() => ({ value: [] })),
        this.listConditionalAccessPolicies().catch(() => []),
        this.listGlobalAdmins().catch(() => []),
      ]);
      return {
        tenantDisplayName: org.value?.[0]?.displayName || null,
        conditionalAccessPolicies: policies.map(p => ({
          displayName: p.displayName, state: p.state,
        })),
        globalAdminCount: admins.length,
        cloudOnlyAdminCount: admins.filter(a => a.onPremisesSyncEnabled !== true).length,
      };
    },
  };
}
