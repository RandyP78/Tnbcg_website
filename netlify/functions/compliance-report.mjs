import { sql, json, err, audit } from '../../lib/compliance/db.mjs';
import { requireUser, scopeOrg, handle } from '../../lib/compliance/auth.mjs';
import { scoreOrg } from '../../lib/compliance/data.mjs';
import { catalog } from '../../lib/compliance/catalog.mjs';

// POST /api/compliance/report            { org?, narrative?: boolean }   -> generates + stores a report snapshot
// GET  /api/compliance/report?org=        list snapshots
// GET  /api/compliance/report/:id         one snapshot (score + narrative)
export const config = { path: ['/api/compliance/report', '/api/compliance/report/:id'] };

export default handle(async (req, context) => {
  const user = await requireUser(req);
  const id = context.params?.id;
  const url = new URL(req.url);

  if (req.method === 'GET' && id) {
    const [r] = await sql`select * from reports where id = ${id}`;
    if (!r) return err('Not found', 404);
    scopeOrg(user, r.org_id);
    const [org] = await sql`select * from orgs where id = ${r.org_id}`;
    return json({ ...r, org, catalog: { version: catalog.version, frameworks: catalog.frameworks, issuer: catalog.issuer } });
  }
  if (req.method === 'GET') {
    const orgId = scopeOrg(user, url.searchParams.get('org'));
    return json(await sql`select id, generated_by, generated_at, catalog_version, narrative_model, (score->'overall') as overall from reports where org_id = ${orgId} order by generated_at desc limit 50`);
  }
  if (req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const orgId = scopeOrg(user, b.org);
    const { org, score } = await scoreOrg(orgId);
    let narrative = null, model = null, tokens = null;
    if (b.narrative && process.env.ANTHROPIC_API_KEY) {
      try { ({ narrative, model, tokens } = await generateNarrative(org, score)); }
      catch (e) { console.warn('narrative failed', e.message); narrative = null; }
    }
    const [row] = await sql`insert into reports (org_id, generated_by, catalog_version, score, narrative, narrative_model, narrative_tokens)
      values (${orgId}, ${user.email}, ${catalog.version}, ${JSON.stringify(score)}, ${narrative}, ${model}, ${tokens ? JSON.stringify(tokens) : null}) returning id, generated_at`;
    await audit({ actor: user.email, role: user.role, orgId, action: 'report.generate', target: row.id, detail: { overall: score.overall, narrative: !!narrative, tokens }, req });
    return json({ id: row.id, generated_at: row.generated_at, overall: score.overall, narrative: !!narrative, tokens }, 201);
  }
  return err('Unsupported', 405);
});

/**
 * Executive narrative via Claude. Only aggregate scores, control titles/statuses, and gap summaries are sent —
 * no file paths from PHI discovery, no evidence, no usernames. Deterministic scoring is never delegated to the model.
 */
async function generateNarrative(org, score) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
  const brief = {
    client: org.name, industry: org.industry, frameworks: score.frameworksInScope,
    overall: score.overall, technical: score.technical.score, administrative: score.administrative,
    frameworkScores: Object.fromEntries(Object.entries(score.frameworks).map(([k, v]) => [k, v.score])),
    domainScores: Object.fromEntries(Object.entries(score.domains).map(([k, v]) => [k, v.score])),
    devices: score.technical.devices.map(d => ({ host: d.hostname, score: d.score, fail: d.counts.fail, warn: d.counts.warn })),
    topGaps: score.gaps.slice(0, 15).map(g => ({ id: g.id, title: g.title, severity: g.severity, status: g.status, affectedDevices: g.affected.length, hipaa: g.frameworks.hipaa, pci: g.frameworks.pci })),
    phi: score.phi.map(p => ({ host: p.hostname, status: p.status, identifierFiles: p.identifierFiles, flaggedFiles: p.flaggedFiles, mailArchives: (p.mailArchives || []).length }))
  };
  const system = `You are a senior compliance assessor writing for ${catalog.issuer}. Write an executive summary for a HIPAA Security Rule / PCI DSS v4.0.1 workstation compliance assessment. Audience: the client's owner/practice manager and their compliance officer. Tone: formal, precise, plain English, no hype. Cite regulation sections where given. Do not invent findings — use only the data provided. Structure: (1) Overall posture in 2-3 sentences with the score and grade; (2) Most significant risks (ordered by severity) with the business consequence of each; (3) Data-at-rest exposure summary if PHI/CHD discovery flagged anything; (4) Recommended 30/60/90-day remediation priorities; (5) Closing statement on what re-assessment will demonstrate. 350-550 words. No markdown headers — use short paragraphs and, for the priorities, a plain numbered list.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 1200, system, messages: [{ role: 'user', content: `Assessment data (JSON):\n${JSON.stringify(brief)}` }] })
  });
  if (!r.ok) throw new Error(`Anthropic API ${r.status}: ${await r.text()}`);
  const out = await r.json();
  return { narrative: out.content.map(c => c.text || '').join('\n').trim(), model: out.model, tokens: { input: out.usage?.input_tokens, output: out.usage?.output_tokens } };
}
