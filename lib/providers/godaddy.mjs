/* GoDaddy Domains API client.

   NOTE ON ACCESS: GoDaddy restricts Domains API access by account tier.
   Confirm the account qualifies before relying on this in production —
   a non-qualifying account returns 403 ACCESS_DENIED on every call, and
   the failure looks like a credentials problem rather than an
   entitlement one.

   Auth is a static key/secret pair, so it identifies TEKNIK, not the
   customer. That means the customer's domain must live in an account
   you control, or they must supply their own key. Do not silently
   assume the former. */

const BASE = process.env.GODADDY_API_BASE || 'https://api.godaddy.com/v1';

export function createGoDaddyClient({
  apiKey = process.env.GODADDY_API_KEY,
  apiSecret = process.env.GODADDY_API_SECRET,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey || !apiSecret) throw new Error('GoDaddy API credentials are not configured.');
  const headers = {
    Authorization: `sso-key ${apiKey}:${apiSecret}`,
    'Content-Type': 'application/json',
  };

  async function call(path, init = {}) {
    const res = await fetchImpl(`${BASE}${path}`, { ...init, headers: { ...headers, ...init.headers } });
    if (res.status === 403) {
      throw new Error('GoDaddy returned 403. This is usually an API entitlement problem, not a bad key.');
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`GoDaddy ${init.method || 'GET'} ${path} failed: ${res.status} ${detail.slice(0, 200)}`);
    }
    return res.status === 204 ? null : res.json();
  }

  return {
    /** Flat list of records shaped like the mock: {type,name,data,ttl} */
    async listRecords(domain) {
      const records = await call(`/domains/${encodeURIComponent(domain)}/records`);
      return (records || []).map(r => ({
        type: r.type, name: r.name, data: r.data, ttl: r.ttl,
      }));
    },

    /** Replaces the entire record set for one type+name. */
    async replaceRecords(domain, type, name, records) {
      const body = records.map(r => ({ data: r.data, ttl: r.ttl || 3600 }));
      // GoDaddy has no delete verb; an empty array clears the set.
      await call(
        `/domains/${encodeURIComponent(domain)}/records/${type}/${encodeURIComponent(name)}`,
        { method: 'PUT', body: JSON.stringify(body) },
      );
    },
  };
}
