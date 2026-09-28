# TEKNIK Compliance Scan — one script, one page

`TEKNIK-Compliance-RMM.ps1` is the whole thing. It creates the client organization on
first check-in, runs the workstation assessment, packages evidence, and uploads it.
There is nothing else to deploy.

## Set three values

Open the script. The config block is the first thing after the header — edit these:

```powershell
$CFG_ClientName  = "Sunrise Pediatrics"
$CFG_ClientEmail = "office@sunrisepeds.com"
$CFG_AgentKey    = "<the TEKNIK_AGENT_KEY value>"
```

Or leave them blank and define `ClientName`, `ClientEmail`, `AgentKey` as RMM script
variables — those win over anything typed in the file. Environment variables
`TEKNIK_CLIENT_NAME` / `TEKNIK_CLIENT_EMAIL` / `TEKNIK_AGENT_KEY` work too.

If a required value is missing the script exits 2 and scans nothing, so a
half-configured job can never create a junk organization.

**`ClientName` is the join key.** Every workstation for a client must use the identical
spelling, or you end up with two organizations.

## Optional values

| Variable | Default | Use |
|---|---|---|
| `$CFG_NoUpload` | `$false` | `$true` scans and writes JSON locally, uploads nothing. Use for the first test. |
| `$CFG_SkipPhiScan` | `$false` | `$true` skips data discovery. Runtime drops to under a minute. |
| `$CFG_PhiBudgetMin` | `30` | Minutes allowed for data discovery before it stops early. |
| `$CFG_PhiExtraPaths` | `""` | Extra folders, semicolon separated: `"D:\Scans;\\NAS\Shared"` |
| `$CFG_ClientAdmins` | `""` | Client-owned admin accounts not to flag: `"clinicadmin;drsmith"` |

## Running it

Run as SYSTEM or elevated — about 15 checks need it and quietly report `error` otherwise.
No `param()` block, so it is safe in Syncro, Atera and Level, which inject their
variables above the script.

| Exit | Meaning |
|---|---|
| 0 | Scanned and uploaded |
| 2 | Missing or invalid configuration — nothing scanned |
| 3 | Scanned, upload failed. Results kept in `C:\ProgramData\TEKNIK\Compliance` |

Typical runtime 2–6 minutes. The data-discovery sweep dominates.

## What leaves the workstation

**Configuration findings** — the 63 control results, plus an evidence zip of Windows
configuration exports: Defender status, BitLocker, firewall, audit policy, security
policy, local accounts, hotfixes, software inventory, listening ports, time sync.
No user documents.

**Data-discovery findings** — for each flagged file: the file name, its full path, size,
modified date, owner, and which pattern types matched with their hit counts.

**No file content is captured at all** — not a fragment, not masked, not truncated.
There is deliberately no sample field anywhere in the payload or the evidence bundle.

One caveat worth knowing: a file *path* can itself contain a patient name
(`...\Desktop\Smith_John_labs.pdf`). The findings carry no record content, but they are
still confidential client information, which is why the portal and report are marked
accordingly and the pages are set to no-store and noindex.

TEKNIK (TNB Consulting Group, LLC) · helpdesk@tnbcg.com · 305-419-9992
