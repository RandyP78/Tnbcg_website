/**
 * Deterministic scoring engine. Pure function — no DB, no AI — so results are reproducible and auditable.
 *
 * Effective status precedence (per device × control):
 *   1. approved device-level override  2. approved org-level override  3. agent finding
 * 'na' removes the control from the denominator. 'error' (check could not run) is excluded from the
 * denominator but surfaced as "unverified". 'warn' earns half credit.
 */
const CREDIT = { pass: 1, warn: 0.5, fail: 0 };
const ANSWER_CREDIT = { yes: 1, partial: 0.5, no: 0 };

export function computeScore({ catalog, org, devices = [], findingsByDevice = {}, answers = [], overrides = [] }) {
  const W = catalog.severityWeight;
  const cfg = catalog.scoring;
  const inScope = new Set(org?.frameworks?.length ? org.frameworks : Object.keys(catalog.frameworks));
  const applies = (c) => [...inScope].some(f => (c.frameworks?.[f] || []).length > 0);
  const controls = catalog.controls.filter(applies);
  const automated = controls.filter(c => c.type === 'automated');
  const manual = controls.filter(c => c.type === 'manual');

  const active = overrides.filter(o => !o.revoked_at && (!o.expires_at || new Date(o.expires_at) > new Date()));
  const approved = active.filter(o => o.approved);
  const pending = active.filter(o => !o.approved);
  const ovr = (controlId, deviceId) =>
    approved.find(o => o.control_id === controlId && o.device_id === deviceId) ||
    approved.find(o => o.control_id === controlId && !o.device_id) || null;
  const answerFor = Object.fromEntries(answers.filter(a => !a.superseded_at).map(a => [a.control_id, a]));

  // ---------- technical (per device)
  const deviceResults = devices.map(d => {
    const findings = Object.fromEntries((findingsByDevice[d.id] || []).map(f => [f.control_id, f]));
    let num = 0, den = 0; const counts = { pass: 0, fail: 0, warn: 0, error: 0, na: 0, unscanned: 0 };
    const perControl = {};
    for (const c of automated) {
      const o = ovr(c.id, d.id); const f = findings[c.id];
      let status, source;
      if (o) { status = o.status; source = o.device_id ? 'override:device' : 'override:org'; }
      else if (f) { status = f.status; source = 'agent'; }
      else { status = 'unscanned'; source = 'none'; }
      perControl[c.id] = { status, source, observed: f?.observed, expected: f?.expected, detail: f?.detail, override: o };
      counts[status] = (counts[status] || 0) + 1;
      if (status in CREDIT) { den += W[c.severity]; num += W[c.severity] * CREDIT[status]; }
      else if (status === 'unscanned') { den += W[c.severity]; } // never scanned = no credit
    }
    const score = den ? round(100 * num / den) : null;
    return { id: d.id, hostname: d.hostname, osName: d.os_name, lastSeen: d.last_seen, lastUser: d.last_user, score, counts, controls: perControl };
  });
  const techScores = deviceResults.map(d => d.score).filter(s => s !== null);
  const technical = techScores.length ? round(techScores.reduce((a, b) => a + b, 0) / techScores.length) : null;

  // ---------- administrative (org level)
  let aNum = 0, aDen = 0, answered = 0; const manualResults = {};
  for (const c of manual) {
    const o = ovr(c.id, null); const a = answerFor[c.id];
    let status, source;
    if (o) { status = o.status; source = 'override:org'; }
    else if (a) { status = a.answer === 'yes' ? 'pass' : a.answer === 'partial' ? 'warn' : a.answer === 'no' ? 'fail' : 'na'; source = 'answer'; }
    else { status = 'unanswered'; source = 'none'; }
    if (a) answered++;
    manualResults[c.id] = { status, source, answer: a, override: o };
    if (status in CREDIT) { aDen += W[c.severity]; aNum += W[c.severity] * CREDIT[status]; }
    else if (status === 'unanswered') { aDen += W[c.severity]; }
  }
  const administrative = aDen ? round(100 * aNum / aDen) : null;

  // ---------- org-level control rollup (worst status across devices)
  const rank = { fail: 0, unscanned: 1, unanswered: 1, warn: 2, error: 3, pass: 4, na: 5 };
  const controlRows = controls.map(c => {
    let status, byDevice = null, o = null, a = null;
    if (c.type === 'automated') {
      byDevice = { pass: [], fail: [], warn: [], error: [], na: [], unscanned: [] };
      for (const d of deviceResults) { const r = d.controls[c.id]; byDevice[r.status]?.push(d.hostname); }
      status = deviceResults.length ? Object.keys(byDevice).filter(k => byDevice[k].length).sort((x, y) => rank[x] - rank[y])[0] : 'unscanned';
      o = approved.find(x => x.control_id === c.id && !x.device_id) || null;
    } else { status = manualResults[c.id].status; o = manualResults[c.id].override; a = manualResults[c.id].answer; }
    return { id: c.id, title: c.title, domain: c.domain, type: c.type, severity: c.severity, weight: W[c.severity], frameworks: c.frameworks, status, byDevice, override: o, answer: a, remediation: c.remediation, question: c.question, evidenceHint: c.evidenceHint, description: c.description };
  });

  // ---------- per-framework & per-domain scores (pooled weights over controls, devices averaged per control)
  const groupScore = (pred) => {
    let num = 0, den = 0, n = 0;
    for (const r of controlRows.filter(pred)) {
      if (r.type === 'automated') {
        const credits = deviceResults.map(d => d.controls[r.id].status).filter(s => s !== 'na' && s !== 'error').map(s => CREDIT[s] ?? 0);
        if (!credits.length) continue;
        num += r.weight * (credits.reduce((x, y) => x + y, 0) / credits.length); den += r.weight; n++;
      } else {
        if (r.status === 'na' || r.status === 'error') continue;
        num += r.weight * (CREDIT[r.status] ?? 0); den += r.weight; n++;
      }
    }
    return { score: den ? round(100 * num / den) : null, controls: n };
  };
  const frameworks = {};
  for (const f of inScope) frameworks[f] = { name: catalog.frameworks[f]?.name, ...groupScore(r => (r.frameworks?.[f] || []).length > 0) };
  const domains = {};
  for (const dname of [...new Set(controls.map(c => c.domain))]) domains[dname] = groupScore(r => r.domain === dname);

  // ---------- overall
  let overall = null;
  if (technical !== null && administrative !== null) overall = round(cfg.technicalShare * technical + cfg.administrativeShare * administrative);
  else overall = technical ?? administrative;
  const criticalFails = controlRows.filter(r => r.severity === 'critical' && r.status === 'fail');
  let capped = false;
  if (overall !== null && criticalFails.length && overall > cfg.criticalFailCap) { overall = cfg.criticalFailCap; capped = true; }
  const grade = overall === null ? '—' : (cfg.grades.find(([min]) => overall >= min) || [0, 'F'])[1];

  // ---------- gaps
  const gaps = controlRows
    .filter(r => ['fail', 'warn', 'unanswered', 'unscanned', 'error'].includes(r.status))
    .map(r => ({ ...r, affected: r.byDevice ? [...r.byDevice.fail, ...r.byDevice.warn, ...r.byDevice.error, ...r.byDevice.unscanned] : [], priority: r.weight * (r.status === 'fail' ? 3 : r.status === 'unanswered' || r.status === 'unscanned' ? 2 : 1) * (1 + Math.log10(1 + (r.byDevice ? r.byDevice.fail.length : 0))) }))
    .sort((x, y) => y.priority - x.priority);

  // ---------- PHI summary
  const phi = deviceResults.map(d => { const f = d.controls['DATA-01']; const s = f?.detail?.stats; return s ? { hostname: d.hostname, status: f.status, ...s, top: f.detail.top || [] } : null; }).filter(Boolean);

  return {
    computedAt: new Date().toISOString(), catalogVersion: catalog.version, frameworksInScope: [...inScope],
    overall: { score: overall, grade, capped, criticalFails: criticalFails.map(r => r.id) },
    technical: { score: technical, devices: deviceResults.map(({ controls, ...rest }) => rest), deviceControls: Object.fromEntries(deviceResults.map(d => [d.id, d.controls])) },
    administrative: { score: administrative, answered, total: manual.length },
    frameworks, domains, controls: controlRows, gaps, pendingOverrides: pending, phi
  };
}
const round = (n) => Math.round(n * 10) / 10;

/** Builds a remediation PowerShell script for the given failing/warning control IDs. */
export function buildRemediationScript({ catalog, controlIds, clientName, hostname, whatIf = true }) {
  const byId = Object.fromEntries(catalog.controls.map(c => [c.id, c]));
  const lines = [
    '<#', `  TEKNIK Remediation Script — ${clientName || 'client'}${hostname ? ' / ' + hostname : ''}`,
    `  Generated ${new Date().toISOString()} from catalog ${catalog.version}`,
    '  Review every block before running. Run elevated. Use -WhatIf first (default) then -Apply.',
    '  TEKNIK (TNB Consulting Group, LLC) · helpdesk@tnbcg.com · 305-419-9992', '#>',
    'param([switch]$Apply)', '$ErrorActionPreference = "Continue"', '$log = "$env:ProgramData\\TEKNIK\\Compliance\\remediation-$(Get-Date -Format yyyyMMdd-HHmmss).log"',
    'New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null',
    'function Step($id, $title, [scriptblock]$body) {',
    '  Write-Host "`n=== $id — $title" -ForegroundColor Cyan',
    '  if (-not $Apply) { Write-Host "  [WhatIf] would run:"; Write-Host ($body.ToString().Trim() -replace "(?m)^", "    "); Add-Content $log "$id WHATIF"; return }',
    '  try { & $body; Write-Host "  OK" -ForegroundColor Green; Add-Content $log "$id OK" } catch { Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red; Add-Content $log "$id FAILED $($_.Exception.Message)" }',
    '}', '$manual = @()', ''
  ];
  for (const id of controlIds) {
    const c = byId[id]; if (!c) continue;
    const r = c.remediation || {};
    if (r.script) lines.push(`Step '${id}' '${esc(c.title)}' {`, r.script.split('\n').map(l => '  ' + l).join('\n'), '}', '');
    else lines.push(`$manual += "${id} — ${esc(c.title)}: ${esc(r.manual || r.summary || 'Manual action required')}"`, '');
  }
  lines.push('if ($manual.Count) { Write-Host "`nManual actions required:" -ForegroundColor Yellow; $manual | ForEach-Object { Write-Host "  - $_" } }',
    'Write-Host "`nLog: $log"', 'if (-not $Apply) { Write-Host "Re-run with -Apply to make changes." -ForegroundColor Yellow }');
  return lines.join('\n');
}
const esc = (s) => String(s || '').replace(/'/g, "''").replace(/"/g, '`"');
