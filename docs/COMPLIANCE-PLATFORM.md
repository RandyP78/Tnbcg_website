# TEKNIK Compliance Platform — Architecture, Setup & Operations

Version 1.0 · September 2026 · TNB Consulting Group, LLC

A HIPAA / PCI DSS workstation-compliance platform bolted onto tnbcg.tech: a PowerShell scan agent, a Netlify backend (Netlify DB + Blobs + Identity + Functions), a client portal, a password-gated admin console, and a printable assessment report.

## 1. What was added

| Path | Purpose |
|---|---|
| `agent/TEKNIK-ComplianceScan.ps1` | Windows scan agent. 63 automated checks, PHI/CHD discovery, evidence bundle, upload. Two per-client variables at the top: `$ClientEmail`, `$ClientName` (plus a shared `$AgentKey`, see §8). |
| `lib/compliance/catalog.mjs` | **Single source of truth**: 63 automated + 27 manual controls, each mapped to HIPAA §, PCI DSS v4.0.1 req, NIST CSF 2.0, SP 800-171 and CIS, with severity, weight and remediation (PowerShell snippet or manual steps). Served to the browser via `GET /api/compliance/catalog`. Lives in `/lib` alongside the remediation engine, which the existing `[[redirects]] /lib/* → 404` already keeps off the public site. |
| `lib/compliance/scoring.mjs` | Deterministic scoring engine + remediation-script builder. Unit-tested. |
| `lib/compliance/{db,auth,gate,data,identity}.mjs` | DB handle, Identity/role auth, admin gate crypto, per-org data loader, Identity admin helpers. |
| `netlify/functions/compliance-*.mjs` | The API under `/api/compliance/*` — 11 functions. All prefixed `compliance-` so nothing collides with the existing `report.js`, `email-security.js` and the `remediate-*` engine. |
| `netlify/edge-functions/compliance-admin-gate.js` | Password gate on `/compliance/admin/*`, enforced **before** the HTML is served. |
| `netlify/database/migrations/0001_compliance_init.sql` | Postgres schema (orgs, devices, scans, findings, answers, overrides, evidence, reports, audit_log). Netlify applies it automatically on deploy. |
| `compliance/portal/` · `compliance/admin/` · `compliance/report/` | Client portal, admin console, printable report. |
| `compliance/auth.js` · `app.js` · `app.css` | Same-origin Netlify Identity (GoTrue) client and the portal application. No build step, no framework, no third-party script. |
| `package.json` | Three runtime dependencies. **No `"type": "module"`** — see §8.2. |
| `tests/` | Scoring tests, fixture generator, Playwright UI smoke test. |

## 2. Data flow

```
Client PC ──(agent, HTTPS, X-Agent-Key)──▶ /api/compliance/agent-ingest ──▶ Netlify DB (orgs/devices/scans/findings)
          └──(evidence zip ≤4.5 MB)──────▶ /api/compliance/agent-evidence ─▶ Netlify Blobs "evidence" + evidence index

Client user ──▶ /compliance/portal ──(Identity login, same origin)──▶ /api/compliance/dashboard|answers|overrides|evidence|report

TEKNIK admin ─▶ /compliance/admin
                 │  edge gate: shared access password  ─────────── factor 1
                 └▶ Identity login carrying role `admin` ───────── factor 2
                    ──▶ + /orgs, /remediation, /explain, audit

Report ──▶ POST /api/compliance/report (frozen score snapshot [+ optional Claude narrative]) ──▶ /compliance/report/?id=
```

First check-in for a new `$ClientName` auto-creates the organization (slug from the name), creates an Identity user for `$ClientEmail` with role `client` and `app_metadata.org_id`, and triggers a password-setup e-mail. Later scans from the same client name attach to the same org; devices are keyed by Windows MachineGuid.

## 3. Setup

1. **Netlify DB** — Site → Extensions → Database → create. `NETLIFY_DATABASE_URL` is injected automatically and the migration in `netlify/database/migrations/` runs on the next production deploy. A failed migration blocks publish, so check the deploy log.
2. **Netlify Identity** — Site → Identity → Enable. Registration: **Invite only**. Under *Emails*, point the invitation and recovery templates at `/compliance/portal/` (the portal reads `#invite_token` / `#recovery_token` from the link and shows a set-password form).
   Then create your own admin user and give it the role: Identity → the user → Edit app metadata → `{"roles":["admin"]}`. Once one admin exists, the console's Org Settings → Invite can create the rest.
3. **Environment variables** — Site → Environment variables:

   | Variable | Required | Notes |
   |---|---|---|
   | `TEKNIK_ADMIN_GATE_PASSWORD` | **yes** | The admin console access password. Also the HMAC key for the gate cookie, so changing it instantly signs everyone out. Without it the console **refuses to open** (fails closed). Use a long passphrase; store it in the TEKNIK password manager, not in the repo. |
   | `TEKNIK_AGENT_KEY` | yes | Long random secret (`openssl rand -base64 48`). The same value goes to the agent via `-AgentKey` or the `TEKNIK_AGENT_KEY` env var on the RMM. Rotate by changing both. |
   | `URL` | auto | Netlify sets it. Used for Identity verification and portal links. |
   | `ANTHROPIC_API_KEY` | optional | Enables the AI executive narrative and "Explain with AI". Set it in the Netlify UI — never in the repo. |
   | `ANTHROPIC_MODEL` | optional | Narrative model. Default `claude-sonnet-4-5`. |
   | `ANTHROPIC_MODEL_FAST` | optional | Explain-control model. Default `claude-haiku-4-5`. |
4. **Deploy.** Netlify installs the three dependencies (the site had no `package.json` before; there is still no build command). Open `/compliance/admin/`, enter the gate password, then sign in.
5. **Agent rollout** — push `TEKNIK-ComplianceScan.ps1` via RMM as SYSTEM, or run elevated:
   ```
   powershell -ExecutionPolicy Bypass -File .\TEKNIK-ComplianceScan.ps1 -ClientEmail "office@clinic.com" -ClientName "Sunrise Pediatrics" -AgentKey "<key>"
   ```
   Switches: `-NoUpload` (offline JSON only), `-SkipPhiScan`, `-PhiTimeBudgetMinutes 45`, `-PhiExtraPaths "D:\Scans","\\NAS\Shared"`, `-AllowedAdminPatterns "teknik*","clinicadmin"`. Output and log land in `C:\ProgramData\TEKNIK\Compliance\`.

## 4. API (`/api/compliance/…`)

| Route | Auth | Purpose |
|---|---|---|
| `POST agent-ingest` | agent key | Upsert org + device, store scan + findings, provision the client login. |
| `POST agent-evidence` | agent key | Store the agent's evidence bundle (base64 zip) in Blobs. |
| `POST/GET/DELETE admin-gate` | gate password | Issue, check, clear the signed admin gate cookie. Failed attempts are delayed and audited. |
| `GET catalog` | public | Control catalog JSON (the control list is not secret). |
| `GET dashboard?org=` | user | Everything the portals render. Clients are pinned to their own org server-side. |
| `PUT answers` | user | Questionnaire answer (`yes/partial/no/na` + notes; N/A needs a justification). |
| `POST overrides`, `POST overrides/:id/approve`, `DELETE overrides/:id` | user / admin | Exceptions. Clients may only *request* N/A (pending until an admin approves); admins may set na/pass/fail, org-wide or per device, with an optional re-review date. |
| `POST evidence`, `GET evidence/:id`, `DELETE evidence/:id` | user | Upload (multipart, ≤4.5 MB, attestation checkbox required), download, soft-delete. |
| `POST report`, `GET report?org=`, `GET report/:id` | user | Generate / list / read frozen report snapshots. `{narrative:true}` calls Claude when configured. |
| `GET remediation?org=&device=&controls=&include=fail,warn` | admin | Downloads a `.ps1` built from the catalog's snippets (WhatIf by default; `-Apply` executes). |
| `POST explain` | user | Optional AI explanation of one control — client-safe wording for clients, technical for admins. |
| `GET orgs`, `GET orgs/:id/score\|users\|audit\|scans`, `PATCH orgs/:id`, `POST orgs/:id/invite` | admin | Org management. |

Every state change writes to `audit_log` (actor, role, action, target, IP).

## 5. Scoring model (deterministic — no AI)

- Severity weights: critical 10, high 6, medium 3, low 1. Pass = full weight, warn = half, fail/unanswered/unscanned = zero. `error` (check could not run, usually not elevated) is excluded and flagged "unverified". N/A with an **approved** override is excluded.
- Precedence per device × control: approved device override → approved org override → agent finding.
- Technical score = mean of device scores. Administrative = weighted manual attestations. Overall = 60 % technical + 40 % administrative. Any failing **critical** control caps the overall at 69.
- Grades: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F.
- Framework scores only count controls mapped to that framework; an org's `frameworks` setting (Org Settings) drops out-of-scope controls entirely — e.g. a client with no card payments runs HIPAA-only.

## 6. Access control

**Client portal** — Netlify Identity login. Role `client` plus `app_metadata.org_id`, or a row in `org_users`. Every API call re-derives the org server-side from the bearer token; the `org` query parameter is ignored for clients, so one client can never read another's data.

**Admin console — two independent factors:**

1. **Gate password** (`TEKNIK_ADMIN_GATE_PASSWORD`). An edge function intercepts `/compliance/admin/*` and serves a password page instead of the console until a valid cookie is presented. The console HTML never reaches an unauthenticated browser. The cookie is `HttpOnly; Secure; SameSite=Strict`, holds only an expiry plus an HMAC-SHA256 of it keyed by the password, and lasts 12 hours. Wrong passwords get a 700 ms delay and an `admin.gate.deny` audit row.
2. **Identity admin role.** Every `/api/compliance/*` call from an admin re-checks the bearer token against Identity *and* re-validates the gate cookie (`lib/compliance/auth.mjs → requireUser`). The gate is therefore not just a doorway on the HTML — the API enforces it too, so a leaked API path is useless without both.

Both fail closed: no `TEKNIK_ADMIN_GATE_PASSWORD` set means the console and the admin API return 503 rather than opening unprotected.

## 7. PHI / cardholder-data handling

- The agent **never uploads file contents.** DATA-01 reports path, size, owner, modified date, pattern-type hit counts, and one masked sample (`***-**-1234`).
- Agent evidence bundles are configuration exports only (Defender, BitLocker, firewall, audit policy, security policy INF, local accounts, hotfixes, software inventory, listening ports, w32tm). No user documents.
- Client evidence uploads require an attestation checkbox ("no patient records / PHI / full card numbers"). Redact before uploading.
- **Netlify DB is not HIPAA-eligible by default and is not PCI-certified.** The design keeps PHI out of the platform, which makes it acceptable for compliance *findings*. If you later want to store client documents that might contain PHI, either arrange a HIPAA configuration with Netlify or move Postgres + object storage to Azure — the schema is vanilla Postgres and Blobs usage is isolated to two functions. Put a data-handling clause in the engagement letter either way.
- PHI discovery *paths* are themselves sensitive (filenames often contain patient names). Compliance pages send `no-store` and `noindex`, and `/agent/*`, `/tests/*`, `/docs/*` and `/node_modules/*` are 404'd from the public site.

## 8. Design decisions worth knowing

1. **A third agent variable, `$AgentKey`.** Beyond client e-mail and name, the agent needs one shared secret so anyone holding the script can't create or spam client records. Set it once via RMM environment variable; your two client variables are untouched.
2. **No `"type": "module"` in `package.json`.** The site's existing functions (`create-checkout.js`, `report.js`, `email-security.js`) are CommonJS — `exports.handler` and `require`. Declaring the package as ESM would break all three. Every compliance function is `.mjs`, which is ESM regardless.
3. **All compliance functions are prefixed `compliance-`.** `report.js` already existed; two functions resolving to the same name is a deploy-time collision. Routing comes from each function's `export const config = { path }`, so the filenames are free to be explicit.
4. **The stock Netlify Identity widget was dropped.** It loads from `identity.netlify.com`, and this site's CSP is `script-src 'self' 'unsafe-inline'`. Rather than open a security company's own CSP to a third-party host, `compliance/auth.js` speaks GoTrue directly at `/.netlify/identity` (`POST /token`, `GET /user`, `POST /recover`, `POST /verify`) — same origin, no external code, CSP untouched.
5. **Shared server code lives in `/lib/compliance/`,** matching the existing engine layout and inheriting the `/lib/* → 404` redirect. The control catalog is a `.mjs` module rather than a JSON file so the bundler cannot lose it and there is only ever one copy.
6. **Org identity = client name.** Two scans with the same `-ClientName` merge; a typo creates a second org (visible in the console's org list, fixable in the DB). The slug is shown in Org Settings.
7. **Evidence is capped at 4.5 MB per file** — the synchronous function payload limit. Agent bundles run 100–300 KB. Larger client uploads would need a background function or a signed direct-to-Blob upload.
8. **Warn = half credit** and the **critical-fail cap** are policy values in `catalog.mjs → scoring`. Tune them there, not in code.
9. **Windows 10 fails PATCH-01** unless overridden N/A (ESU-enrolled); Windows 11 23H2 Enterprise warns until Nov 2026.
10. **Client N/A requests stay pending until approved,** so a client cannot inflate their own score. Admin overrides apply immediately. Both are audited.
11. **The report prints from the browser** rather than a server-side PDF, avoiding a headless-Chrome function. Print → Save as PDF gives a letter-size document with page footers.

## 9. AI usage and cost

Claude is used for two optional things. Everything that produces a score, finding, or remediation script is deterministic and makes no API call.

| Use | Model (default) | Tokens (typical) | Cost per call |
|---|---|---|---|
| Executive narrative on report generation | Sonnet ($2 in / $10 out per 1M) | ~3,000 in / ~800 out | **≈ $0.01–0.02** |
| "Explain with AI" per control | Haiku 4.5 ($1 / $5 per 1M) | ~900 in / ~350 out | ≈ $0.003 |
| Same narrative on Opus 5 ($5 / $25) | | | ≈ $0.05 |

A full client assessment — one narrative plus a handful of explanations — stays under **$0.10**; 50 clients quarterly is a few dollars a year. Only aggregate scores, control titles/statuses and gap summaries are sent: no PHI file paths, no evidence, no usernames. The prompt states the model must not invent findings, and the narrative is labelled as assessor-reviewed in the report. Leave `ANTHROPIC_API_KEY` unset and reports fall back to a deterministic executive summary.

## 10. Operating checklist per client

1. Run the agent on every workstation (RMM policy, monthly).
2. Invite additional client users from Org Settings; confirm the questionnaire is answered and evidence uploaded.
3. Review pending N/A requests; add admin overrides for compensating controls with a re-review date.
4. Open a device → *Generate remediation script*; review with `-WhatIf`, then `-Apply` via RMM; re-scan.
5. Generate the report with narrative, read the narrative, print to PDF, deliver.

## 11. Testing

```
npm test                  # scoring engine + catalog integrity (8 tests)
node tests/fixture.mjs    # builds tests/fixture.json (synthetic 3-device org)
node tests/ui-smoke.mjs   # Playwright: renders admin/client/report against a stubbed API
```
Agent: run `TEKNIK-ComplianceScan.ps1 -ClientEmail x@y.com -ClientName "Lab" -NoUpload` on a test VM and inspect `C:\ProgramData\TEKNIK\Compliance\scan-*.json`.
