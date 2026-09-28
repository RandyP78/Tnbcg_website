/* ============================================================
   TEKNIK — Netlify Identity (GoTrue) client, same-origin.

   NO THIRD-PARTY SCRIPT. The stock identity widget is served from
   identity.netlify.com, which this site's Content-Security-Policy
   deliberately forbids (script-src 'self'). Rather than punch a hole
   in the CSP of a security company's own site, this talks to GoTrue
   directly at /.netlify/identity — same origin, no external code.

   Endpoints used (GoTrue REST):
     POST /token    grant_type=password | refresh_token   (form-encoded)
     GET  /user     Bearer                                 -> profile + app_metadata.roles
     POST /recover  {email}                                -> password-reset mail
     POST /verify   {type:'signup'|'recovery', token, password?}
     POST /logout   Bearer
   ============================================================ */
(function () {
  const BASE = '/.netlify/identity';
  const KEY = 'tk_identity_session';
  let session = null;

  try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { session = null; }

  const save = (s) => {
    session = s;
    try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* private mode */ }
  };

  const store = (tok) => {
    if (!tok || !tok.access_token) throw new Error(tok?.error_description || tok?.msg || 'Sign-in failed');
    save({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: Date.now() + (tok.expires_in || 3600) * 1000 });
    return session;
  };

  async function post(path, body, form) {
    const r = await fetch(BASE + path, {
      method: 'POST',
      headers: form ? { 'content-type': 'application/x-www-form-urlencoded' } : { 'content-type': 'application/json' },
      body: form ? new URLSearchParams(body).toString() : JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error_description || data.msg || data.error || `Request failed (${r.status})`);
    return data;
  }

  const Identity = {
    get session() { return session; },
    isAuthenticated() { return !!session?.access_token; },

    /** Valid access token, refreshed if it expires within 60 s. Null when signed out. */
    async token() {
      if (!session) return null;
      if (session.expires_at - Date.now() > 60000) return session.access_token;
      try { store(await post('/token', { grant_type: 'refresh_token', refresh_token: session.refresh_token }, true)); }
      catch { save(null); return null; }
      return session.access_token;
    },

    async login(email, password) {
      store(await post('/token', { grant_type: 'password', username: email, password }, true));
      return this.user();
    },

    async user() {
      const t = await this.token();
      if (!t) return null;
      const r = await fetch(BASE + '/user', { headers: { authorization: 'Bearer ' + t } });
      if (!r.ok) { if (r.status === 401) save(null); return null; }
      const u = await r.json();
      return { id: u.id, email: u.email, roles: u.app_metadata?.roles || [], orgId: u.app_metadata?.org_id || null, metadata: u.user_metadata || {} };
    },

    async logout() {
      const t = session?.access_token;
      save(null);
      if (t) { try { await fetch(BASE + '/logout', { method: 'POST', headers: { authorization: 'Bearer ' + t } }); } catch { /* ignore */ } }
    },

    /** Sends the password-reset e-mail. Always resolves — never reveals whether the address exists. */
    async requestRecovery(email) { try { await post('/recover', { email }); } catch { /* silent by design */ } return true; },

    /** Set (or reset) the password using an invite or recovery token from the e-mail link. */
    async completeInvite(token, password) { store(await post('/verify', { type: 'signup', token, password })); return this.user(); },
    async completeRecovery(token, password) {
      store(await post('/verify', { type: 'recovery', token }));
      const t = await this.token();
      const r = await fetch(BASE + '/user', { method: 'PUT', headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
      if (!r.ok) throw new Error('Could not set the new password. Request a fresh reset link.');
      return this.user();
    },

    /** Reads #invite_token= / #recovery_token= / #error_description= from the e-mail link and clears the hash. */
    readHash() {
      const h = location.hash.replace(/^#\/?/, '');
      if (!h) return null;
      const p = new URLSearchParams(h);
      const out = p.get('invite_token') ? { type: 'invite', token: p.get('invite_token') }
        : p.get('recovery_token') ? { type: 'recovery', token: p.get('recovery_token') }
          : p.get('error_description') ? { type: 'error', message: p.get('error_description') } : null;
      if (out) history.replaceState(null, '', location.pathname + location.search);
      return out;
    }
  };

  window.TeknikIdentity = Identity;
})();
