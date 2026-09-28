// Renders admin portal, client portal and report with stubbed API + identity; screenshots to tests/out/.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const root = new URL('../compliance/', import.meta.url).pathname;
const fx = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url)));

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let p = u.pathname;
  if (p.startsWith('/compliance/')) p = p.slice('/compliance/'.length); else { res.writeHead(404); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  try { const f = readFileSync(path.join(root, p)); res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.json') ? 'application/json' : 'text/html' }); res.end(f); } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = srv.address().port;
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' + (process.env.PW_EXE || '') });
let errors = [];
async function page(url, mode) {
  const pg = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  pg.on('pageerror', e => errors.push(`${mode}: ${e.message}`)); pg.on('console', m => { if (m.type() === 'error') errors.push(`${mode} console: ${m.text()}`); });
  await pg.addInitScript(() => { try { localStorage.setItem('tk_identity_session', JSON.stringify({ access_token: 'stub', refresh_token: 'stub', expires_at: Date.now() + 3600000 })); } catch {} });
  await pg.route('**/.netlify/identity/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/user')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'u1', email: mode === 'client' ? 'office@sunrisepeds.example' : 'randy.pena@tnbcg.com', app_metadata: { roles: mode === 'client' ? ['client'] : ['admin'], org_id: 'org-1' }, user_metadata: {} }) });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ access_token: 'stub', refresh_token: 'stub', expires_in: 3600 }) });
  });
  await pg.route('**/api/compliance/**', r => {
    const u = new URL(r.request().url()); const p = u.pathname.replace('/api/compliance', '');
    const j = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/catalog') return j(fx.catalog); if (p === '/orgs') return j(fx.orgs); if (p === '/dashboard') return j(mode === 'client' ? { ...fx.dashboard, user: { email: 'office@sunrisepeds.example', role: 'client' } } : fx.dashboard);
    if (p.startsWith('/report/')) return j(fx.report); if (p === '/report') return j([{ id: fx.report.id, generated_at: fx.report.generated_at, generated_by: 'randy', overall: fx.report.score.overall }]);
    if (p.endsWith('/users')) return j([{ email: 'office@sunrisepeds.example', role: 'client', last_login: null }]); if (p.endsWith('/audit')) return j([{ at: new Date().toISOString(), actor: 'agent:FRONTDESK-01', actor_role: 'agent', action: 'scan.ingest', target: 's-d1', detail: { findings: 63 } }]);
    return j({});
  });
  await pg.goto(`http://localhost:${port}${url}`); await pg.waitForTimeout(600); return pg;
}
const admin = await page('/compliance/admin/', 'admin');
for (const tab of ['overview', 'devices', 'gaps', 'assessment', 'evidence', 'overrides', 'reports', 'phi', 'admin', 'audit']) {
  await admin.click(`[data-tab="${tab}"]`); await admin.waitForTimeout(250);
  await admin.screenshot({ path: new URL(`./out/admin-${tab}.png`, import.meta.url).pathname, fullPage: tab === 'overview' || tab === 'gaps' });
  if (tab === 'devices') { await admin.click('[data-dev="d2"]'); await admin.waitForTimeout(250); await admin.screenshot({ path: new URL('./out/admin-device.png', import.meta.url).pathname, fullPage: true }); await admin.click('[data-fix="ENC-01"]'); await admin.waitForTimeout(200); await admin.screenshot({ path: new URL('./out/admin-modal.png', import.meta.url).pathname }); await admin.click('#mClose'); }
}
const client = await page('/compliance/portal/', 'client');
await client.screenshot({ path: new URL('./out/client-overview.png', import.meta.url).pathname, fullPage: true });
await client.click('[data-tab="assessment"]'); await client.waitForTimeout(250); await client.screenshot({ path: new URL('./out/client-assessment.png', import.meta.url).pathname });
const rep = await page('/compliance/report/?id=' + fx.report.id, 'report');
await rep.waitForTimeout(500);
await rep.screenshot({ path: new URL('./out/report-full.png', import.meta.url).pathname, fullPage: true });
await rep.pdf({ path: new URL('./out/report-sample.pdf', import.meta.url).pathname, format: 'Letter', printBackground: true });
await browser.close(); srv.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'UI smoke OK, no page errors');
