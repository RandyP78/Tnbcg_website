# TEKNIK — Site Restructure & Copy Deck

**Version 2.** Revised with your input on service scope, compliance frameworks, partners, and the FlexPoint client portal.

**How to read this:** anything marked `[CONFIRM: ...]` is a fact I don't have. Don't publish those lines until someone at TEKNIK fills them in. Section 8 lists what I still need from you.

---

## 1. Voice and positioning

### The brief

You asked for informative and inviting. Those pull in a useful direction, because most MSP websites are neither. They're either vague and warm ("we simplify IT so you can focus on what matters") or they're fear-driven ("one breach could end your business"). Both make the reader work to find out what the company actually does.

Informative and inviting means: say plainly what you do, explain things the reader might not know, and sound like a person who'd be easy to call. The copy below is written that way. It explains rather than warns.

### Voice rules

- Explain the thing, don't just name it. "SOC 2" means nothing to half your visitors. One sentence of plain English costs nothing and builds trust.
- Short sentences. Concrete nouns.
- No "empower," "seamless," "cutting-edge," "unlock," "in today's digital landscape."
- Say "we" and "you."
- Where you'd normally hedge, be specific instead. "Fast response" is weaker than an actual number.

### Positioning

You said you handle everything, and the site should reflect that. So the structure is full-service MSP with unusual compliance depth, rather than compliance-only.

That said, compliance is still your sharpest edge. In the South Florida market, plenty of MSPs advertise HIPAA and PCI support. Far fewer touch SOC 1, SOC 2, and CMMC. That combination is worth featuring prominently on the homepage and giving real page depth, because those searches carry high intent and low local competition.

**Working statement (internal, not site copy):**

> TEKNIK is a South Florida managed service provider handling the full stack — backups, Microsoft 365, infrastructure, and security — with compliance depth most MSPs our size don't have. HIPAA, PCI-DSS, SOC 1, SOC 2, and CMMC aren't add-ons we outsource. They shape how we build.

### A correction to flag

Your current site lists **SOX** and **GDPR** among the frameworks you support. Neither appeared in what you described to me. Meanwhile **SOC 1** and **SOC 2**, which you do handle, are missing from the site entirely.

I've written the new pages around your list: **PCI-DSS, SOC 1, SOC 2, HIPAA, CMMC Level 1, with Level 2 in progress.** Tell me if SOX and GDPR should stay. If you support them, they belong; if they were aspirational, dropping them makes the rest more credible.

### Language around compliance — read this before publishing

Three distinctions the copy has to hold, because getting them wrong creates real exposure:

**You implement controls. You don't certify.** SOC 1 and SOC 2 reports are attestations issued by a licensed CPA firm. CMMC Level 2 certification comes from an accredited C3PAO. TEKNIK's role is implementing the controls, producing the evidence, and preparing the client for assessment. Every sentence in this deck is written that way. Keep it that way.

**"Slowly venturing into Level 2" needs careful wording.** Don't advertise Level 2 capability you're still building. I've written it as growing capability with a clear statement of where you are today. Honest and current beats overstated.

**CMMC may apply to TEKNIK directly.** This is a business issue more than a copy issue, but it matters. Under CMMC, an MSP that stores, processes, or transmits a client's Controlled Unclassified Information is treated as an External Service Provider and falls inside the client's assessment scope. If you're pursuing Level 2 work, look at what that means for TEKNIK's own environment before you market it. Worth a conversation with a CMMC Registered Practitioner Organization.

Have counsel review `/services/compliance/` and both framework pages before launch.

---

## 2. Sitemap

### Phase 1 — launch

```
Home  /
│
├── Services  /services/
│   ├── Managed IT Services        /services/managed-it/
│   ├── Backup & Disaster Recovery /services/backup-disaster-recovery/
│   ├── Microsoft 365              /services/microsoft-365/
│   ├── Cybersecurity              /services/cybersecurity/
│   └── Compliance                 /services/compliance/
│       ├── HIPAA Compliance       /services/compliance/hipaa/
│       └── CMMC Readiness         /services/compliance/cmmc/
│
├── Industries  /industries/
│   ├── Healthcare                 /industries/healthcare/
│   ├── Financial & Professional   /industries/financial-services/
│   └── Defense Contractors        /industries/defense-contractors/
│
├── Partners  /partners/
├── About  /about/
├── IT Support in Miami  /it-support-miami/
├── Client Portal  /client-portal/
└── Contact  /contact/

Footer only
├── Privacy Policy  /privacy/
├── Terms  /terms/
└── Accessibility  /accessibility/
```

**Two structural decisions worth explaining:**

*Backup gets its own page.* You named online backups and local backups first when describing what you do, which tells me it's core. It's also a distinct search with commercial intent, and it's the service most often discovered to be broken during an incident. It earns a page.

*There's no separate "Cloud Services" page.* Your current site has one, but in practice it overlaps almost entirely with Microsoft 365 and Managed IT. Two thin pages competing for similar terms rank worse than one solid page. Cloud migration and management live inside the Microsoft 365 page and the Managed IT page. If you do meaningful Azure or AWS infrastructure work beyond M365, tell me and I'll write it a proper page.

### Phase 2 — after launch

| Addition | Trigger |
|---|---|
| `/services/compliance/pci-dss/` | When you have unique content beyond the hub summary |
| `/services/compliance/soc-2/` | Same. High-intent search, worth doing properly |
| `/case-studies/` | As soon as one client approves |
| `/insights/` blog | Once the core site is live and stable |
| Fort Lauderdale, Doral, Coral Gables pages | Only after Miami ranks. Thin duplicates will hurt you |
| Careers | When hiring |

### Page purposes

| URL | Job | Primary keyword |
|---|---|---|
| `/` | What you do, who for, proof | managed IT services Miami |
| `/services/managed-it/` | Sell the retainer | managed service provider Miami |
| `/services/backup-disaster-recovery/` | Capture backup demand | data backup and recovery Miami |
| `/services/microsoft-365/` | M365 deployment + hardening | Microsoft 365 migration Miami |
| `/services/cybersecurity/` | Security programs | cybersecurity services Miami |
| `/services/compliance/` | Route the compliance buyer | IT compliance services Miami |
| `/services/compliance/hipaa/` | High-intent healthcare search | HIPAA compliance IT services |
| `/services/compliance/cmmc/` | Low-competition, high-value | CMMC compliance MSP Florida |
| `/partners/` | Credibility through association | — |
| `/it-support-miami/` | Local pack | IT support Miami |
| `/client-portal/` | Existing client self-service | — |

---

## 3. Global elements

### Header

Logo left. Primary nav: **Services ▾ · Industries ▾ · Partners · About · Contact**

Right side, three items in this order:

1. **Client Portal** — text link, understated. Existing clients need it; prospects should ignore it.
2. **305-419-9992** — a real `tel:` link: `<a href="tel:+13054199992">`. Your current header sends this to a WhatsApp URL, which breaks click-to-call on desktop and reads as informal to a US business buyer. Keep WhatsApp as a footer icon if you use it with international clients.
3. **Book a Free Assessment** — primary button.

Sticky on scroll. Collapses to a hamburger below 900px, with the phone number staying visible on mobile.

### Trust bar

One row directly beneath every hero: partner logos, plus a stat or two.

`[Partner logos] · [CONFIRM: XX] years in South Florida · [CONFIRM: XX]-minute average response`

### Footer

Five columns.

**Column 1 — NAP.** Must match your Google Business Profile exactly, character for character. This is what feeds local search.

```
TEKNIK
[CONFIRM: Street address]
[CONFIRM: City], FL [CONFIRM: ZIP]
305-419-9992
[CONFIRM: email]
Mon–Fri [CONFIRM: hours]
[CONFIRM: after-hours / emergency support terms]
```

**Column 2 — Services.** All five service pages.

**Column 3 — Compliance.** HIPAA, CMMC, PCI-DSS, SOC 1 & SOC 2 (the last two linking to the hub until their pages exist).

**Column 4 — Industries.** All three.

**Column 5 — Company.** About, Partners, Contact, Client Portal, Privacy, Terms, Accessibility, social icons.

Bottom: `© 2026 TEKNIK. Where solutions connect.`

Keep the tagline. It works as a signature. It just can't do the homepage's job.

### Accessibility

Every icon-only link needs a label. Your current footer icons have no text at all, so a screen reader announces them as "link":

```html
<a href="https://wa.link/9c93ae" aria-label="Message TEKNIK on WhatsApp">
```

### Imagery

A note on making the site inviting. The current site uses stock server-room renders and 3D icons, which is what every MSP uses and which signals nothing.

If you can get photographs of your actual team and workspace, use them. A real person's face on the About page and in the footer does more for "inviting" than any copy in this document. `[CONFIRM: are team photos possible?]`

---

## 4. Page copy

---

### 4.1 Home — `/`

**Title tag:** Managed IT & Compliance for South Florida | TEKNIK
**Meta description:** Miami MSP handling backups, Microsoft 365, cybersecurity and compliance — HIPAA, PCI-DSS, SOC 2 and CMMC. One team for your whole IT operation. Free assessment.

---

**HERO**

# Managed IT and compliance for South Florida businesses

We keep your systems running, your data backed up, and your business ready for whatever your auditor asks next. Backups, Microsoft 365, cybersecurity, and compliance — from one team that picks up the phone.

`[Book a Free Assessment]` `[Call 305-419-9992]`

> **Build note:** replace the autoplaying `SERVERS.mp4` with a static image, or a WebM under 1MB with a poster frame and `preload="none"`. That file currently loads on every visit and is almost certainly your slowest asset on mobile.

---

**TRUST BAR** — partner logos + stats (Section 3)

---

**WHAT WE DO**

## Everything your IT needs, under one roof

Most businesses end up with three or four vendors: one for the network, one for backups, one for Microsoft 365, and a consultant who appears at audit time. Nobody owns the whole picture, and the gaps between them are where problems live.

TEKNIK covers all of it.

**Managed IT** — Monitoring, patching, helpdesk, and the day-to-day work of keeping systems healthy. We're your IT department, or backup for the one you have. → *Learn more*

**Backup & Disaster Recovery** — Local and cloud backups, configured properly and tested regularly, so recovery is a procedure rather than a hope. → *Learn more*

**Microsoft 365** — Deployment, migration, and security hardening. Most M365 tenants run on default settings that were never meant to be a security posture. → *Learn more*

**Cybersecurity** — Endpoint protection, firewall and perimeter management, vulnerability scanning, penetration testing, and training for your team. → *Learn more*

**Compliance** — HIPAA, PCI-DSS, SOC 1, SOC 2, and CMMC. Controls implemented, evidence collected, auditors answered. → *Learn more*

---

**DIFFERENTIATOR**

## Compliance isn't something we bolt on afterward

Here's a pattern we see often. A company hires an IT provider, everything works fine, and then an auditor arrives and asks for twelve months of access reviews. Nobody was collecting them. Audit logging was never enabled. The backups were configured but never tested.

None of that was negligence exactly. It's that compliance was treated as a separate project from IT, when it's really a set of requirements about how IT should have been built in the first place.

We work the other way around. If HIPAA, PCI-DSS, SOC 2, or CMMC applies to you, that shapes your environment from day one — which means audit season becomes a document request instead of a scramble.

`[CONFIRM: a concrete proof point belongs here. Something like "We've supported XX clients through audit with zero material findings." One real number outperforms three paragraphs.]`

---

**PARTNERS**

## The tools behind the service

We build on platforms that are trusted, well-supported, and appropriate for regulated environments.

`[Partner logo grid]` → *About our partners*

---

**PROCESS**

## What working with us looks like

**1. Assessment.** We review what you have: infrastructure, backups, Microsoft 365 configuration, security posture, and where you stand against any framework that applies to you. Free, and you keep the findings whether or not you hire us.

**2. Roadmap.** A prioritized plan separating urgent from important from later, with costs attached so you can budget properly.

**3. Onboarding.** We document your environment, deploy monitoring and endpoint protection, and take over support. `[CONFIRM: typical timeline]`

**4. Ongoing.** Monitoring, patching, helpdesk, and quarterly reviews where we walk you through what changed and what's coming.

`[Start with an assessment]`

---

**INDUSTRIES**

## Who we work with

**Healthcare** — Practices, clinics, and billing companies handling PHI under HIPAA. → *Learn more*

**Financial & professional services** — Firms with SOC 1 or SOC 2 obligations, PCI-DSS scope, or client data they're accountable for. → *Learn more*

**Defense contractors** — Suppliers who need CMMC and NIST 800-171 controls to hold their contracts. → *Learn more*

---

**PROOF**

`[CONFIRM: testimonials. Each needs a name, title, and company, or a specific anonymized descriptor — "a 40-provider dental group in Broward." Unattributed praise reads as invented and is worse than an empty section.]`

---

**LOCAL**

## Based in Miami. On site when you need us.

Most issues resolve remotely in minutes. When they don't, we're local — `[CONFIRM: service area]`.

`[CONFIRM: address]` · 305-419-9992

---

**FINAL CTA**

## Let's find out where you stand

The assessment is free and takes about `[CONFIRM: duration]`. You'll come away with a written picture of your infrastructure, your backups, your security gaps, and your compliance exposure — whatever you decide to do next.

`[Book Your Assessment]` `[Call 305-419-9992]`

---

### 4.2 Services hub — `/services/`

**Title tag:** IT Services for South Florida Businesses | TEKNIK
**Meta description:** Managed IT, backup and disaster recovery, Microsoft 365, cybersecurity and compliance services for businesses across Miami and South Florida.

---

# Five services, one team, one number to call

Short intro paragraph, then a card for each of the five service lines using the summaries from the homepage, each linking through.

Close with: `[Not sure where to start? Book a free assessment]`

---

### 4.3 Managed IT — `/services/managed-it/`

**Title tag:** Managed IT Services in Miami | TEKNIK MSP
**Meta description:** 24/7 monitoring, helpdesk, patching and vendor management for South Florida businesses. Your IT department, or support for the one you already have.

---

# Managed IT services

## The day-to-day work of keeping everything running

For most businesses under `[CONFIRM: employee threshold]` people, a managed provider costs less than one full-time hire and covers considerably more ground. You get a team instead of a person, and coverage that doesn't take vacation.

## What's included

**Infrastructure management** — Networks, servers, and critical systems monitored around the clock, patched on a schedule, with defined response when something fails.

**Helpdesk and end-user support** — Remote and on-site support for your staff. Troubleshooting, configuration, employee onboarding and offboarding, hardware and software installation. `[CONFIRM: support hours, after-hours terms]`

**Network monitoring and performance** — Continuous monitoring that catches bottlenecks and failures before your team notices them, with monthly reporting on uptime.

**Software and license management** — Tracking usage, renewals, and entitlement. Most clients find they've been paying for licenses nobody uses.

**Project work** — Migrations, upgrades, and deployments, planned and scheduled in advance rather than improvised.

**Technology consulting** — Quarterly reviews on where your infrastructure is heading and what it should cost.

## Service levels

`[CONFIRM: this whole table. Publishing real response times is one of the strongest differentiators available to you — most local MSPs won't. Only publish what's contractual and what you consistently meet.]`

| Priority | Meaning | Response |
|---|---|---|
| Critical | Business stopped | `[CONFIRM]` |
| High | A department or function impaired | `[CONFIRM]` |
| Normal | One user impaired | `[CONFIRM]` |
| Low | Request or scheduled work | `[CONFIRM]` |

## What it costs

`[CONFIRM: I'd push for at least a range — "typically $XX–$XX per user per month." Buyers filter out vendors who hide pricing entirely, and hiding it mostly attracts people who were never going to buy.]`

`[Book a free assessment]`

---

### 4.4 Backup & Disaster Recovery — `/services/backup-disaster-recovery/`

**Title tag:** Data Backup & Disaster Recovery Services | Miami | TEKNIK
**Meta description:** Local and cloud backups for South Florida businesses, configured to survive the failure they're protecting against — and tested so you know they work.

---

# Backup and disaster recovery

## Local and cloud backups that actually restore

Almost every business we assess has backups. A smaller number have backups that would survive the event they're meant to protect against, and fewer still have ever tested a restore.

The difference matters. Ransomware looks for connected backups. A fire doesn't care that the backup server was in the same closet. And a backup nobody has restored from is a hypothesis, not a safeguard.

## How we build it

**Local backups** — On-site backup for fast recovery of individual files, mailboxes, or whole systems. Fastest path back when the problem is local.

**Cloud backups** — Off-site, geographically separate copies for the scenarios where the building itself is the problem. Encrypted in transit and at rest.

**Immutable and isolated copies** — Backups that can't be altered or deleted within their retention window, including by an attacker holding domain credentials. `[CONFIRM: which of your platforms support immutability]`

**Microsoft 365 backup** — Worth stating plainly: Microsoft's retention policies are not a backup. Deleted mail, SharePoint content, and OneDrive files age out. We back up M365 independently. → *See our Microsoft 365 services*

**Documented recovery objectives** — We define with you how much data you can afford to lose (RPO) and how long you can afford to be down (RTO), then build to hit those numbers rather than guessing.

**Restore testing** — Scheduled test restores with documented results. This is the part most providers skip, and it's the only part that proves the rest works.

## Business continuity in South Florida

`[CONFIRM: whether you offer this — I'd recommend it. Hurricane season is a concrete, local, annually recurring concern that almost no MSP markets well. Pre-season readiness checks, offsite backup verification, and a documented continuity plan would differentiate this page in a way generic backup copy never will.]`

`[Book a backup assessment]`

---

### 4.5 Microsoft 365 — `/services/microsoft-365/`

**Title tag:** Microsoft 365 Deployment, Migration & Hardening | TEKNIK
**Meta description:** Microsoft 365 migration and security hardening for South Florida businesses. Conditional access, MFA, DLP and audit logging configured for HIPAA, PCI and SOC 2.

---

# Microsoft 365, configured for how you actually operate

## Deployment, migration, and security hardening

Microsoft 365 ships with defaults chosen to work for every organization on earth. That's the right decision for Microsoft and the wrong configuration for a business handling patient records, cardholder data, or CUI.

A default tenant will typically allow legacy authentication protocols that bypass MFA, leave audit logging at minimum retention, permit users to consent to third-party apps on their own, and share files externally with no restriction. None of that is a flaw. It's a starting point that most tenants never move past.

We move it.

## What we do

**Migration** — From on-premises Exchange, Google Workspace, or another tenant. Mail, files, and permissions moved with a tested plan and a rollback path.

**Identity and access hardening** — MFA enforced across the board, conditional access policies based on device and location, legacy authentication disabled, and privileged accounts separated from daily-use accounts.

**Data protection** — Data loss prevention policies, sensitivity labels, retention rules, and controls on external sharing that match what your regulators expect.

**Audit logging and evidence** — Logging enabled with retention that satisfies your framework, and configured so that when an assessor asks who accessed what, the answer exists.

**Email security** — SPF, DKIM, and DMARC configured properly, plus anti-phishing and safe-attachment policies.

**Licensing review** — Matching license tiers to what you actually need. Some compliance controls require a specific tier, and some organizations pay for tiers they don't use.

**Ongoing management** — User provisioning and deprovisioning, tenant monitoring, and configuration review as Microsoft changes defaults.

## Hardening levels

You mentioned granular levels of hardening, which is a genuinely useful thing to make explicit — most clients don't know these choices exist.

`[CONFIRM: describe your actual tiers. Something like: Baseline (MFA, legacy auth disabled, standard logging) / Enhanced (conditional access, DLP, extended retention) / Regulated (framework-specific controls for HIPAA, PCI-DSS, SOC 2, or CMMC). Presenting these as named tiers makes an abstract service concrete and gives you a natural upsell conversation.]`

`[Book a Microsoft 365 review]`

---

### 4.6 Cybersecurity — `/services/cybersecurity/`

**Title tag:** Cybersecurity Services for Miami Businesses | TEKNIK
**Meta description:** Endpoint protection, firewall management, vulnerability scanning, penetration testing and security training for South Florida businesses.

---

# Security that holds up under real conditions

## Detection, defense, and the evidence to prove both

Security tools are easy to buy and easy to misconfigure. It's common to find an expensive endpoint agent deployed to 60% of machines, sending alerts to a mailbox nobody reads. The product was fine. Nobody owned it.

We own it.

## What we do

**Endpoint detection and response** — Managed EDR across workstations, servers, and mobile devices, with coverage verified rather than assumed.

**Threat monitoring and response** — Continuous monitoring with defined escalation paths. `[CONFIRM: be precise here — staffed SOC, vendor SOC, or automated alerting with business-hours response? "24/7 monitoring" means different things and compliance-minded buyers will ask you to specify.]`

**Firewall and perimeter protection** — Firewall, VPN, and traffic filtering configured and maintained, with rules reviewed rather than written once and forgotten.

**Vulnerability scanning** — Scheduled scans across your environment, with findings prioritized by real exploitability and tracked through to remediation.

**Penetration testing** — Simulated attack to establish what an actual intruder could reach. `[CONFIRM: in-house or partner-delivered, and methodology]`

**Security awareness training** — Phishing simulations and training for your team. Most successful intrusions begin with a person, not a system.

**Encryption and access control** — Data encrypted at rest and in transit, network segmentation, and access built on least privilege.

## Security and compliance are the same work

Nearly every framework you're subject to — the HIPAA Security Rule, PCI-DSS, SOC 2, CMMC — is a list of security controls plus a requirement to demonstrate they've been operating over time. We build security programs that produce that evidence as a byproduct instead of a separate project.

→ *See our compliance services*

`[Book a security assessment]`

---

### 4.7 Compliance hub — `/services/compliance/`

**Title tag:** IT Compliance Services: HIPAA, PCI, SOC 2, CMMC | TEKNIK
**Meta description:** Control implementation, evidence collection and audit preparation for HIPAA, PCI-DSS, SOC 1, SOC 2 and CMMC — for South Florida businesses.

---

# Audit season shouldn't be an emergency

## Controls implemented, evidence collected, auditors answered

Compliance problems rarely come from not knowing the rules. They come from controls that were configured once and never verified, and from evidence nobody was collecting until the request arrived.

We implement the technical controls your framework requires, keep them working, and maintain the documentation — so when an assessor asks for a year of access reviews, they're there.

**A note on what we do and don't do.** We're not an audit firm, and we don't issue certifications. SOC reports come from licensed CPA firms; CMMC Level 2 certification comes from an accredited third-party assessor. Our job is everything that has to be true before those people show up, plus standing beside you while they're there.

## Frameworks we support

**HIPAA** — Security Rule safeguards, risk assessments, access controls, audit logging, encryption, and business associate documentation. For practices, clinics, billing companies, and anyone handling PHI. → *Details*

**PCI-DSS** — Scope reduction, network segmentation, control implementation, and preparation for your SAQ or QSA assessment. If you take card payments, you've inherited obligations that are easier to meet than most people expect once the scope is drawn properly.

**SOC 1** — Controls over systems that affect your clients' financial reporting. Relevant if you're a service organization whose clients' auditors need assurance about your environment.

**SOC 2** — Controls across security, availability, confidentiality, processing integrity, and privacy. Increasingly the price of entry for selling to enterprise clients. We implement the controls and prepare the evidence; a CPA firm issues the report.

**CMMC** — Level 1 practices for Federal Contract Information, and readiness work toward Level 2 for Controlled Unclassified Information. → *Details*

## How a compliance engagement runs

**Gap assessment.** Where you stand today against every requirement that applies, documented.

**Remediation plan.** Findings prioritized by risk and by what an assessor looks at first, with effort and cost attached.

**Implementation.** We configure the controls and build evidence collection into normal operations, so it accumulates without anyone remembering to do it.

**Audit support.** We assemble the documentation package and respond to assessor requests directly, so your team isn't translating between auditor and engineer.

**Maintenance.** Controls drift as systems change. Quarterly reviews keep you compliant between assessments.

`[Book a compliance gap assessment]`

---

### 4.8 HIPAA — `/services/compliance/hipaa/`

**Title tag:** HIPAA Compliance IT Services | Miami | TEKNIK
**Meta description:** HIPAA Security Rule implementation for South Florida healthcare organizations — risk assessments, safeguards, audit logging, encryption and BAAs.

---

# HIPAA compliance, handled by the same team that runs your IT

## Security Rule safeguards, implemented and documented

A short explainer paragraph: HIPAA's Security Rule requires administrative, physical, and technical safeguards, plus a documented risk analysis, plus evidence that all of it has been operating. Most practices have some of this. Few have the documentation.

## What we implement

- **Risk analysis** — the periodic assessment the Security Rule requires, documented in the form OCR expects
- **Access controls** — role-based access to PHI, with reviews that are recorded
- **Audit logging** — logs showing who accessed what and when, retained appropriately
- **Encryption** — PHI encrypted at rest and in transit
- **Backup and contingency planning** — the Security Rule's data backup, disaster recovery, and emergency mode operation requirements
- **Workforce training** — role-appropriate security training with completion records
- **Business associate agreements** — we sign a BAA with you, and help you manage the ones you hold with other vendors
- **Breach response readiness** — a documented plan, because the notification clock starts at discovery

`[CONFIRM: healthcare case study or testimonial. This page converts on evidence more than any other page on the site.]`

`[Book a HIPAA readiness assessment]`

---

### 4.9 CMMC — `/services/compliance/cmmc/`

**Title tag:** CMMC Compliance Support for Defense Contractors | TEKNIK
**Meta description:** CMMC Level 1 implementation and Level 2 readiness for Florida defense contractors — gap assessment, SSP and POA&M development, NIST 800-171 controls.

---

# CMMC readiness for defense contractors

## Level 1 today, Level 2 as you grow into it

If your contracts involve Federal Contract Information or Controlled Unclassified Information, CMMC determines whether you can keep bidding. Level 1 covers basic safeguarding of FCI and is self-assessed. Level 2 covers CUI, maps to the 110 practices in NIST SP 800-171, and generally requires certification by an accredited third-party assessor.

**Where we are.** TEKNIK implements CMMC Level 1 practices today and supports clients working toward Level 2. `[CONFIRM: state your Level 2 capability accurately and currently — what you can do now versus what you're building. Understating and delivering beats the reverse, particularly with this buyer.]`

## What we do

- **Scoping** — determining which of your systems handle FCI or CUI, which is where most engagements should start and where cost is most often won or lost
- **Gap assessment** — your environment measured against the required practices
- **System Security Plan** — the SSP documenting how each practice is met
- **POA&M** — a plan of action and milestones for anything not yet met
- **Control implementation** — access control, audit and accountability, configuration management, identification and authentication, incident response, media protection, and system integrity
- **Assessment preparation** — evidence assembled and organized before the assessor arrives

**To be clear about roles:** TEKNIK is not an accredited assessor and does not issue CMMC certifications. We do the implementation and preparation work. Certification comes from an authorized C3PAO. `[CONFIRM with counsel]`

`[Book a CMMC scoping call]`

---

### 4.10 Industries — `/industries/` + three sub-pages

**Hub page:** short intro plus three cards.

Each industry page follows the same shape: the regulation they live under, the specific pain points, which of your five services matter most to them, and a case study. Healthcare draws on HIPAA, defense contractors on CMMC, financial and professional services on SOC 1, SOC 2, and PCI-DSS.

`[CONFIRM: I'll write these in full once you tell me which industries actually make up your client base — writing three detailed industry pages for sectors you don't serve would be wasted effort.]`

---

### 4.11 Partners — `/partners/`

**Title tag:** Our Technology Partners | TEKNIK
**Meta description:** The platforms and vendors behind TEKNIK's managed IT, backup, security and compliance services.

---

# The platforms behind the service

We're deliberate about what we build on. Every tool here was chosen because it holds up in regulated environments, because it's well supported, and because we'd rather go deep on a few platforms than shallow on many.

`[CONFIRM: I could not retrieve the partner logos from your current homepage — the page builder content isn't in the HTML source, which is the same reason your homepage has no indexable text. Please send me the list.]`

**Structure for each partner:** logo, name, one or two sentences on what they do for your clients, and your partner tier if you have one.

Two things to sort out before this page goes live:

- **Logo usage rights.** Most vendor partner programs have brand guidelines specifying how their logo may be displayed and what tier language you're permitted to use. Check each one. Displaying a logo you're not authorized to display is an easy problem to avoid.
- **Tier accuracy.** If you're a Microsoft Solutions Partner or hold a specific Fortinet or SentinelOne tier, say exactly which. Vague association ("we work with Microsoft") is weaker than a named tier, and a named tier you don't hold is a real risk.

**FlexPoint** belongs on this page too, described from the client's side: the platform behind your invoicing and payment portal, offering ACH and card payments, AutoPay, and a secure portal for viewing invoices. → *Go to the client portal*

---

### 4.12 Client Portal — `/client-portal/`

**Title tag:** Client Portal | Pay Your Invoice | TEKNIK
**Meta description:** Existing TEKNIK clients: pay an invoice, view billing history, or request support.

---

# Client portal

## For current TEKNIK clients

**Pay an invoice** — View invoices, pay by ACH or card, see your payment history, and set up AutoPay through our billing portal, powered by FlexPoint.

`[Go to Payment Portal →]` `[CONFIRM: your exact FlexPoint client portal URL — likely a branded subdomain or a link under apps.getflexpoint.com rather than the getflexpoint.com marketing site. Sending clients to a vendor's homepage where they have to hunt for a login is a small but real friction point.]`

**Request support** — `[CONFIRM: ticket email address, portal URL, or support phone line]`

**Start a remote session** — `[CONFIRM: remote support tool link, if you offer one]`

**Emergency support** — `[CONFIRM: after-hours procedure and number]`

> **Note on placement.** Keep this link in the header and footer, but understated. Existing clients will find it; prospects should have their attention on the assessment CTA. Give the payment link `rel="noopener"` and open it in a new tab so people don't lose your site.

> **Also worth doing:** a dedicated support line separate from the sales form. Right now an existing client with a server down and a prospect kicking tires both land in the same inbox. That's a bad experience for the people already paying you.

---

### 4.13 About — `/about/`

**Title tag:** About TEKNIK | Miami Managed IT & Compliance Provider
**Meta description:** TEKNIK is a South Florida managed service provider handling IT infrastructure, backups, Microsoft 365, cybersecurity and compliance for regulated businesses.

---

# Where solutions connect

This page decides whether a serious buyer trusts you, and it's almost entirely facts I don't have. Structure below; you supply the substance.

**Who we are** — `[CONFIRM: founded when, by whom, and why. Two paragraphs. Specificity does the work: "founded in 2016 by two engineers who spent a decade supporting hospital IT" beats any adjective.]`

**How we work** — Three short principles. Suggested:

> **Compliance shapes the build.** If regulation applies to you, it belongs in the design, not in a project after the fact.
>
> **We say what will happen, then do that.** Response times, project dates, and costs committed in advance.
>
> **Your environment is yours.** You get full documentation of your own systems. If you ever leave, you leave with it.

**Our team** — `[CONFIRM: names, roles, certifications, photos. Even three people with real credentials outperforms a stock photo of a data center. A buyer handing you their compliance exposure wants to know who's actually doing the work.]`

**Credentials** — `[CONFIRM: staff certifications, partner tiers, insurance including cyber liability and E&O]`

**By the numbers** — `[CONFIRM: years operating, clients under management, endpoints managed, audits supported]`

---

### 4.14 IT Support in Miami — `/it-support-miami/`

**Title tag:** IT Support & Managed Services in Miami, FL | TEKNIK
**Meta description:** Local IT support for Miami and South Florida businesses. On-site and remote managed services, backups, Microsoft 365, cybersecurity and compliance.

---

# IT support in Miami and South Florida

## Local, on site, and reachable

TEKNIK is based in `[CONFIRM: city/neighborhood]` and supports businesses across `[CONFIRM: which counties]`. Most issues resolve remotely within minutes. When they don't, we come to you.

**Areas served:** `[CONFIRM: list only where you'll genuinely travel]`

Then: brief summaries of the five services linking to their pages, the hurricane continuity angle if you offer it, an embedded map, and the full NAP block.

**Also:** claim and fully complete your Google Business Profile. For a local MSP, that profile generates more calls than the website does, and it costs nothing.

---

### 4.15 Contact — `/contact/`

**Title tag:** Contact TEKNIK | Miami IT Support — 305-419-9992
**Meta description:** Talk to a TEKNIK engineer about managed IT, backups, Microsoft 365, cybersecurity or compliance. Call 305-419-9992 or request a free assessment.

---

# Let's talk about what you need

Tell us what's going on and one of our engineers will get back to you `[CONFIRM: within what timeframe — "within one business day" is worth promising if you can keep it]`.

**Call** — 305-419-9992, `[CONFIRM: hours]`
**Email** — `[CONFIRM]`
**Visit** — `[CONFIRM: address]`

**Already a client with an urgent issue?** → *Client portal* `[CONFIRM: or direct support line]`

**Form fields** — keep it short; every field costs submissions:

- Full name *
- Work email *
- Phone *
- Company *
- What can we help with? * (Managed IT / Backup & recovery / Microsoft 365 / Cybersecurity / Compliance & audit / Something else)
- Tell us more (optional)
- **Send Request**

Developer notes:
- Visible `<label>` on every field, tied to its input with `for`/`id` — not placeholder text alone
- Validation errors announced in text, not color alone
- Honeypot field plus server-side validation instead of a CAPTCHA
- Redirect to `/thank-you/` after submit so conversions are trackable
- Autoresponder confirming receipt and restating the response time

---

## 5. Technical requirements

**Heading structure.** One `<h1>` per page. Your current services page wraps full paragraphs in `<h1>` and `<h2>` tags with at least four competing H1s. Headings label sections; they aren't a styling shortcut.

**Homepage indexability.** The homepage currently returns no body content at all when fetched — everything lives inside the page builder. Whatever the new build is, verify that the rendered HTML actually contains your copy. Check it with a plain fetch, not just a browser.

**Redirects.** `/` and `/home/` both currently serve the same content. 301 `/home/` to `/`. Build a complete old-to-new URL map before launch.

**Images.** Descriptive `alt` on every meaningful image. Your current images use `title` instead, which screen readers largely ignore. Serve WebP at appropriate sizes.

**Video.** Replace both autoplaying MP4 backgrounds. If video stays: compressed WebM under 1MB, `poster` image, `muted`, `playsinline`, `preload="none"`, static image on mobile.

**Meta descriptions.** Unique per page, 140–155 characters. The current services page has a three-word description.

**Structured data.** `LocalBusiness` schema on the homepage and Miami page with exact NAP. `Service` schema on each service page. `FAQPage` on compliance pages if you add FAQs.

**Performance.** LCP under 2.5s, CLS under 0.1 on a mid-range Android over 4G.

**Analytics.** GA4 with form submissions and `tel:` clicks configured as conversion events, plus Search Console. You currently have no way to know which pages generate calls.

**Accessibility.** WCAG 2.1 AA. Keyboard navigable, visible focus states, 4.5:1 contrast, `aria-label` on every icon link.

---

## 6. Platform and hosting — Netlify

**Decision: static build on Netlify.** Good fit for an 18-page marketing site. Fast, no server to patch, and free or near-free at your traffic level.

Recommended stack: **Astro**, content in Markdown, deployed from a Git repository. Astro ships almost no JavaScript by default, which is how you hit the performance targets in Section 5 without effort.

There's a reason this matters more for you than for most businesses. You sell cybersecurity and compliance. A prospect evaluating your security services can look at your own stack, and an outdated plugin-heavy WordPress install is a credibility problem in a way it wouldn't be for a landscaping company. A static site with proper security headers is a small, quiet piece of proof.

### Contact form

Netlify Forms handles this without a backend. Add `data-netlify="true"` and a `name` attribute to the form, and submissions are captured server-side.

```html
<form name="contact" method="POST" data-netlify="true"
      netlify-honeypot="bot-field" action="/thank-you/">
  <input type="hidden" name="form-name" value="contact" />
  <p class="hidden"><input name="bot-field" /></p>
  <!-- fields per Section 4.15 -->
</form>
```

Notes:
- The `netlify-honeypot` attribute gives you spam filtering without a CAPTCHA. Keep it that way — CAPTCHAs cost you real submissions.
- `action="/thank-you/"` gives you the trackable conversion page from Section 5.
- Set up an email notification to the right inbox, and a separate one for the compliance-related enquiries if you want those routed differently.
- **Check the plan limits.** The free tier caps form submissions per month; a business site can exceed it. Confirm current limits before launch — a silently dropped lead is expensive.
- Netlify stores submissions. If a prospect ever types something sensitive into "tell us more," it lives in a third-party system. Worth a line in your privacy policy, and worth thinking about given who your clients are.

### Redirects

A `_redirects` file in your publish directory, or the `[[redirects]]` block in `netlify.toml`. These run at the edge and return real 301s.

```
/home/               /                                    301
/our-services/       /services/                           301
/our-services#msp    /services/managed-it/                301
/contact/            /contact/                            200
```

Build the complete old-to-new map before launch. Pull your current URL list from Search Console and from your existing sitemap so nothing is missed.

### Security headers

Set these in `netlify.toml`. For a company selling cybersecurity, scoring well on securityheaders.com is worth the twenty minutes.

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "geolocation=(), microphone=(), camera=()"
    Content-Security-Policy = "default-src 'self'; img-src 'self' data: https:; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; frame-src https://www.google.com"
```

The CSP will need tuning once you know exactly what third-party scripts you're loading — analytics, map embed, anything else. Build it in report-only mode first, watch the console, then enforce.

### DNS cutover

`tnbcg.tech` currently points at your WordPress host. The sequence:

1. Build and review on the Netlify preview URL
2. Add the custom domain in Netlify, which provisions a free Let's Encrypt certificate
3. Lower the TTL on your current DNS records to 300 seconds at least 48 hours before cutover
4. Point the apex and `www` at Netlify — either move nameservers to Netlify DNS or add their records at your current registrar
5. Verify the certificate issues and HTTPS resolves on both apex and `www`, with one redirecting to the other
6. Confirm redirects, forms, and analytics on the live domain before announcing anything
7. Restore normal TTLs

**Then decommission WordPress properly.** Don't leave the old install running quietly on a subdomain or a staging URL. It's an unpatched attack surface, it can get indexed and compete with your new pages, and if it's ever compromised it's compromised under your domain. Export what you need, take a final backup, then shut it down.

### Also worth setting up

- **Deploy previews.** Every pull request gets its own URL. Useful for reviewing copy changes without touching production.
- **Netlify Image CDN** for automatic format conversion and resizing, which covers most of the image requirements in Section 5.
- **Branch protection** so production only deploys from `main`.

### One thing outside the hosting question

`tnbcg.tech` is worth a conversation before you launch. The domain doesn't contain your company name, the acronym presumably refers to a prior identity, and `.tech` reads as less established than `.com` to a conservative B2B buyer. For a firm asking clients to trust it with HIPAA and CMMC exposure, the domain is doing quiet work against you.

Rebuilding is the cheapest possible moment to change it. If a reasonable `.com` is available, buy it, make it primary, and 301 the old domain across. If it isn't available or the brand equity is real, keep it — but decide deliberately rather than by default. `[CONFIRM: do you own any other domains?]`

---

## 7. Build sequence

1. Fill in the `[CONFIRM]` items — nothing else can be finalized without them
2. Legal review of compliance language, particularly CMMC and SOC
3. Confirm partner logo usage rights
4. Final copy incorporating your facts
5. Design the homepage and one service page as templates
6. Build the templates, then the remaining pages
7. Redirect map, analytics, schema, accessibility audit
8. Launch
9. Google Business Profile completion and local citations
10. Phase 2: case studies, then PCI and SOC 2 pages, then the blog

---

## 8. What I need from you

**To finish the copy:**

1. **Your partner list.** I couldn't pull it from the current site. Names and tiers.
2. **Your exact FlexPoint portal URL** — the branded client login, not the marketing site.
3. **SOX and GDPR** — keep them or drop them? They're on the current site but weren't in your list.
4. **Which industries** actually make up your client base, so the three industry pages are worth writing.
5. **Your Microsoft 365 hardening tiers** — what you call them and what's in each.
6. **Address, hours, email, service area, after-hours terms.**

**The things that will move the needle most:**

7. **One case study.** A single client willing to let you describe their engagement — even anonymized as "a 30-provider medical group in Miami-Dade" — will do more for conversion than every other change in this document.
8. **Real response times.** If you can publish contractual SLA numbers, do. Most of your local competitors won't.
9. **Team photos and names.** The fastest route to "inviting" that exists.
