/* ============================================================
   TEKNIK — admin console gate (edge)

   THE GATE LIVES HERE, BEFORE THE HTML IS SERVED. The admin console
   markup never reaches a browser that has not presented the shared
   admin password. A hidden div or a localStorage flag would be
   bypassed in seconds, and the API is separately protected anyway —
   but the page itself should not be readable either.

   Two independent factors guard the console:
     1. this password  -> a signed, HttpOnly, 12-hour cookie
     2. Netlify Identity login carrying the `admin` role, verified
        server-side on every /api/compliance/* call

   Env: TEKNIK_ADMIN_GATE_PASSWORD  (also the HMAC key, so rotating the
   password immediately invalidates every outstanding gate cookie)

   FAILS CLOSED: with no password configured, the console is refused.
   Keep in sync with lib/compliance/gate.mjs (the Node twin).
   ============================================================ */

export const config = { path: '/compliance/admin/*' };

const COOKIE = 'tk_admin_gate';
const enc = new TextEncoder();

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(exp, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${exp}.${b64url(await crypto.subtle.sign('HMAC', key, enc.encode(String(exp))))}`;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function valid(value, secret) {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return false;
  const exp = Number(value.slice(0, dot));
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return safeEqual(value, await sign(exp, secret));
}

export default async (request) => {
  const secret = Netlify.env.get('TEKNIK_ADMIN_GATE_PASSWORD');
  if (!secret) return page(notConfigured, 503);

  const cookies = request.headers.get('cookie') || '';
  let token = null;
  for (const part of cookies.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) token = decodeURIComponent(part.slice(i + 1).trim());
  }
  if (await valid(token, secret)) return; // pass through to the static admin console

  return page(gateForm, 401);
};

const page = (body, status) => new Response(body, {
  status,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer'
  }
});

const shell = (inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Restricted — TEKNIK</title><link rel="icon" href="/assets/favicon.ico">
<style>
:root{--navy:#0b1f3a;--teal:#0aa6a6;--teal-2:#087f7f;--ink:#1a2233;--muted:#5b6678;--line:#dde3ea}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1f3a;
font-family:"Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);padding:20px}
.box{background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.35);padding:34px;width:100%;max-width:420px}
.brand{letter-spacing:.2em;font-weight:800;color:var(--navy);font-size:1.2rem}
.brand small{display:block;letter-spacing:.04em;font-weight:400;font-size:.72rem;color:var(--muted);margin-top:2px}
h1{font-size:1.05rem;margin:22px 0 6px}p{color:var(--muted);font-size:.88rem;margin:0 0 18px;line-height:1.5}
label{display:block;font-size:.8rem;font-weight:600;margin-bottom:6px}
input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;font:inherit}
button{width:100%;margin-top:14px;background:var(--teal);color:#fff;border:0;border-radius:8px;padding:11px;font:inherit;font-weight:600;cursor:pointer}
button:hover{background:var(--teal-2)}button:disabled{opacity:.55;cursor:default}
.err{color:#c62828;font-size:.85rem;margin-top:12px;min-height:1.1em}
.foot{margin-top:22px;font-size:.75rem;color:var(--muted);border-top:1px solid var(--line);padding-top:12px}
</style></head><body><div class="box"><div class="brand">TEKNIK<small>WHERE SOLUTIONS CONNECT</small></div>${inner}</div></body></html>`;

const gateForm = shell(`<h1>Restricted area</h1>
<p>The compliance admin console requires the TEKNIK access password, then a staff sign-in.</p>
<form id="f" autocomplete="off"><label for="p">Access password</label>
<input id="p" type="password" autocomplete="current-password" autofocus required>
<button type="submit">Continue</button></form><div class="err" id="e"></div>
<div class="foot">Unauthorized access is prohibited and logged. TNB Consulting Group, LLC · helpdesk@tnbcg.com</div>
<script>
const f=document.getElementById('f'),e=document.getElementById('e'),b=f.querySelector('button');
f.addEventListener('submit',async ev=>{ev.preventDefault();b.disabled=true;e.textContent='';
try{const r=await fetch('/api/compliance/admin-gate',{method:'POST',headers:{'content-type':'application/json'},
body:JSON.stringify({password:document.getElementById('p').value})});
if(r.ok){location.reload();return;}
const d=await r.json().catch(()=>({}));e.textContent=d.error||'Incorrect password.';}
catch(err){e.textContent='Network error. Try again.';}
b.disabled=false;document.getElementById('p').select();});
</script>`);

const notConfigured = shell(`<h1>Console not configured</h1>
<p>Set <code>TEKNIK_ADMIN_GATE_PASSWORD</code> in the Netlify site environment variables and redeploy.
Until it is set, the admin console stays closed.</p>
<div class="foot">TNB Consulting Group, LLC</div>`);
