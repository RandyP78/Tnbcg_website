import { json, err, audit } from '../../lib/compliance/db.mjs';
import { requireUser, handle } from '../../lib/compliance/auth.mjs';
import { controlsById, catalog } from '../../lib/compliance/catalog.mjs';

// POST /api/compliance/explain  { control_id, observed?, question? }
// On-demand "explain this finding / tailor this fix" for a single control. Optional — needs ANTHROPIC_API_KEY.
// Sends only the catalog control text and the observed value string (which the agent already redacts).
export const config = { path: '/api/compliance/explain' };

export default handle(async (req) => {
  if (req.method !== 'POST') return err('POST only', 405);
  const user = await requireUser(req);
  if (!process.env.ANTHROPIC_API_KEY) return err('AI explanations are not enabled on this site', 503);
  const b = await req.json();
  const c = controlsById[b.control_id]; if (!c) return err('Unknown control');
  const model = process.env.ANTHROPIC_MODEL_FAST || 'claude-haiku-4-5';
  const system = `You are a compliance analyst at ${catalog.issuer}, an MSP. Explain a single workstation compliance control to a ${user.isAdmin ? 'technician who will remediate it' : 'non-technical practice manager'}. Be concrete and brief (120-220 words). Cover: why it matters (with the regulation cites given), what the observed value means, and ${user.isAdmin ? 'the exact remediation steps or PowerShell, plus rollback/impact notes' : 'what the client should expect TEKNIK to do and whether staff will notice anything'}. Never invent regulation text.`;
  const content = `Control: ${JSON.stringify({ id: c.id, title: c.title, description: c.description, severity: c.severity, frameworks: c.frameworks, remediation: c.remediation })}\nObserved: ${String(b.observed || 'n/a').slice(0, 600)}\n${b.question ? 'Question: ' + String(b.question).slice(0, 400) : ''}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 500, system, messages: [{ role: 'user', content }] })
  });
  if (!r.ok) return err(`AI request failed (${r.status})`, 502);
  const out = await r.json();
  await audit({ actor: user.email, role: user.role, orgId: user.orgId, action: 'explain', target: c.id, detail: { tokens: out.usage }, req });
  return json({ text: out.content.map(x => x.text || '').join('\n').trim(), model: out.model, tokens: out.usage });
});
