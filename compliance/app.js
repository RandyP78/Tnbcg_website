/* TEKNIK Compliance Portal — shared client/admin application (no build step, no framework).
   mount('client') or mount('admin') from the page. Auth: Netlify Identity widget. */
(function () {
  const API = '/api/compliance';
  const $ = (s, r = document) => r.querySelector(s);
  const h = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (d) => d ? new Date(d).toLocaleString() : '—';
  const fmtDay = (d) => d ? new Date(d).toLocaleDateString() : '—';
  const S = { mode: 'client', user: null, me: null, orgs: [], orgId: null, data: null, catalog: null, tab: 'overview', device: null };

  // ---------------------------------------------------------------- auth + api
  const jwt = () => window.TeknikIdentity.token();
  async function api(path, opts = {}) {
    const t = await jwt(); if (!t) throw new Error('Not signed in');
    const headers = Object.assign({ authorization: 'Bearer ' + t }, opts.headers || {});
    if (opts.json) { headers['content-type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
    const r = await fetch(API + path, { ...opts, headers });
    if (opts.raw) return r;
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (body.gate) {
        // The access-password form is served by the edge function on /compliance/admin/* only.
        // Reloading any other path would spin forever, so bounce there — and only once, so a
        // gate that keeps refusing surfaces as an error instead of an infinite reload.
        let bounced = null; try { bounced = sessionStorage.getItem('tk_gate_bounce'); } catch {}
        if (!bounced) {
          try { sessionStorage.setItem('tk_gate_bounce', '1'); } catch {}
          if (location.pathname.startsWith('/compliance/admin')) location.reload();
          else location.replace('/compliance/admin/');
          throw new Error('Admin access password required.');
        }
        throw new Error('Admin access password required. Open /compliance/admin/, enter it, then come back to this page.');
      }
      throw new Error(body.error || r.statusText);
    }
    try { sessionStorage.removeItem('tk_gate_bounce'); } catch {}
    return body;
  }
  function toast(msg, ms = 3500) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
  const orgQ = () => S.mode === 'admin' ? `?org=${encodeURIComponent(S.orgId)}` : '';

  // ---------------------------------------------------------------- data
  async function load() {
    if (!S.catalog) S.catalog = await fetch(API + '/catalog').then(r => r.json());
    if (!S.me) S.me = await window.TeknikIdentity.user();
    if (S.mode === 'admin') {
      S.orgs = await api('/orgs');
      if (!S.orgId && S.orgs.length) S.orgId = localStorage.getItem('tk_org') && S.orgs.find(o => o.id === localStorage.getItem('tk_org')) ? localStorage.getItem('tk_org') : S.orgs[0].id;
      if (S.orgId) localStorage.setItem('tk_org', S.orgId);
    }
    S.data = S.orgId || S.mode === 'client' ? await api('/dashboard' + orgQ()) : null;
    render();
  }
  const ctl = (id) => S.data.score.controls.find(c => c.id === id);
  const catCtl = (id) => S.catalog.controls.find(c => c.id === id);

  // ---------------------------------------------------------------- render shell
  function render() {
    const root = $('#app');
    if (!S.data) {
      root.innerHTML = `
        <div class="topbar"><div class="brand">TEKNIK<small>Compliance Admin Console</small></div>
          <div class="spacer"></div><div class="user">${h(S.me?.email || '')} · admin</div><button id="logout">Sign out</button></div>
        <main><div class="card" style="max-width:820px">
          <h2>No client organizations yet</h2>
          <p class="small">Nothing to configure here first — an organization is created automatically the first time the scan agent checks in from one of that client's workstations. The client name you pass to the agent becomes the organization.</p>
          <h3>Getting the first one in</h3>
          <ol class="small" style="line-height:1.7">
            <li>Confirm <span class="mono">TEKNIK_AGENT_KEY</span> is set in the Netlify site environment variables — the agent cannot upload without it.</li>
            <li>Run the agent elevated (or as SYSTEM via the RMM) on one workstation:
              <pre class="mono" style="white-space:pre-wrap;background:#f4f6f9;padding:10px;border-radius:8px;margin:8px 0">powershell -ExecutionPolicy Bypass -File .\\TEKNIK-ComplianceScan.ps1 \`
  -ClientEmail "office@client.com" -ClientName "Client Name" -AgentKey "&lt;key&gt;"</pre></li>
            <li>Refresh. The client appears here and the contact is sent a portal invitation automatically.</li>
          </ol>
          <p class="small muted">Add <span class="mono">-NoUpload</span> for a dry run that writes results to <span class="mono">C:\\ProgramData\\TEKNIK\\Compliance</span> and sends nothing.</p>
          <button class="btn" id="refresh">Refresh</button>
        </div></main>`;
      $('#logout').onclick = async () => { await window.TeknikIdentity.logout(); location.reload(); };
      $('#refresh').onclick = () => load();
      return;
    }
    const d = S.data, sc = d.score;
    const tabs = [['overview', 'Overview'], ['devices', 'Workstations'], ['gaps', 'Gaps & Remediation'], ['assessment', 'Risk Assessment'], ['evidence', 'Evidence'], ['overrides', 'Overrides'], ['reports', 'Reports']];
    if (S.mode === 'admin') tabs.push(['phi', 'PHI Discovery'], ['admin', 'Org Settings'], ['audit', 'Audit Log']);
    root.innerHTML = `
      <div class="topbar"><div class="brand">TEKNIK<small>Compliance ${S.mode === 'admin' ? 'Admin Console' : 'Client Portal'}</small></div>
        ${S.mode === 'admin' ? `<select id="orgSel">${S.orgs.map(o => `<option value="${o.id}" ${o.id === S.orgId ? 'selected' : ''}>${h(o.name)}</option>`).join('')}</select>` : `<div><strong>${h(d.org.name)}</strong></div>`}
        <div class="spacer"></div><div class="user">${h(d.user.email)} · ${d.user.role}</div><button id="logout">Sign out</button></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <main id="view"></main>`;
    $('#logout').onclick = async () => { await window.TeknikIdentity.logout(); location.reload(); };
    if ($('#orgSel')) $('#orgSel').onchange = (e) => { S.orgId = e.target.value; localStorage.setItem('tk_org', S.orgId); S.device = null; load(); };
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.device = null; render(); });
    const v = $('#view');
    ({ overview, devices, gaps, assessment, evidence, overrides, reports, phi, admin, audit }[S.tab] || overview)(v);
  }

  // ---------------------------------------------------------------- components
  const badge = (s) => `<span class="badge ${s}">${s === 'na' ? 'N/A' : s}</span>`;
  const sev = (s) => `<span class="badge ${s}">${s}</span>`;
  function gauge(score, grade) {
    const pct = score ?? 0, r = 52, c = 2 * Math.PI * r, color = pct >= 90 ? 'var(--pass)' : pct >= 70 ? 'var(--warn)' : 'var(--fail)';
    return `<div class="gauge"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" stroke="#e8ecf1" stroke-width="12" fill="none"/><circle cx="60" cy="60" r="${r}" stroke="${color}" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 60 60)"/><text x="60" y="67" text-anchor="middle" font-size="26" font-weight="700" fill="#1a2233">${score ?? '—'}</text></svg><div><div class="grade">${grade}</div><div class="score">Overall compliance</div></div></div>`;
  }
  const barRow = (label, val, sub = '') => `<div class="stack" style="gap:4px"><div class="row between small"><span>${h(label)} ${sub ? `<span class="muted">${h(sub)}</span>` : ''}</span><strong>${val ?? '—'}${val != null ? '%' : ''}</strong></div><div class="bar"><i style="width:${val ?? 0}%;background:${val >= 90 ? 'var(--pass)' : val >= 70 ? 'var(--warn)' : 'var(--fail)'}"></i></div></div>`;
  const cites = (fw) => Object.entries(fw || {}).filter(([, v]) => v.length).map(([k, v]) => `<span class="pill"><b>${k.toUpperCase()}</b> ${h(v.join(', '))}</span>`).join('');

  // ---------------------------------------------------------------- tabs
  function overview(v) {
    const sc = S.data.score, o = sc.overall;
    v.innerHTML = `
      ${o.capped ? `<div class="notice danger" style="margin-bottom:16px"><b>Score capped at ${o.score}.</b> One or more <b>critical</b> controls are failing (${o.criticalFails.join(', ')}). Critical failures cap the overall score until remediated.</div>` : ''}
      ${sc.pendingOverrides.length && S.mode === 'admin' ? `<div class="notice" style="margin-bottom:16px">${sc.pendingOverrides.length} client-requested override(s) awaiting your approval — see <a href="#" data-go="overrides">Overrides</a>.</div>` : ''}
      <div class="grid cols-3">
        <div class="card">${gauge(o.score, o.grade)}<p class="small muted" style="margin:10px 0 0">Technical ${sc.technical.score ?? '—'}% (60%) · Administrative ${sc.administrative.score ?? '—'}% (40%). Catalog ${sc.catalogVersion}.</p></div>
        <div class="card"><h2>Framework scores</h2><div class="stack">${Object.entries(sc.frameworks).map(([k, f]) => barRow(f.name || k, f.score, `${f.controls} controls`)).join('')}</div></div>
        <div class="card"><h2>Status</h2><div class="grid cols-2">
          <div class="kpi"><div class="v">${S.data.devices.length}</div><div class="l">Workstations scanned</div></div>
          <div class="kpi"><div class="v" style="color:var(--fail)">${sc.gaps.filter(g => g.status === 'fail').length}</div><div class="l">Failing controls</div></div>
          <div class="kpi"><div class="v">${sc.administrative.answered}/${sc.administrative.total}</div><div class="l">Assessment answered</div></div>
          <div class="kpi"><div class="v">${S.data.evidence.length}</div><div class="l">Evidence items</div></div></div>
          <p class="small muted" style="margin:12px 0 0">Last scan: ${fmtDate(S.data.devices.map(d => d.lastScan?.received_at).filter(Boolean).sort().pop())}</p></div>
      </div>
      <div class="grid cols-2" style="margin-top:16px">
        <div class="card"><h2>Control domains</h2><div class="stack">${Object.entries(sc.domains).map(([k, f]) => barRow(k, f.score, `${f.controls}`)).join('')}</div></div>
        <div class="card"><h2>Top priorities</h2><table><thead><tr><th>Control</th><th>Severity</th><th>Status</th><th>Affects</th></tr></thead><tbody>
          ${sc.gaps.slice(0, 10).map(g => `<tr><td><b>${g.id}</b> ${h(g.title)}</td><td>${sev(g.severity)}</td><td>${badge(g.status)}</td><td class="small">${g.type === 'manual' ? 'Organization' : (g.affected.length + ' device(s)')}</td></tr>`).join('') || '<tr><td colspan=4>No open gaps. 🎉</td></tr>'}
        </tbody></table></div>
      </div>`;
    v.querySelectorAll('[data-go]').forEach(a => a.onclick = (e) => { e.preventDefault(); S.tab = a.dataset.go; render(); });
  }

  function devices(v) {
    if (S.device) return deviceDetail(v);
    const sc = S.data.score;
    v.innerHTML = `<div class="card"><h2>Workstations <small>click a row for control-level detail</small></h2><div class="tbl-wrap"><table><thead><tr><th>Hostname</th><th>OS</th><th>Last user</th><th>Join</th><th>Score</th><th>Pass</th><th>Fail</th><th>Warn</th><th>Err</th><th>Last scan</th></tr></thead><tbody>
      ${sc.technical.devices.map(d => { const dev = S.data.devices.find(x => x.id === d.id); return `<tr class="dev-row" data-dev="${d.id}"><td><b>${h(d.hostname)}</b></td><td class="small">${h(dev.os_name)} ${h(dev.os_version || '')}</td><td class="small">${h(d.lastUser || '')}</td><td class="small">${h(dev.domain_join || '')}</td><td><b>${d.score ?? '—'}</b></td><td>${d.counts.pass}</td><td style="color:var(--fail)">${d.counts.fail}</td><td style="color:var(--warn)">${d.counts.warn}</td><td>${d.counts.error}</td><td class="small">${fmtDate(dev.lastScan?.received_at)}${dev.lastScan && !dev.lastScan.ran_as_admin ? ' <span class="badge warn">not elevated</span>' : ''}</td></tr>`; }).join('') || '<tr><td colspan=10>No workstations scanned yet.</td></tr>'}
    </tbody></table></div></div>
    <div class="card" style="margin-top:16px"><h2>Control matrix</h2><div class="tbl-wrap"><table class="matrix"><thead><tr><th>Control</th>${sc.technical.devices.map(d => `<th class="c" title="${h(d.hostname)}">${h(d.hostname.slice(0, 8))}</th>`).join('')}</tr></thead><tbody>
      ${sc.controls.filter(c => c.type === 'automated').map(c => `<tr><td class="small"><b>${c.id}</b> ${h(c.title)}</td>${sc.technical.devices.map(d => { const r = sc.technical.deviceControls[d.id][c.id]; return `<td class="c"><span class="dot ${r.status}" title="${h(r.status + (r.observed ? ': ' + r.observed : ''))}"></span></td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div></div>`;
    v.querySelectorAll('[data-dev]').forEach(r => r.onclick = () => { S.device = r.dataset.dev; render(); });
  }

  function deviceDetail(v) {
    const sc = S.data.score, d = sc.technical.devices.find(x => x.id === S.device), dev = S.data.devices.find(x => x.id === S.device), rows = sc.technical.deviceControls[S.device];
    const order = { fail: 0, error: 1, warn: 2, unscanned: 3, pass: 4, na: 5 };
    const list = Object.entries(rows).map(([id, r]) => ({ id, ...r, c: ctl(id) })).sort((a, b) => order[a.status] - order[b.status] || b.c.weight - a.c.weight);
    v.innerHTML = `<div class="row between" style="margin-bottom:12px"><button class="btn secondary" id="back">← All workstations</button>
      ${S.mode === 'admin' ? `<div class="row"><a class="btn" href="${API}/remediation?org=${S.orgId}&device=${S.device}" target="_blank" id="remLink">Generate remediation script (.ps1)</a></div>` : ''}</div>
      <div class="grid cols-3" style="margin-bottom:16px"><div class="card"><div class="kpi"><div class="v">${d.score ?? '—'}</div><div class="l">${h(d.hostname)} score</div></div></div>
      <div class="card small"><b>${h(dev.os_name)}</b> ${h(dev.os_version || '')} build ${h(dev.os_build || '')}<br>${h(dev.manufacturer || '')} ${h(dev.model || '')} · SN ${h(dev.serial || '')}<br>Join: ${h(dev.domain_join)} · Last user: ${h(dev.last_user || '')}</div>
      <div class="card small">Last scan ${fmtDate(dev.lastScan?.received_at)}<br>Agent ${h(dev.lastScan?.agent_version)} · elevated: ${dev.lastScan?.ran_as_admin ? 'yes' : '<b style="color:var(--fail)">no</b>'}<br>First seen ${fmtDay(dev.first_seen)}</div></div>
      <div class="card"><div class="tbl-wrap"><table><thead><tr><th>Status</th><th>Control</th><th>Sev</th><th>Observed</th><th>Expected</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr><td>${badge(r.status)}${r.source.startsWith('override') ? `<div class="small muted">override</div>` : ''}</td><td><b>${r.id}</b> ${h(r.c.title)}<div class="small muted">${h(r.c.domain)}</div></td><td>${sev(r.c.severity)}</td><td class="small">${h(r.observed || '')}${r.detail ? ` <a href="#" data-detail="${r.id}">detail</a>` : ''}</td><td class="small">${h(r.expected || '')}</td><td><button class="btn sm secondary" data-fix="${r.id}">Fix / info</button> ${['fail', 'warn', 'error', 'unscanned'].includes(r.status) ? `<button class="btn sm secondary" data-ovr="${r.id}">${S.mode === 'admin' ? 'Override' : 'Request N/A'}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    $('#back').onclick = () => { S.device = null; render(); };
    v.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => controlModal(b.dataset.fix, rows[b.dataset.fix]));
    v.querySelectorAll('[data-ovr]').forEach(b => b.onclick = () => overrideModal(b.dataset.ovr, S.device));
    v.querySelectorAll('[data-detail]').forEach(a => a.onclick = (e) => { e.preventDefault(); modal(`<h2>${a.dataset.detail} — raw detail</h2><pre class="mono" style="white-space:pre-wrap;max-height:60vh;overflow:auto">${h(JSON.stringify(rows[a.dataset.detail].detail, null, 2))}</pre>`); });
  }

  function gaps(v) {
    const sc = S.data.score;
    v.innerHTML = `<div class="card"><div class="row between"><h2>Open gaps <small>${sc.gaps.length} — ordered by risk</small></h2>${S.mode === 'admin' ? `<a class="btn" href="${API}/remediation?org=${S.orgId}" target="_blank">Org-wide remediation script</a>` : ''}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Priority</th><th>Control</th><th>Status</th><th>Affects</th><th>Remediation</th><th>Citations</th><th></th></tr></thead><tbody>
      ${sc.gaps.map((g, i) => `<tr><td><b>${i + 1}</b><br>${sev(g.severity)}</td><td><b>${g.id}</b> ${h(g.title)}<div class="small muted">${h(g.domain)} · ${g.type}</div></td><td>${badge(g.status)}</td><td class="small">${g.type === 'manual' ? 'Organization' : g.affected.map(h).join('<br>') || '—'}</td><td class="small">${h(g.remediation?.summary || '')}${g.remediation?.script && S.mode === 'admin' ? ' <span class="pill">scriptable</span>' : ''}</td><td class="small">${cites(g.frameworks)}</td><td><button class="btn sm secondary" data-fix="${g.id}">Detail</button></td></tr>`).join('') || '<tr><td colspan=7>No open gaps.</td></tr>'}
      </tbody></table></div></div>`;
    v.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => controlModal(b.dataset.fix));
  }

  function assessment(v) {
    const sc = S.data.score, manual = sc.controls.filter(c => c.type === 'manual');
    const domains = [...new Set(manual.map(c => c.domain))];
    const ans = Object.fromEntries(S.data.answers.map(a => [a.control_id, a]));
    v.innerHTML = `<div class="notice info" style="margin-bottom:16px">Answer each item for the organization as a whole. Choose <b>Not applicable</b> only with a justification — TEKNIK reviews N/A answers. Upload supporting evidence under the <a href="#" data-go="evidence">Evidence</a> tab. Progress: <b>${sc.administrative.answered}/${sc.administrative.total}</b>.</div>
      ${domains.map(dm => `<div class="card" style="margin-bottom:16px"><h2>${h(dm)}</h2>${manual.filter(c => c.domain === dm).map(c => { const a = ans[c.id]; const ev = S.data.evidence.filter(e => e.control_id === c.id).length; return `
        <div class="q" data-q="${c.id}"><div class="row between"><div class="title">${c.id} · ${h(c.title)} ${sev(c.severity)} ${c.override ? badge(c.override.status) + ' <span class="small muted">override</span>' : ''}</div><div class="small muted">${ev} evidence</div></div>
          <div class="small" style="margin:4px 0">${h(c.question)}</div><div class="cite">${cites(c.frameworks)}${c.evidenceHint ? `<div>Evidence: ${h(c.evidenceHint)}</div>` : ''}</div>
          <div class="opts">${['yes', 'partial', 'no', 'na'].map(o => `<label class="${a?.answer === o ? 'on-' + o : ''}"><input type="radio" name="a-${c.id}" value="${o}" ${a?.answer === o ? 'checked' : ''}>${{ yes: 'Yes — in place', partial: 'Partially', no: 'No', na: 'Not applicable' }[o]}</label>`).join('')}</div>
          <textarea placeholder="Notes / justification (required for N/A)">${h(a?.notes || '')}</textarea>
          <div class="row between" style="margin-top:6px"><span class="small muted">${a ? `Answered by ${h(a.answered_by)} on ${fmtDate(a.answered_at)}` : 'Not yet answered'}</span><button class="btn sm" data-save="${c.id}">Save</button></div></div>`; }).join('')}</div>`).join('')}`;
    v.querySelectorAll('[data-go]').forEach(a => a.onclick = (e) => { e.preventDefault(); S.tab = a.dataset.go; render(); });
    v.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
      const q = b.closest('.q'), id = b.dataset.save, sel = q.querySelector('input:checked');
      if (!sel) return toast('Pick an answer first');
      b.disabled = true;
      try { await api('/answers', { method: 'PUT', json: { org: S.orgId, control_id: id, answer: sel.value, notes: q.querySelector('textarea').value } }); toast('Saved ' + id); await load(); S.tab = 'assessment'; render(); window.scrollTo(0, document.querySelector(`[data-q="${id}"]`)?.offsetTop - 80); }
      catch (e) { toast(e.message); b.disabled = false; }
    });
  }

  function evidence(v) {
    const ev = S.data.evidence, controls = S.catalog.controls;
    v.innerHTML = `<div class="grid cols-2"><div class="card"><h2>Upload evidence</h2>
      <form id="evForm" class="stack"><label>Control<select name="control_id" required><option value="">Select…</option>${controls.map(c => `<option value="${c.id}">${c.id} — ${h(c.title)}</option>`).join('')}</select></label>
      <label>Workstation (optional)<select name="device_id"><option value="">Organization-wide</option>${S.data.devices.map(d => `<option value="${d.id}">${h(d.hostname)}</option>`).join('')}</select></label>
      <label>Description<input type="text" name="description" placeholder="e.g. Signed BAA with billing vendor, 2026"></label>
      <label>File (PDF, image, Office, CSV/TXT, ZIP — max 4.5 MB)<input type="file" name="file" required></label>
      <label class="small"><input type="checkbox" name="attest" value="1" required> I confirm this file contains <b>no patient records, PHI, or full card numbers</b>. Redact before uploading.</label>
      <button class="btn" type="submit">Upload</button></form></div>
      <div class="card"><h2>Evidence register <small>${ev.length}</small></h2><div class="tbl-wrap"><table><thead><tr><th>Control</th><th>File</th><th>Source</th><th>Uploaded</th><th></th></tr></thead><tbody>
      ${ev.slice(0, 200).map(e => `<tr><td><b>${e.control_id}</b></td><td class="small">${h(e.filename)}<div class="muted">${h(e.description || '')} ${e.hostname ? '· ' + h(e.hostname) : ''} · ${(e.size_bytes / 1024).toFixed(0)} KB</div><div class="mono muted" style="font-size:.7rem">sha256 ${h(e.sha256.slice(0, 16))}…</div></td><td><span class="pill">${e.source}</span></td><td class="small">${fmtDate(e.uploaded_at)}<div class="muted">${h(e.uploaded_by)}</div></td><td><a class="btn sm secondary" href="#" data-dl="${e.id}" data-name="${h(e.filename)}">Download</a> ${(S.mode === 'admin' || e.uploaded_by === S.data.user.email) ? `<button class="btn sm danger" data-del="${e.id}">Delete</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=5>No evidence yet. Agent bundles appear here automatically after each scan.</td></tr>'}
      </tbody></table></div></div></div>`;
    $('#evForm').onsubmit = async (e) => {
      e.preventDefault(); const fd = new FormData(e.target); if (S.orgId) fd.set('org', S.orgId);
      try { const r = await api('/evidence', { method: 'POST', body: fd }); toast('Uploaded ' + r.filename); await load(); S.tab = 'evidence'; render(); } catch (er) { toast(er.message); }
    };
    v.querySelectorAll('[data-dl]').forEach(a => a.onclick = async (e) => { e.preventDefault(); const r = await api('/evidence/' + a.dataset.dl, { raw: true }); if (!r.ok) return toast('Download failed'); const b = await r.blob(); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = a.dataset.name; l.click(); URL.revokeObjectURL(u); });
    v.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Delete this evidence item?')) return; try { await api('/evidence/' + b.dataset.del, { method: 'DELETE' }); await load(); S.tab = 'evidence'; render(); } catch (e) { toast(e.message); } });
  }

  function overrides(v) {
    const list = S.data.overrides;
    v.innerHTML = `<div class="card"><div class="row between"><h2>Overrides & exceptions <small>${list.length} active</small></h2><button class="btn" id="newOvr">${S.mode === 'admin' ? 'New override' : 'Request N/A'}</button></div>
      <p class="small muted">Client-requested N/A exceptions count only after TEKNIK approval. Admin overrides apply immediately. Every change is written to the audit log.</p>
      <div class="tbl-wrap"><table><thead><tr><th>Control</th><th>Scope</th><th>Status</th><th>Justification</th><th>Set by</th><th>Approval</th><th></th></tr></thead><tbody>
      ${list.map(o => { const dev = S.data.devices.find(d => d.id === o.device_id); return `<tr><td><b>${o.control_id}</b><div class="small muted">${h(catCtl(o.control_id)?.title || '')}</div></td><td class="small">${dev ? h(dev.hostname) : 'Organization'}</td><td>${badge(o.status)}</td><td class="small">${h(o.justification)}${o.expires_at ? `<div class="muted">Re-review ${fmtDay(o.expires_at)}</div>` : ''}</td><td class="small">${h(o.set_by)}<div class="muted">${o.set_by_role} · ${fmtDay(o.created_at)}</div></td><td>${o.approved ? `<span class="badge pass">approved</span><div class="small muted">${h(o.approved_by || '')}</div>` : '<span class="badge pending">pending</span>'}</td>
        <td>${S.mode === 'admin' && !o.approved ? `<button class="btn sm" data-approve="${o.id}">Approve</button> ` : ''}${(S.mode === 'admin' || !o.approved) ? `<button class="btn sm danger" data-revoke="${o.id}">Revoke</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan=7>No overrides.</td></tr>'}
      </tbody></table></div></div>`;
    $('#newOvr').onclick = () => overrideModal();
    v.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => { try { await api(`/overrides/${b.dataset.approve}/approve`, { method: 'POST' }); toast('Approved'); await load(); S.tab = 'overrides'; render(); } catch (e) { toast(e.message); } });
    v.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { if (!confirm('Revoke this override?')) return; try { await api('/overrides/' + b.dataset.revoke, { method: 'DELETE' }); await load(); S.tab = 'overrides'; render(); } catch (e) { toast(e.message); } });
  }

  async function reports(v) {
    v.innerHTML = `<div class="card"><div class="row between"><h2>Reports</h2><div class="row"><label class="small"><input type="checkbox" id="narr" ${S.mode === 'admin' ? 'checked' : ''}> Include AI executive narrative</label><button class="btn" id="gen">Generate report</button></div></div>
      <p class="small muted">A report is a frozen snapshot of the current score, findings, answers, overrides and evidence register. Open it to print or save as PDF.</p><div id="repList">Loading…</div></div>`;
    const list = async () => { const r = await api('/report' + orgQ()); $('#repList').innerHTML = `<table><thead><tr><th>Generated</th><th>By</th><th>Score</th><th>Narrative</th><th></th></tr></thead><tbody>${r.map(x => `<tr><td>${fmtDate(x.generated_at)}</td><td class="small">${h(x.generated_by)}</td><td><b>${x.overall?.score ?? '—'}</b> ${x.overall?.grade || ''}</td><td class="small">${x.narrative_model ? h(x.narrative_model) : '—'}</td><td><a class="btn sm" href="/compliance/report/?id=${x.id}" target="_blank">Open</a></td></tr>`).join('') || '<tr><td colspan=5>No reports yet.</td></tr>'}</tbody></table>`; };
    await list();
    $('#gen').onclick = async () => { $('#gen').disabled = true; try { const r = await api('/report', { method: 'POST', json: { org: S.orgId, narrative: $('#narr').checked } }); toast(`Report generated (score ${r.overall.score})`); window.open('/compliance/report/?id=' + r.id, '_blank'); await list(); } catch (e) { toast(e.message); } $('#gen').disabled = false; };
  }

  function phi(v) {
    const p = S.data.score.phi;
    v.innerHTML = `<div class="notice danger" style="margin-bottom:16px">Discovery results list <b>file paths and pattern types only</b>. No file contents are stored. Review each path with the client before any deletion.</div>
      ${p.map(x => `<div class="card" style="margin-bottom:16px"><div class="row between"><h2>${h(x.hostname)} ${badge(x.status)}</h2><span class="small muted">${x.scannedFiles} files scanned · ${x.skippedLarge} skipped (size) · ${x.unreadable} unreadable${x.timedOut ? ' · <b style="color:var(--fail)">time budget exhausted</b>' : ''}</span></div>
        <p class="small">Roots: ${(x.roots || []).map(r => `<span class="pill mono">${h(r)}</span>`).join('')}</p>
        ${(x.mailArchives || []).length ? `<p class="small"><b>Mail archives on disk:</b> ${x.mailArchives.map(m => `<span class="pill mono">${h(m.path)} (${m.sizeMB} MB)</span>`).join('')}</p>` : ''}
        <div class="tbl-wrap"><table><thead><tr><th>File and path</th><th>Owner</th><th>Modified</th><th>Patterns matched</th></tr></thead><tbody>
        ${(x.top || []).map(f => `<tr><td class="mono small">${h(f.path)}<div class="muted">${f.sizeKB} KB · clinical terms ${f.clinicalTerms}</div></td><td class="small">${h(f.owner)}</td><td class="small">${fmtDay(f.modified)}</td><td class="small">${Object.entries(f.hits || {}).map(([k, n]) => `<span class="pill">${k} ×${n}</span>`).join('')}</td></tr>`).join('') || '<tr><td colspan=4>Nothing flagged.</td></tr>'}
        </tbody></table></div><p class="small muted">Showing up to 50 highest-priority files; full list is in the scan detail (DATA-01 → detail).</p></div>`).join('') || '<div class="card">No PHI discovery data yet.</div>'}`;
  }

  async function admin(v) {
    const o = S.data.org, fws = Object.entries(S.catalog.frameworks);
    const users = await api(`/orgs/${S.orgId}/users`);
    v.innerHTML = `<div class="grid cols-2"><div class="card"><h2>Organization</h2><form id="orgForm" class="stack">
      <label>Display name<input type="text" name="name" value="${h(o.name)}"></label>
      <label>"Prepared for" line (optional override)<input type="text" name="prepared_for" value="${h(o.prepared_for || '')}" placeholder="e.g. Sunrise Pediatrics, PLLC — Attn: Dr. Rivera"></label>
      <label>Contact e-mail<input type="email" name="contact_email" value="${h(o.contact_email)}"></label>
      <label>Industry<select name="industry">${['', 'healthcare', 'legal', 'professional', 'aerospace', 'trucking', 'other'].map(i => `<option ${o.industry === i ? 'selected' : ''} value="${i}">${i || '—'}</option>`).join('')}</select></label>
      <div><div class="small muted">Frameworks in scope</div>${fws.map(([k, f]) => `<label class="pill"><input type="checkbox" name="fw" value="${k}" ${(o.frameworks || []).includes(k) ? 'checked' : ''}> ${h(f.name)}</label>`).join('')}</div>
      <button class="btn" type="submit">Save</button></form><p class="small muted">Slug: <span class="mono">${h(o.slug)}</span> · Org ID: <span class="mono">${o.id}</span> · created ${fmtDay(o.created_at)}</p></div>
      <div class="card"><h2>Portal users</h2><table><thead><tr><th>E-mail</th><th>Role</th><th>Last login</th></tr></thead><tbody>${users.map(u => `<tr><td>${h(u.email)}</td><td>${u.role}</td><td class="small">${fmtDate(u.last_login)}</td></tr>`).join('') || '<tr><td colspan=3>None</td></tr>'}</tbody></table>
        <form id="invForm" class="row" style="margin-top:12px"><input type="email" name="email" placeholder="person@client.com" required><select name="role" style="width:auto"><option value="client">client</option><option value="admin">TEKNIK admin</option></select><button class="btn" type="submit">Invite</button></form>
        <p class="small muted">Invite creates the Identity user (or links an existing one) and sends a password-setup e-mail.</p>
        <h3 style="margin-top:18px">Agent command for this client</h3><pre class="mono" style="white-space:pre-wrap;background:#f4f6f9;padding:10px;border-radius:8px">powershell -ExecutionPolicy Bypass -File .\\TEKNIK-ComplianceScan.ps1 -ClientEmail "${h(o.contact_email)}" -ClientName "${h(o.name)}"</pre></div></div>`;
    $('#orgForm').onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(e.target); const body = { name: fd.get('name'), prepared_for: fd.get('prepared_for'), contact_email: fd.get('contact_email'), industry: fd.get('industry'), frameworks: fd.getAll('fw') }; try { await api('/orgs/' + S.orgId, { method: 'PATCH', json: body }); toast('Saved'); await load(); S.tab = 'admin'; render(); } catch (er) { toast(er.message); } };
    $('#invForm').onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(e.target); try { const r = await api(`/orgs/${S.orgId}/invite`, { method: 'POST', json: { email: fd.get('email'), role: fd.get('role') } }); toast(r.note); await load(); S.tab = 'admin'; render(); } catch (er) { toast(er.message); } };
  }

  async function audit(v) {
    const rows = await api(`/orgs/${S.orgId}/audit`);
    v.innerHTML = `<div class="card"><h2>Audit log <small>last ${rows.length}</small></h2><div class="tbl-wrap"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th><th>IP</th></tr></thead><tbody>${rows.map(r => `<tr><td class="small">${fmtDate(r.at)}</td><td class="small">${h(r.actor)}<div class="muted">${h(r.actor_role || '')}</div></td><td><span class="pill">${h(r.action)}</span></td><td class="small mono">${h(r.target || '')}</td><td class="small mono">${h(JSON.stringify(r.detail || {})).slice(0, 160)}</td><td class="small mono">${h(r.ip || '')}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  // ---------------------------------------------------------------- modals
  function modal(html) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box">${html}<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn secondary" id="mClose">Close</button></div></div>`; document.body.appendChild(m); m.querySelector('#mClose').onclick = () => m.remove(); m.onclick = (e) => { if (e.target === m) m.remove(); }; return m; }
  function controlModal(id, finding) {
    const c = catCtl(id), r = c.remediation || {};
    const m = modal(`<h2>${c.id} — ${h(c.title)} ${sev(c.severity)}</h2><p>${h(c.description)}</p><div>${cites(c.frameworks)}</div>
      ${finding ? `<p class="small"><b>Observed:</b> ${h(finding.observed || '—')}<br><b>Expected:</b> ${h(finding.expected || '—')}</p>` : ''}
      <h3>Remediation</h3><p>${h(r.summary || '')}</p>${r.manual ? `<p class="small"><b>Manual:</b> ${h(r.manual)}</p>` : ''}
      ${r.script && S.mode === 'admin' ? `<pre class="mono" style="white-space:pre-wrap;background:#0b1f3a;color:#d7e3f4;padding:12px;border-radius:8px;max-height:260px;overflow:auto">${h(r.script)}</pre>` : ''}
      <div class="row"><button class="btn secondary sm" id="ai">Explain with AI</button><span class="small muted">Optional — requires an API key configured on the site.</span></div><div id="aiOut" class="small" style="margin-top:8px"></div>`);
    m.querySelector('#ai').onclick = async () => { const o = m.querySelector('#aiOut'); o.textContent = 'Thinking…'; try { const x = await api('/explain', { method: 'POST', json: { control_id: id, observed: finding?.observed } }); o.innerHTML = h(x.text).replace(/\n/g, '<br>') + `<div class="muted" style="margin-top:6px">${h(x.model)} · ${x.tokens?.input_tokens}/${x.tokens?.output_tokens} tokens</div>`; } catch (e) { o.textContent = e.message; } };
  }
  function overrideModal(controlId, deviceId) {
    const adminOpts = S.mode === 'admin' ? `<option value="pass">Pass — compensating control verified</option><option value="fail">Fail — force failing</option>` : '';
    const m = modal(`<h2>${S.mode === 'admin' ? 'Set override' : 'Request Not-Applicable exception'}</h2><form id="ovrForm" class="stack">
      <label>Control<select name="control_id" required>${S.catalog.controls.map(c => `<option value="${c.id}" ${c.id === controlId ? 'selected' : ''}>${c.id} — ${h(c.title)}</option>`).join('')}</select></label>
      <label>Scope<select name="device_id"><option value="">Organization-wide</option>${S.data.devices.map(d => `<option value="${d.id}" ${d.id === deviceId ? 'selected' : ''}>${h(d.hostname)} only</option>`).join('')}</select></label>
      <label>Status<select name="status"><option value="na">Not applicable — excluded from scoring</option>${adminOpts}</select></label>
      <label>Justification (required, ≥ 15 chars)<textarea name="justification" required placeholder="e.g. Device is a kiosk with no user data; no ePHI or card data is ever processed."></textarea></label>
      <label>Re-review date (optional)<input type="date" name="expires_at"></label>
      <button class="btn" type="submit">${S.mode === 'admin' ? 'Apply override' : 'Submit request'}</button></form>`);
    m.querySelector('#ovrForm').onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(e.target); const body = Object.fromEntries(fd.entries()); body.org = S.orgId; if (!body.device_id) delete body.device_id; if (!body.expires_at) delete body.expires_at; try { await api('/overrides', { method: 'POST', json: body }); toast(S.mode === 'admin' ? 'Override applied' : 'Request submitted for TEKNIK review'); m.remove(); await load(); } catch (er) { toast(er.message); } };
  }

  // ---------------------------------------------------------------- boot
  const authShell = (mode, inner) => `<div class="login card"><h1>TEKNIK</h1><p class="muted">${mode === 'admin' ? 'Compliance Admin Console' : 'Client Compliance Portal'}</p>${inner}</div>`;

  function loginView(mode, start) {
    $('#app').innerHTML = authShell(mode, `
      <form id="lf" class="stack" style="text-align:left;margin-top:18px">
        <label>E-mail<input type="email" name="email" autocomplete="username" required></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn" type="submit">Sign in</button>
      </form>
      <div class="err small" id="le" style="color:var(--fail);min-height:1.2em;margin-top:10px"></div>
      <p class="small muted">Invited by e-mail? Open the link in that message to set your password.<br>
        <a href="#" id="forgot">Forgot your password?</a></p>`);
    const f = $('#lf'), e = $('#le');
    f.onsubmit = async (ev) => {
      ev.preventDefault(); e.textContent = ''; f.querySelector('button').disabled = true;
      const fd = new FormData(f);
      try { await window.TeknikIdentity.login(fd.get('email'), fd.get('password')); start(); }
      catch (er) { e.textContent = /invalid|grant/i.test(er.message) ? 'Incorrect e-mail or password.' : er.message; f.querySelector('button').disabled = false; }
    };
    $('#forgot').onclick = (ev) => {
      ev.preventDefault();
      const email = new FormData(f).get('email');
      if (!email) { e.textContent = 'Enter your e-mail address first, then click again.'; return; }
      window.TeknikIdentity.requestRecovery(email);
      e.style.color = 'var(--pass)';
      e.textContent = 'If that address has an account, a reset link is on its way.';
    };
  }

  function setPasswordView(mode, hash, start) {
    const invite = hash.type === 'invite';
    $('#app').innerHTML = authShell(mode, `
      <p style="margin-top:14px">${invite ? 'Welcome — choose a password to activate your account.' : 'Choose a new password.'}</p>
      <form id="pf" class="stack" style="text-align:left">
        <label>New password (12+ characters)<input type="password" name="password" autocomplete="new-password" minlength="12" required></label>
        <label>Confirm password<input type="password" name="confirm" autocomplete="new-password" minlength="12" required></label>
        <button class="btn" type="submit">${invite ? 'Activate account' : 'Set password'}</button>
      </form><div class="err small" id="pe" style="color:var(--fail);min-height:1.2em;margin-top:10px"></div>`);
    const f = $('#pf'), e = $('#pe');
    f.onsubmit = async (ev) => {
      ev.preventDefault(); e.textContent = ''; const fd = new FormData(f);
      if (fd.get('password') !== fd.get('confirm')) { e.textContent = 'The two passwords do not match.'; return; }
      f.querySelector('button').disabled = true;
      try {
        await (invite ? window.TeknikIdentity.completeInvite(hash.token, fd.get('password'))
          : window.TeknikIdentity.completeRecovery(hash.token, fd.get('password')));
        start();
      } catch (er) { e.textContent = er.message + ' The link may have expired — ask TEKNIK to re-send it.'; f.querySelector('button').disabled = false; }
    };
  }

  window.mount = async function (mode) {
    S.mode = mode;
    const root = $('#app');
    const start = async () => {
      root.innerHTML = '<main><div class="card">Loading…</div></main>';
      try { await load(); }
      catch (e) {
        root.innerHTML = `<main><div class="card"><h2>Access problem</h2><p>${h(e.message)}</p>
          <button class="btn secondary" id="so">Sign out</button></div></main>`;
        $('#so').onclick = async () => { await window.TeknikIdentity.logout(); location.reload(); };
      }
    };
    const hash = window.TeknikIdentity.readHash();
    if (hash && hash.type === 'error') { loginView(mode, start); $('#le').textContent = hash.message; return; }
    if (hash) return setPasswordView(mode, hash, start);
    if (window.TeknikIdentity.isAuthenticated() && await window.TeknikIdentity.token()) return start();
    loginView(mode, start);
  };
})();
