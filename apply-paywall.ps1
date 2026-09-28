# ============================================================
#  TEKNIK — apply the M365 scan paywall, verify, and push.
#
#  Run from inside your local clone of RandyP78/tnbcg:
#
#      powershell -ExecutionPolicy Bypass -File apply-paywall.ps1
#
#  It writes the five files, runs the tests, shows you exactly what
#  changed, and pushes only if everything checks out. It will REFUSE
#  to push if anything unexpected is staged, or if the tests fail.
#
#  Add -DryRun to do everything except commit and push.
# ============================================================

param([switch]$DryRun)

$ErrorActionPreference = 'Stop'

function Fail($msg) { Write-Host "`n  STOPPED: $msg`n" -ForegroundColor Red; exit 1 }
function Ok($msg)   { Write-Host "  OK    $msg" -ForegroundColor Green }

Write-Host "`n=== 1. Checking the repo ===" -ForegroundColor Cyan

try { $remote = git remote get-url origin 2>$null } catch { $remote = $null }
if (-not $remote) { Fail "not a git repository. cd into your clone of RandyP78/tnbcg first." }
if ($remote -match 'Tnbcg_website') { Fail "this is the EMPTY repo (Tnbcg_website). You want RandyP78/tnbcg." }
Ok "remote: $remote"

$branch = git rev-parse --abbrev-ref HEAD
Ok "branch: $branch"

$dirtyBefore = @(git status --porcelain)
if ($dirtyBefore.Count -gt 0) {
    Write-Host "`n  NOTE: you have uncommitted changes already:" -ForegroundColor Yellow
    $dirtyBefore | ForEach-Object { Write-Host "        $_" -ForegroundColor Yellow }
    Write-Host "  Those will NOT be committed - only the five patch files are staged.`n" -ForegroundColor Yellow
}

# sanity: is this actually the site repo?
foreach ($marker in @('netlify/functions/remediate-plan.mjs','lib/session.mjs','package.json')) {
    if (-not (Test-Path $marker)) { Fail "expected file '$marker' not found. Wrong directory?" }
}
Ok "repo layout looks right"

Write-Host "`n=== 2. Writing the patch files ===" -ForegroundColor Cyan

$Payload = @{
  'lib/entitlement.mjs' = @{ b64 = 'LyogRW50aXRsZW1lbnQg4oCUIHRoZSBwYXl3YWxsIGdhdGUgZm9yIHRoZSBNaWNyb3NvZnQgMzY1IHJlbWVkaWF0aW9uIHNjYW4u'+
    'CgogICBXSFkgVEhJUyBJUyBTRVBBUkFURSBGUk9NIHJlcG9ydC5qcwoKICAgcmVwb3J0LmpzIGdhdGVzIGEgc3RhdGljIGRvY3Vt'+
    'ZW50OiBvbmUgcmVxdWVzdCwgb25lIHBheW1lbnQgY2hlY2suCiAgIFRoZSBzY2FuIGlzIGEgbXVsdGktY2FsbCBydW4g4oCUIHNu'+
    'YXBzaG90LCBwbGFuLCB0aGVuIG9uZSBhcHBseSBwZXIKICAgYXBwcm92ZWQgb3BlcmF0aW9uIOKAlCBhbmQgdGhlIGV4cGVuc2l2'+
    'ZSBjYWxsIGlzIHRoZSBwbGFubmVyLCB3aGljaAogICBzcGVuZHMgYWdhaW5zdCBBTlRIUk9QSUNfQVBJX0tFWSBldmVyeSB0aW1l'+
    'IGl0IHJ1bnMuIFVudGlsIG5vdyB0aGUKICAgb25seSB0aGluZ3Mgc3RhbmRpbmcgYmV0d2VlbiBhbiBhbm9ueW1vdXMgdmlzaXRv'+
    'ciBhbmQgdGhhdCBzcGVuZCB3ZXJlCiAgIGEgTWljcm9zb2Z0IHNpZ24taW4gYW5kIGFuIGluLW1lbW9yeSByYXRlIGxpbWl0ZXIg'+
    'dGhhdCwgYnkgaXRzIG93bgogICBhZG1pc3Npb24gaW4gbGliL3JhdGVsaW1pdC5tanMsIHJlc2V0cyB1bnByZWRpY3RhYmx5LgoK'+
    'ICAgV0hFUkUgVEhFIENIRUNLIEdPRVMKCiAgIHJlbWVkaWF0ZS1wbGFuLCBiZWZvcmUgdGhlIENsYXVkZSBjYWxsLCBhZnRlciB0'+
    'aGUgcmF0ZSBsaW1pdC4gQW4KICAgdW5wYWlkIHJlcXVlc3QgbXVzdCBjb3N0IG5vdGhpbmcuIFN0cmlwZSBpcyBjb25zdWx0ZWQg'+
    'b25jZSBwZXIgcnVuOwogICB0aGUgcmVzdWx0IGlzIHRoZW4gd3JpdHRlbiBpbnRvIHRoZSBzZWFsZWQgc2Vzc2lvbiBjb29raWUs'+
    'IHNvIGEKICAgdGVuLW9wZXJhdGlvbiBydW4gbWFrZXMgb25lIFN0cmlwZSBjYWxsIHJhdGhlciB0aGFuIGVsZXZlbi4KCiAgIEZB'+
    'SUxTIENMT1NFRC4gUEFZV0FMTF9FTkFCTEVEIHRydWUgd2l0aCBubyBTVFJJUEVfU0VDUkVUX0tFWSwgYQogICBTdHJpcGUgZXJy'+
    'b3IsIG9yIGEgZHJvcHBlZCBjb25uZWN0aW9uIGFsbCByZWZ1c2UuIEEgbWlzY29uZmlndXJhdGlvbgogICBtdXN0IG5ldmVyIHNp'+
    'bGVudGx5IG1ha2UgdGhlIHNjYW4gZnJlZS4KCiAgIEtOT1dOIExJTUlUQVRJT04g4oCUIFJFUExBWQoKICAgQSBwYWlkIGNoZWNr'+
    'b3V0IHNlc3Npb24gaWQgY2FuIGN1cnJlbnRseSBiZSByZXVzZWQgdG8gc3RhcnQgZnVydGhlcgogICBzY2Fucy4gUHJldmVudGlu'+
    'ZyB0aGF0IG5lZWRzIGEgcmVjb3JkIG9mIGNvbnN1bWVkIGlkcyBpbiBkdXJhYmxlCiAgIHN0b3JhZ2Ug4oCUIHRoZSBzYW1lIE5l'+
    'dGxpZnkgQmxvYnMgZGVwZW5kZW5jeSBsaWIvcmF0ZWxpbWl0Lm1qcyBhbHJlYWR5CiAgIG5lZWRzLiBVbnRpbCBib3RoIG1vdmUs'+
    'IHRoaXMgc3RvcHMgY2FzdWFsIGZyZWUgdXNlIGJ1dCBpcyBub3QgYSBoYXJkCiAgIGNlaWxpbmcgb24gQVBJIHNwZW5kLiBEbyBu'+
    'b3QgdHJlYXQgaXQgYXMgb25lLiAqLwoKZXhwb3J0IGNvbnN0IHBheXdhbGxFbmFibGVkID0gKCkgPT4KICBTdHJpbmcocHJvY2Vz'+
    'cy5lbnYuUEFZV0FMTF9FTkFCTEVEKS50b0xvd2VyQ2FzZSgpID09PSAndHJ1ZSc7CgovKiogQXNrIFN0cmlwZSB3aGV0aGVyIHRo'+
    'aXMgY2hlY2tvdXQgc2Vzc2lvbiBhY3R1YWxseSBjb21wbGV0ZWQuICovCmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdHJpcGVTZXNz'+
    'aW9uSXNQYWlkKHNlc3Npb25JZCwgeyBmZXRjaEltcGwgPSBmZXRjaCB9ID0ge30pIHsKICBpZiAoIXNlc3Npb25JZCB8fCB0eXBl'+
    'b2Ygc2Vzc2lvbklkICE9PSAnc3RyaW5nJykgcmV0dXJuIGZhbHNlOwoKICBjb25zdCBrZXkgPSBwcm9jZXNzLmVudi5TVFJJUEVf'+
    'U0VDUkVUX0tFWTsKICBpZiAoIWtleSkgewogICAgY29uc29sZS5lcnJvcignUEFZV0FMTF9FTkFCTEVEIGlzIHRydWUgYnV0IFNU'+
    'UklQRV9TRUNSRVRfS0VZIGlzIG5vdCBzZXQuJyk7CiAgICByZXR1cm4gZmFsc2U7CiAgfQoKICB0cnkgewogICAgY29uc3QgcmVz'+
    'ID0gYXdhaXQgZmV0Y2hJbXBsKAogICAgICBgaHR0cHM6Ly9hcGkuc3RyaXBlLmNvbS92MS9jaGVja291dC9zZXNzaW9ucy8ke2Vu'+
    'Y29kZVVSSUNvbXBvbmVudChzZXNzaW9uSWQpfWAsCiAgICAgIHsgaGVhZGVyczogeyBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7'+
    'a2V5fWAgfSB9LAogICAgKTsKICAgIGlmICghcmVzLm9rKSByZXR1cm4gZmFsc2U7CiAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQg'+
    'cmVzLmpzb24oKTsKICAgIHJldHVybiBzZXNzaW9uLnBheW1lbnRfc3RhdHVzID09PSAncGFpZCc7CiAgfSBjYXRjaCAoZXJyKSB7'+
    'CiAgICBjb25zb2xlLmVycm9yKCdTdHJpcGUgdmVyaWZpY2F0aW9uIGZhaWxlZDonLCBlcnIubWVzc2FnZSk7CiAgICByZXR1cm4g'+
    'ZmFsc2U7CiAgfQp9CgovKioKICogRGVjaWRlIHdoZXRoZXIgdGhpcyBydW4gbWF5IHByb2NlZWQuCiAqIFJldHVybnMgeyBvaywg'+
    'YWxyZWFkeUVudGl0bGVkLCBzdHJpcGVTZXNzaW9uSWQsIGZyZWUgfS4KICoKICogYGFscmVhZHlFbnRpdGxlZGAgdHJ1ZSBtZWFu'+
    'cyB0aGUgY29va2llIGNhcnJpZWQgdGhlIGZsYWcgYW5kIFN0cmlwZQogKiB3YXMgbm90IGNhbGxlZCwgc28gdGhlIGNhbGxlciBu'+
    'ZWVkIG5vdCByZS1pc3N1ZSB0aGUgY29va2llLgogKi8KZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNoZWNrRW50aXRsZW1lbnQoc2Vz'+
    'c2lvbiwgeyBzdHJpcGVTZXNzaW9uSWQgfSA9IHt9LCBvcHRzID0ge30pIHsKICBpZiAoIXBheXdhbGxFbmFibGVkKCkpIHJldHVy'+
    'biB7IG9rOiB0cnVlLCBhbHJlYWR5RW50aXRsZWQ6IHRydWUsIGZyZWU6IHRydWUgfTsKCiAgaWYgKHNlc3Npb24/LnBhaWQgPT09'+
    'IHRydWUpIHsKICAgIHJldHVybiB7IG9rOiB0cnVlLCBhbHJlYWR5RW50aXRsZWQ6IHRydWUsIHN0cmlwZVNlc3Npb25JZDogc2Vz'+
    'c2lvbi5zdHJpcGVTZXNzaW9uSWQgfTsKICB9CgogIGNvbnN0IHBhaWQgPSBhd2FpdCBzdHJpcGVTZXNzaW9uSXNQYWlkKHN0cmlw'+
    'ZVNlc3Npb25JZCwgb3B0cyk7CiAgaWYgKCFwYWlkKSByZXR1cm4geyBvazogZmFsc2UsIGFscmVhZHlFbnRpdGxlZDogZmFsc2Ug'+
    'fTsKCiAgcmV0dXJuIHsgb2s6IHRydWUsIGFscmVhZHlFbnRpdGxlZDogZmFsc2UsIHN0cmlwZVNlc3Npb25JZCB9Owp9CgovKiog'+
    'NDAyIGJvZHksIHNoYXBlZCBzbyB0aGUgdG9vbCBwYWdlIGNhbiByb3V0ZSBzdHJhaWdodCB0byBDaGVja291dCDigJQKICAgIHNh'+
    'bWUgY29udHJhY3QgdGhlIGVtYWlsLXNlY3VyaXR5IGFuZCBtMzY1LWhhcmRlbmluZyBwYWdlcyBhbHJlYWR5CiAgICBoYW5kbGUg'+
    'Zm9yIHJlcG9ydC5qcywgc28gdGhlIGZyb250IGVuZCBuZWVkcyBubyBuZXcgcGF0dGVybi4gKi8KZXhwb3J0IGZ1bmN0aW9uIHBh'+
    'eW1lbnRSZXF1aXJlZEJvZHkoKSB7CiAgcmV0dXJuIHsKICAgIGVycm9yOiAncGF5bWVudF9yZXF1aXJlZCcsCiAgICBtZXNzYWdl'+
    'OiAnVGhlIE1pY3Jvc29mdCAzNjUgcmVtZWRpYXRpb24gc2NhbiByZXF1aXJlcyBhIHB1cmNoYXNlLicsCiAgfTsKfQo=' }
  'netlify/functions/remediate-plan.mjs' = @{ b64 = 'LyogVHVybnMgYSBzaWduZWQgc25hcHNob3QgaW50byBhbiBvcmRlcmVkLCBkcnktcnVuIHBsYW4uCiAqCiAqIFRha2VzIHRoZSBz'+
    'bmFwc2hvdCBmcm9tIHJlbWVkaWF0ZS1zbmFwc2hvdCByYXRoZXIgdGhhbiByZWFkaW5nIHRoZQogKiB0ZW5hbnQgYWdhaW4sIHNv'+
    'IHRoaXMgZnVuY3Rpb24gZG9lcyBvbmx5IG9uZSBzbG93IHRoaW5nICh0aGUgQ2xhdWRlCiAqIGNhbGwpIGFuZCBzdGF5cyBpbnNp'+
    'ZGUgdGhlIHJ1bnRpbWUgbGltaXQuCiAqCiAqIFdyaXRlcyBub3RoaW5nLiBFdmVyeSBwcm9wb3NlZCBzdGVwIGlzIGRyeS1ydW4g'+
    'dGhyb3VnaCB0aGUgZXhlY3V0b3Igc28KICogdGhlIGN1c3RvbWVyIHNlZXMgcmVhbCBiZWZvcmUvYWZ0ZXIgdmFsdWVzLCBhbmQg'+
    'YmxvY2tlZCBvbmVzIHNheSB3aHkuICovCgppbXBvcnQgeyB1bnNlYWwsIHJlYWRDb29raWUsIHNpZ25QbGFuLCB2ZXJpZnlTbmFw'+
    'c2hvdCwgc2VhbCwgY29va2llSGVhZGVyIH0gZnJvbSAnLi4vLi4vbGliL3Nlc3Npb24ubWpzJzsKaW1wb3J0IHsgY3JlYXRlR3Jh'+
    'cGhDbGllbnQgfSBmcm9tICcuLi8uLi9saWIvcHJvdmlkZXJzL2dyYXBoLm1qcyc7CmltcG9ydCB7IHBsYW5SZW1lZGlhdGlvbiB9'+
    'IGZyb20gJy4uLy4uL2xpYi9wbGFubmVyLm1qcyc7CmltcG9ydCB7IHBsYW5PcGVyYXRpb25zIH0gZnJvbSAnLi4vLi4vbGliL2V4'+
    'ZWN1dG9yLm1qcyc7CmltcG9ydCB7IGNoZWNrUmF0ZSB9IGZyb20gJy4uLy4uL2xpYi9yYXRlbGltaXQubWpzJzsKaW1wb3J0IHsg'+
    'Y2hlY2tFbnRpdGxlbWVudCwgcGF5bWVudFJlcXVpcmVkQm9keSB9IGZyb20gJy4uLy4uL2xpYi9lbnRpdGxlbWVudC5tanMnOwoK'+
    'ZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoZXZlbnQpIHsKICBpZiAoZXZlbnQuaHR0cE1ldGhvZCAhPT0gJ1BPU1QnKSBy'+
    'ZXR1cm4ganNvbig0MDUsIHsgZXJyb3I6ICdNZXRob2Qgbm90IGFsbG93ZWQnIH0pOwoKICBjb25zdCBjb29raWUgPSByZWFkQ29v'+
    'a2llKGV2ZW50LmhlYWRlcnMgfHwge30pOwogIGNvbnN0IHNlc3Npb24gPSB1bnNlYWwoY29va2llKTsKICBpZiAoIXNlc3Npb24g'+
    'fHwgc2Vzc2lvbi5zdGFnZSAhPT0gJ3JlYWR5JykgewogICAgcmV0dXJuIGpzb24oNDAxLCB7IGVycm9yOiAnTm90IHNpZ25lZCBp'+
    'biwgb3IgdGhlIHNlc3Npb24gaGFzIGV4cGlyZWQuIFNpZ24gaW4gYWdhaW4uJyB9KTsKICB9CgogIC8vIEV2ZXJ5IGNhbGwgaGVy'+
    'ZSBzcGVuZHMgbW9uZXkgb24gdGhlIEFudGhyb3BpYyBBUEkuCiAgY29uc3QgcmF0ZSA9IGNoZWNrUmF0ZShgcGxhbjokeyhjb29r'+
    'aWUgfHwgJycpLnNsaWNlKDAsIDMyKX1gLCB7IGxpbWl0OiAxMCwgd2luZG93TXM6IDM2MDAwMDAgfSk7CiAgaWYgKCFyYXRlLm9r'+
    'KSB7CiAgICByZXR1cm4ganNvbig0MjksIHsgZXJyb3I6IGBUb28gbWFueSBwbGFubmluZyByZXF1ZXN0cy4gVHJ5IGFnYWluIGlu'+
    'ICR7cmF0ZS5yZXRyeUFmdGVyTWludXRlc30gbWludXRlcy5gIH0pOwogIH0KCiAgbGV0IGJvZHkgPSB7fTsKICB0cnkgeyBib2R5'+
    'ID0gSlNPTi5wYXJzZShldmVudC5ib2R5IHx8ICd7fScpOyB9IGNhdGNoIHsgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiAnQmFk'+
    'IHJlcXVlc3QgYm9keS4nIH0pOyB9CgogIC8vIFBheXdhbGwsIGJlZm9yZSB0aGUgQ2xhdWRlIGNhbGwuIEFuIHVucGFpZCByZXF1'+
    'ZXN0IG11c3QgY29zdCBub3RoaW5nLgogIGNvbnN0IGVudGl0bGVtZW50ID0gYXdhaXQgY2hlY2tFbnRpdGxlbWVudChzZXNzaW9u'+
    'LCB7CiAgICBzdHJpcGVTZXNzaW9uSWQ6IGJvZHkuc3RyaXBlU2Vzc2lvbklkLAogIH0pOwogIGlmICghZW50aXRsZW1lbnQub2sp'+
    'IHJldHVybiBqc29uKDQwMiwgcGF5bWVudFJlcXVpcmVkQm9keSgpKTsKCiAgY29uc3Qgc25hcHNob3QgPSB2ZXJpZnlTbmFwc2hv'+
    'dChib2R5LnNuYXBzaG90VG9rZW4pOwogIGlmICghc25hcHNob3QpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogJ1NuYXBzaG90'+
    'IG1pc3NpbmcsIGFsdGVyZWQsIG9yIGV4cGlyZWQuIFJlLXJ1biB0aGUgc2Nhbi4nIH0pOwoKICB0cnkgewogICAgY29uc3QgY3R4'+
    'ID0gewogICAgICBncmFwaDogY3JlYXRlR3JhcGhDbGllbnQoeyBhY2Nlc3NUb2tlbjogc2Vzc2lvbi5hY2Nlc3NUb2tlbiB9KSwK'+
    'ICAgICAgcGFyYW1zOiB7IGJyZWFrR2xhc3NJZHM6IGJvZHkuYnJlYWtHbGFzc0lkcyB8fCBbXSB9LAogICAgfTsKCiAgICAvLyBD'+
    'bGF1ZGUgaXMgb2ZmZXJlZCBvbmx5IHRoZSBvcGVyYXRpb25zIHJ1bm5hYmxlIGZvciB0aGlzIHJ1bi4KICAgIGNvbnN0IHByb3Bv'+
    'c2FsID0gYXdhaXQgcGxhblJlbWVkaWF0aW9uKHNuYXBzaG90LCB7IGN0eCB9KTsKICAgIGNvbnN0IHBsYW5uZWQgPSBhd2FpdCBw'+
    'bGFuT3BlcmF0aW9ucyhwcm9wb3NhbC5vcGVyYXRpb25zLm1hcChvID0+IG8uaWQpLCBjdHgpOwogICAgY29uc3QgcnVubmFibGUg'+
    'PSBwbGFubmVkLmZpbHRlcihwID0+IHAub3V0Y29tZSA9PT0gJ3BsYW5uZWQnKS5tYXAocCA9PiBwLmlkKTsKCiAgICByZXR1cm4g'+
    'anNvbigyMDAsIHsKICAgICAgc3VtbWFyeTogcHJvcG9zYWwuc3VtbWFyeSwKICAgICAgd2FybmluZ3M6IHByb3Bvc2FsLndhcm5p'+
    'bmdzLAogICAgICBzdGVwczogcGxhbm5lZC5tYXAocCA9PiAoewogICAgICAgIC4uLnAsCiAgICAgICAgd2h5OiBwcm9wb3NhbC5v'+
    'cGVyYXRpb25zLmZpbmQobyA9PiBvLmlkID09PSBwLmlkKT8ud2h5IHx8ICcnLAogICAgICB9KSksCiAgICAgIHBsYW5Ub2tlbjog'+
    'c2lnblBsYW4ocnVubmFibGUpLAogICAgfSwgZW50aXRsZW1lbnQuYWxyZWFkeUVudGl0bGVkID8gdW5kZWZpbmVkIDogcmVzZWFs'+
    'KHNlc3Npb24sIGVudGl0bGVtZW50KSk7CiAgfSBjYXRjaCAoZXJyKSB7CiAgICByZXR1cm4ganNvbig1MDIsIHsgZXJyb3I6IGVy'+
    'ci5tZXNzYWdlIH0pOwogIH0KfQoKLyogUmUtc2VhbCB0aGUgc2Vzc2lvbiB3aXRoIHRoZSBlbnRpdGxlbWVudCBmbGFnIHNldCwg'+
    'c28gcmVtZWRpYXRlLWFwcGx5CiAgIGNhbiB0cnVzdCBpdCB3aXRob3V0IGNhbGxpbmcgU3RyaXBlIGFnYWluLiBQcmVzZXJ2ZXMg'+
    'dGhlIHRva2VuJ3Mgb3duCiAgIHJlbWFpbmluZyBsaWZldGltZSByYXRoZXIgdGhhbiBleHRlbmRpbmcgaXQuICovCmZ1bmN0aW9u'+
    'IHJlc2VhbChzZXNzaW9uLCBlbnRpdGxlbWVudCkgewogIGNvbnN0IHR0bCA9IE1hdGgubWF4KDYwLCBNYXRoLmZsb29yKChzZXNz'+
    'aW9uLmV4cCAtIERhdGUubm93KCkpIC8gMTAwMCkpOwogIHJldHVybiBjb29raWVIZWFkZXIoc2VhbCh7CiAgICBzdGFnZTogJ3Jl'+
    'YWR5JywKICAgIGFjY2Vzc1Rva2VuOiBzZXNzaW9uLmFjY2Vzc1Rva2VuLAogICAgcGFpZDogdHJ1ZSwKICAgIHN0cmlwZVNlc3Np'+
    'b25JZDogZW50aXRsZW1lbnQuc3RyaXBlU2Vzc2lvbklkLAogIH0sIHsgdHRsU2Vjb25kczogdHRsIH0pLCB7IG1heEFnZTogdHRs'+
    'IH0pOwp9Cgpjb25zdCBqc29uID0gKHN0YXR1c0NvZGUsIGJvZHksIHNldENvb2tpZSkgPT4gKHsKICBzdGF0dXNDb2RlLAogIGhl'+
    'YWRlcnM6IHsKICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsCiAgICAnQ2FjaGUtQ29udHJvbCc6ICduby1z'+
    'dG9yZScsCiAgICAuLi4oc2V0Q29va2llID8geyAnU2V0LUNvb2tpZSc6IHNldENvb2tpZSB9IDoge30pLAogIH0sCiAgYm9keTog'+
    'SlNPTi5zdHJpbmdpZnkoYm9keSksCn0pOwo=' }
  'netlify/functions/remediate-apply.mjs' = @{ b64 = 'LyogQXBwbGllcyBPTkUgb3BlcmF0aW9uLiBPbmUgcGVyIHJlcXVlc3QsIGJlY2F1c2UgTmV0bGlmeSdzIHN0YW5kYXJkCiAgIGZ1'+
    'bmN0aW9ucyB0aW1lIG91dCBhdCAxMCBzZWNvbmRzIGFuZCBiZWNhdXNlIHRoZSBjdXN0b21lciBhcHByb3ZlZAogICBlYWNoIGl0'+
    'ZW0gaW5kaXZpZHVhbGx5LiAqLwoKaW1wb3J0IHsgdW5zZWFsLCByZWFkQ29va2llLCB2ZXJpZnlQbGFuIH0gZnJvbSAnLi4vLi4v'+
    'bGliL3Nlc3Npb24ubWpzJzsKaW1wb3J0IHsgcGF5d2FsbEVuYWJsZWQsIHBheW1lbnRSZXF1aXJlZEJvZHkgfSBmcm9tICcuLi8u'+
    'Li9saWIvZW50aXRsZW1lbnQubWpzJzsKaW1wb3J0IHsgY3JlYXRlR3JhcGhDbGllbnQgfSBmcm9tICcuLi8uLi9saWIvcHJvdmlk'+
    'ZXJzL2dyYXBoLm1qcyc7CmltcG9ydCB7IGFwcGx5T3BlcmF0aW9uLCBjcmVhdGVBdWRpdCB9IGZyb20gJy4uLy4uL2xpYi9leGVj'+
    'dXRvci5tanMnOwoKZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoZXZlbnQpIHsKICBpZiAoZXZlbnQuaHR0cE1ldGhvZCAh'+
    'PT0gJ1BPU1QnKSByZXR1cm4ganNvbig0MDUsIHsgZXJyb3I6ICdNZXRob2Qgbm90IGFsbG93ZWQnIH0pOwoKICBjb25zdCBzZXNz'+
    'aW9uID0gdW5zZWFsKHJlYWRDb29raWUoZXZlbnQuaGVhZGVycyB8fCB7fSkpOwogIGlmICghc2Vzc2lvbiB8fCBzZXNzaW9uLnN0'+
    'YWdlICE9PSAncmVhZHknKSB7CiAgICByZXR1cm4ganNvbig0MDEsIHsgZXJyb3I6ICdTZXNzaW9uIGV4cGlyZWQuIFNpZ24gaW4g'+
    'YWdhaW4uJyB9KTsKICB9CgogIC8vIEVudGl0bGVtZW50IHdhcyBncmFudGVkIGF0IHBsYW4gdGltZSBhbmQgcmlkZXMgaW4gdGhl'+
    'IHNlYWxlZCBjb29raWUuCiAgLy8gTm8gU3RyaXBlIGNhbGwgaGVyZTogYXBwbHkgcnVucyBvbmNlIHBlciBvcGVyYXRpb24sIGFu'+
    'ZCBlbGV2ZW4gcm91bmQKICAvLyB0cmlwcyBwZXIgcnVuIHdvdWxkIGJlIHdhc3RlZnVsLgogIGlmIChwYXl3YWxsRW5hYmxlZCgp'+
    'ICYmIHNlc3Npb24ucGFpZCAhPT0gdHJ1ZSkgewogICAgcmV0dXJuIGpzb24oNDAyLCBwYXltZW50UmVxdWlyZWRCb2R5KCkpOwog'+
    'IH0KCiAgbGV0IGJvZHkgPSB7fTsKICB0cnkgeyBib2R5ID0gSlNPTi5wYXJzZShldmVudC5ib2R5IHx8ICd7fScpOyB9IGNhdGNo'+
    'IHsgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiAnQmFkIHJlcXVlc3QgYm9keS4nIH0pOyB9CgogIGNvbnN0IHsgaWQsIHBsYW5U'+
    'b2tlbiwgYnJlYWtHbGFzc0lkcyB9ID0gYm9keTsKICBpZiAoIWlkKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6ICdObyBvcGVy'+
    'YXRpb24gaWQgc3VwcGxpZWQuJyB9KTsKCiAgLy8gVGhlIHNpZ25lZCBwbGFuIGlzIHRoZSBhdXRob3Jpc2F0aW9uLiBBIGNhbGxl'+
    'ciBjYW5ub3QgaW52ZW50IGFuCiAgLy8gb3BlcmF0aW9uIGlkIGFuZCBoYXZlIGl0IHJ1biwgZXZlbiB3aXRoIGEgdmFsaWQgc2Vz'+
    'c2lvbiBjb29raWUuCiAgY29uc3QgcGxhbiA9IHZlcmlmeVBsYW4ocGxhblRva2VuKTsKICBpZiAoIXBsYW4pIHJldHVybiBqc29u'+
    'KDQwMCwgeyBlcnJvcjogJ1BsYW4gdG9rZW4gbWlzc2luZywgYWx0ZXJlZCwgb3IgZXhwaXJlZC4gUmUtcnVuIHRoZSBwbGFuLicg'+
    'fSk7CiAgaWYgKCFwbGFuLmlkcy5pbmNsdWRlcyhpZCkpIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogJ1RoYXQgb3BlcmF0aW9u'+
    'IHdhcyBub3QgcGFydCBvZiB0aGUgYXBwcm92ZWQgcGxhbi4nIH0pOwoKICBjb25zdCBhdWRpdCA9IGNyZWF0ZUF1ZGl0KCk7CiAg'+
    'dHJ5IHsKICAgIGNvbnN0IGN0eCA9IHsKICAgICAgZ3JhcGg6IGNyZWF0ZUdyYXBoQ2xpZW50KHsgYWNjZXNzVG9rZW46IHNlc3Np'+
    'b24uYWNjZXNzVG9rZW4gfSksCiAgICAgIHBhcmFtczogeyBicmVha0dsYXNzSWRzOiBicmVha0dsYXNzSWRzIHx8IFtdIH0sCiAg'+
    'ICAgIGF1ZGl0LAogICAgfTsKICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFwcGx5T3BlcmF0aW9uKGlkLCBjdHgsIHsgYXBwcm92'+
    'ZWRJZHM6IHBsYW4uaWRzIH0pOwogICAgcmV0dXJuIGpzb24oMjAwLCB7IC4uLnJlc3VsdCwgYXVkaXQ6IGF1ZGl0LmFsbCgpIH0p'+
    'OwogIH0gY2F0Y2ggKGVycikgewogICAgcmV0dXJuIGpzb24oNTAyLCB7IGVycm9yOiBlcnIubWVzc2FnZSwgYXVkaXQ6IGF1ZGl0'+
    'LmFsbCgpIH0pOwogIH0KfQoKY29uc3QganNvbiA9IChzdGF0dXNDb2RlLCBib2R5KSA9PiAoewogIHN0YXR1c0NvZGUsCiAgaGVh'+
    'ZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLCAnQ2FjaGUtQ29udHJvbCc6ICduby1zdG9yZScgfSwK'+
    'ICBib2R5OiBKU09OLnN0cmluZ2lmeShib2R5KSwKfSk7Cg==' }
  'tests/entitlement.test.mjs' = @{ b64 = 'aW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JzsKaW1wb3J0IGFzc2VydCBmcm9tICdub2RlOmFzc2VydC9zdHJpY3QnOwoKcHJv'+
    'Y2Vzcy5lbnYuU0VTU0lPTl9TRUNSRVQgPSAnYScucmVwZWF0KDQ4KTsKCmltcG9ydCB7IHNlYWwsIGNvb2tpZUhlYWRlciwgU0VT'+
    'U0lPTl9DT09LSUUgfSBmcm9tICcuLi9saWIvc2Vzc2lvbi5tanMnOwppbXBvcnQgeyBjaGVja0VudGl0bGVtZW50LCBzdHJpcGVT'+
    'ZXNzaW9uSXNQYWlkLCBwYXl3YWxsRW5hYmxlZCB9IGZyb20gJy4uL2xpYi9lbnRpdGxlbWVudC5tanMnOwppbXBvcnQgeyBfcmVz'+
    'ZXQgfSBmcm9tICcuLi9saWIvcmF0ZWxpbWl0Lm1qcyc7Cgpjb25zdCBSRUFEWSA9IHsgc3RhZ2U6ICdyZWFkeScsIGFjY2Vzc1Rv'+
    'a2VuOiAnZ3JhcGgtdG9rZW4nIH07CmNvbnN0IFBBSUQgID0geyBzdGFnZTogJ3JlYWR5JywgYWNjZXNzVG9rZW46ICdncmFwaC10'+
    'b2tlbicsIHBhaWQ6IHRydWUsIHN0cmlwZVNlc3Npb25JZDogJ2NzXzEnIH07CmNvbnN0IGNvb2tpZUZvciA9IChwKSA9PiAoeyBj'+
    'b29raWU6IGAke1NFU1NJT05fQ09PS0lFID8/ICdfX0hvc3QtdGtfc2Vzc2lvbid9PSR7c2VhbChwKX1gIH0pOwoKZnVuY3Rpb24g'+
    'c3RyaXBlU3R1Yih7IHBhaWQgPSB0cnVlLCBvayA9IHRydWUgfSA9IHt9KSB7CiAgY29uc3QgY2FsbHMgPSBbXTsKICByZXR1cm4g'+
    'ewogICAgY2FsbHMsCiAgICBmZXRjaEltcGw6IGFzeW5jICh1cmwpID0+IHsgY2FsbHMucHVzaCh1cmwpOyByZXR1cm4geyBvaywg'+
    'YXN5bmMganNvbigpIHsgcmV0dXJuIHsgcGF5bWVudF9zdGF0dXM6IHBhaWQgPyAncGFpZCcgOiAndW5wYWlkJyB9OyB9IH07IH0s'+
    'CiAgfTsKfQoKYXN5bmMgZnVuY3Rpb24gd2l0aFBheXdhbGwob24sIGZuKSB7CiAgY29uc3QgcHJldiA9IHByb2Nlc3MuZW52LlBB'+
    'WVdBTExfRU5BQkxFRDsKICBwcm9jZXNzLmVudi5QQVlXQUxMX0VOQUJMRUQgPSBvbiA/ICd0cnVlJyA6ICdmYWxzZSc7CiAgdHJ5'+
    'IHsgcmV0dXJuIGF3YWl0IGZuKCk7IH0KICBmaW5hbGx5IHsKICAgIGlmIChwcmV2ID09PSB1bmRlZmluZWQpIGRlbGV0ZSBwcm9j'+
    'ZXNzLmVudi5QQVlXQUxMX0VOQUJMRUQ7CiAgICBlbHNlIHByb2Nlc3MuZW52LlBBWVdBTExfRU5BQkxFRCA9IHByZXY7CiAgfQp9'+
    'Cgp0ZXN0KCdvbmx5IHRoZSBleGFjdCBzdHJpbmcgInRydWUiIGVuYWJsZXMgdGhlIHBheXdhbGwnLCBhc3luYyAoKSA9PiB7CiAg'+
    'Zm9yIChjb25zdCB2IG9mIFsnJywgJ2ZhbHNlJywgJzAnLCAneWVzJywgJ29uJ10pIHsKICAgIHByb2Nlc3MuZW52LlBBWVdBTExf'+
    'RU5BQkxFRCA9IHY7CiAgICBhc3NlcnQuZXF1YWwocGF5d2FsbEVuYWJsZWQoKSwgZmFsc2UsIGAiJHt2fSIgbXVzdCBub3QgZW5h'+
    'YmxlIGl0YCk7CiAgfQogIHByb2Nlc3MuZW52LlBBWVdBTExfRU5BQkxFRCA9ICdUUlVFJzsKICBhc3NlcnQuZXF1YWwocGF5d2Fs'+
    'bEVuYWJsZWQoKSwgdHJ1ZSwgJ2Nhc2UtaW5zZW5zaXRpdmUnKTsKICBkZWxldGUgcHJvY2Vzcy5lbnYuUEFZV0FMTF9FTkFCTEVE'+
    'Owp9KTsKCnRlc3QoJ3dpdGggdGhlIHBheXdhbGwgb2ZmLCBTdHJpcGUgaXMgbmV2ZXIgY2FsbGVkJywgYXN5bmMgKCkgPT4gewog'+
    'IGF3YWl0IHdpdGhQYXl3YWxsKGZhbHNlLCBhc3luYyAoKSA9PiB7CiAgICBjb25zdCBzID0gc3RyaXBlU3R1YigpOwogICAgY29u'+
    'c3QgZSA9IGF3YWl0IGNoZWNrRW50aXRsZW1lbnQoUkVBRFksIHt9LCB7IGZldGNoSW1wbDogcy5mZXRjaEltcGwgfSk7CiAgICBh'+
    'c3NlcnQuZXF1YWwoZS5vaywgdHJ1ZSk7CiAgICBhc3NlcnQuZXF1YWwocy5jYWxscy5sZW5ndGgsIDApOwogIH0pOwp9KTsKCnRl'+
    'c3QoJ25vIFN0cmlwZSBzZXNzaW9uIGlkIGlzIHJlZnVzZWQnLCBhc3luYyAoKSA9PiB7CiAgYXdhaXQgd2l0aFBheXdhbGwodHJ1'+
    'ZSwgYXN5bmMgKCkgPT4gewogICAgcHJvY2Vzcy5lbnYuU1RSSVBFX1NFQ1JFVF9LRVkgPSAnc2tfdGVzdF94JzsKICAgIGFzc2Vy'+
    'dC5lcXVhbCgoYXdhaXQgY2hlY2tFbnRpdGxlbWVudChSRUFEWSwge30sIHN0cmlwZVN0dWIoKSkpLm9rLCBmYWxzZSk7CiAgfSk7'+
    'Cn0pOwoKdGVzdCgnYW4gdW5wYWlkIFN0cmlwZSBzZXNzaW9uIGlzIHJlZnVzZWQnLCBhc3luYyAoKSA9PiB7CiAgYXdhaXQgd2l0'+
    'aFBheXdhbGwodHJ1ZSwgYXN5bmMgKCkgPT4gewogICAgcHJvY2Vzcy5lbnYuU1RSSVBFX1NFQ1JFVF9LRVkgPSAnc2tfdGVzdF94'+
    'JzsKICAgIGNvbnN0IHMgPSBzdHJpcGVTdHViKHsgcGFpZDogZmFsc2UgfSk7CiAgICBhc3NlcnQuZXF1YWwoKGF3YWl0IGNoZWNr'+
    'RW50aXRsZW1lbnQoUkVBRFksIHsgc3RyaXBlU2Vzc2lvbklkOiAnY3Nfbm8nIH0sIHsgZmV0Y2hJbXBsOiBzLmZldGNoSW1wbCB9'+
    'KSkub2ssIGZhbHNlKTsKICAgIGFzc2VydC5lcXVhbChzLmNhbGxzLmxlbmd0aCwgMSk7CiAgfSk7Cn0pOwoKdGVzdCgnYSBwYWlk'+
    'IFN0cmlwZSBzZXNzaW9uIGdyYW50cyBlbnRpdGxlbWVudCBhbmQgYXNrcyBmb3IgYSByZS1zZWFsJywgYXN5bmMgKCkgPT4gewog'+
    'IGF3YWl0IHdpdGhQYXl3YWxsKHRydWUsIGFzeW5jICgpID0+IHsKICAgIHByb2Nlc3MuZW52LlNUUklQRV9TRUNSRVRfS0VZID0g'+
    'J3NrX3Rlc3RfeCc7CiAgICBjb25zdCBzID0gc3RyaXBlU3R1Yih7IHBhaWQ6IHRydWUgfSk7CiAgICBjb25zdCBlID0gYXdhaXQg'+
    'Y2hlY2tFbnRpdGxlbWVudChSRUFEWSwgeyBzdHJpcGVTZXNzaW9uSWQ6ICdjc19vaycgfSwgeyBmZXRjaEltcGw6IHMuZmV0Y2hJ'+
    'bXBsIH0pOwogICAgYXNzZXJ0LmVxdWFsKGUub2ssIHRydWUpOwogICAgYXNzZXJ0LmVxdWFsKGUuYWxyZWFkeUVudGl0bGVkLCBm'+
    'YWxzZSk7CiAgfSk7Cn0pOwoKdGVzdCgnYW4gZW50aXRsZWQgY29va2llIGRvZXMgbm90IGNhbGwgU3RyaXBlIGFnYWluJywgYXN5'+
    'bmMgKCkgPT4gewogIGF3YWl0IHdpdGhQYXl3YWxsKHRydWUsIGFzeW5jICgpID0+IHsKICAgIHByb2Nlc3MuZW52LlNUUklQRV9T'+
    'RUNSRVRfS0VZID0gJ3NrX3Rlc3RfeCc7CiAgICBjb25zdCBzID0gc3RyaXBlU3R1YigpOwogICAgY29uc3QgZSA9IGF3YWl0IGNo'+
    'ZWNrRW50aXRsZW1lbnQoUEFJRCwge30sIHsgZmV0Y2hJbXBsOiBzLmZldGNoSW1wbCB9KTsKICAgIGFzc2VydC5lcXVhbChlLm9r'+
    'LCB0cnVlKTsKICAgIGFzc2VydC5lcXVhbChlLmFscmVhZHlFbnRpdGxlZCwgdHJ1ZSk7CiAgICBhc3NlcnQuZXF1YWwocy5jYWxs'+
    'cy5sZW5ndGgsIDAsICdvbmUgU3RyaXBlIGNhbGwgcGVyIHJ1biwgbm90IHBlciBvcGVyYXRpb24nKTsKICB9KTsKfSk7Cgp0ZXN0'+
    'KCdhIG1pc3NpbmcgU3RyaXBlIGtleSByZWZ1c2VzIHJhdGhlciB0aGFuIGFsbG93cycsIGFzeW5jICgpID0+IHsKICBhd2FpdCB3'+
    'aXRoUGF5d2FsbCh0cnVlLCBhc3luYyAoKSA9PiB7CiAgICBjb25zdCBwcmV2ID0gcHJvY2Vzcy5lbnYuU1RSSVBFX1NFQ1JFVF9L'+
    'RVk7CiAgICBkZWxldGUgcHJvY2Vzcy5lbnYuU1RSSVBFX1NFQ1JFVF9LRVk7CiAgICBhc3NlcnQuZXF1YWwoKGF3YWl0IGNoZWNr'+
    'RW50aXRsZW1lbnQoUkVBRFksIHsgc3RyaXBlU2Vzc2lvbklkOiAnY3Nfb2snIH0sIHN0cmlwZVN0dWIoKSkpLm9rLCBmYWxzZSk7'+
    'CiAgICBpZiAocHJldikgcHJvY2Vzcy5lbnYuU1RSSVBFX1NFQ1JFVF9LRVkgPSBwcmV2OwogIH0pOwp9KTsKCnRlc3QoJ1N0cmlw'+
    'ZSBlcnJvcnMgYW5kIG5ldHdvcmsgZmFpbHVyZXMgcmVmdXNlIHJhdGhlciB0aGFuIGFsbG93JywgYXN5bmMgKCkgPT4gewogIGF3'+
    'YWl0IHdpdGhQYXl3YWxsKHRydWUsIGFzeW5jICgpID0+IHsKICAgIHByb2Nlc3MuZW52LlNUUklQRV9TRUNSRVRfS0VZID0gJ3Nr'+
    'X3Rlc3RfeCc7CiAgICBhc3NlcnQuZXF1YWwoYXdhaXQgc3RyaXBlU2Vzc2lvbklzUGFpZCgnY3MnLCB7IGZldGNoSW1wbDogYXN5'+
    'bmMgKCkgPT4gKHsgb2s6IGZhbHNlLCBhc3luYyBqc29uKCkgeyByZXR1cm4ge307IH0gfSkgfSksIGZhbHNlKTsKICAgIGFzc2Vy'+
    'dC5lcXVhbChhd2FpdCBzdHJpcGVTZXNzaW9uSXNQYWlkKCdjcycsIHsgZmV0Y2hJbXBsOiBhc3luYyAoKSA9PiB7IHRocm93IG5l'+
    'dyBFcnJvcignRUNPTk5SRVNFVCcpOyB9IH0pLCBmYWxzZSk7CiAgfSk7Cn0pOwoKLyogLS0tLSBlbmRwb2ludHMgLS0tLSAqLwoK'+
    'dGVzdCgncmVtZWRpYXRlLXBsYW4gcmV0dXJucyA0MDIgYmVmb3JlIHNwZW5kaW5nIG9uIENsYXVkZScsIGFzeW5jICgpID0+IHsK'+
    'ICBhd2FpdCB3aXRoUGF5d2FsbCh0cnVlLCBhc3luYyAoKSA9PiB7CiAgICBfcmVzZXQoKTsKICAgIHByb2Nlc3MuZW52LlNUUklQ'+
    'RV9TRUNSRVRfS0VZID0gJ3NrX3Rlc3RfeCc7CiAgICBjb25zdCBwcmV2ID0gcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FQSV9LRVk7'+
    'CiAgICBkZWxldGUgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FQSV9LRVk7CiAgICBjb25zdCB7IGhhbmRsZXIgfSA9IGF3YWl0IGlt'+
    'cG9ydCgnLi4vbmV0bGlmeS9mdW5jdGlvbnMvcmVtZWRpYXRlLXBsYW4ubWpzJyk7CiAgICBjb25zdCByZXMgPSBhd2FpdCBoYW5k'+
    'bGVyKHsgaHR0cE1ldGhvZDogJ1BPU1QnLCBoZWFkZXJzOiBjb29raWVGb3IoUkVBRFkpLCBib2R5OiAne30nIH0pOwogICAgYXNz'+
    'ZXJ0LmVxdWFsKHJlcy5zdGF0dXNDb2RlLCA0MDIpOwogICAgYXNzZXJ0LmVxdWFsKEpTT04ucGFyc2UocmVzLmJvZHkpLmVycm9y'+
    'LCAncGF5bWVudF9yZXF1aXJlZCcpOwogICAgaWYgKHByZXYpIHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZID0gcHJldjsK'+
    'ICB9KTsKfSk7Cgp0ZXN0KCdyZW1lZGlhdGUtYXBwbHkgcmV0dXJucyA0MDIgZm9yIGFuIHVucGFpZCBzZXNzaW9uJywgYXN5bmMg'+
    'KCkgPT4gewogIGF3YWl0IHdpdGhQYXl3YWxsKHRydWUsIGFzeW5jICgpID0+IHsKICAgIGNvbnN0IHsgaGFuZGxlciB9ID0gYXdh'+
    'aXQgaW1wb3J0KCcuLi9uZXRsaWZ5L2Z1bmN0aW9ucy9yZW1lZGlhdGUtYXBwbHkubWpzJyk7CiAgICBjb25zdCByZXMgPSBhd2Fp'+
    'dCBoYW5kbGVyKHsKICAgICAgaHR0cE1ldGhvZDogJ1BPU1QnLCBoZWFkZXJzOiBjb29raWVGb3IoUkVBRFkpLAogICAgICBib2R5'+
    'OiBKU09OLnN0cmluZ2lmeSh7IGlkOiAnZG5zLnNwZi50aWdodGVuX2FsbCcsIHBsYW5Ub2tlbjogJ3gueScgfSksCiAgICB9KTsK'+
    'ICAgIGFzc2VydC5lcXVhbChyZXMuc3RhdHVzQ29kZSwgNDAyKTsKICB9KTsKfSk7Cgp0ZXN0KCd0aGUgcGF5d2FsbCBkb2VzIG5v'+
    'dCByZXBsYWNlIHRoZSBzaWduLWluIGNoZWNrJywgYXN5bmMgKCkgPT4gewogIGF3YWl0IHdpdGhQYXl3YWxsKHRydWUsIGFzeW5j'+
    'ICgpID0+IHsKICAgIF9yZXNldCgpOwogICAgY29uc3QgeyBoYW5kbGVyIH0gPSBhd2FpdCBpbXBvcnQoJy4uL25ldGxpZnkvZnVu'+
    'Y3Rpb25zL3JlbWVkaWF0ZS1wbGFuLm1qcycpOwogICAgY29uc3QgcmVzID0gYXdhaXQgaGFuZGxlcih7IGh0dHBNZXRob2Q6ICdQ'+
    'T1NUJywgaGVhZGVyczoge30sIGJvZHk6ICd7fScgfSk7CiAgICBhc3NlcnQuZXF1YWwocmVzLnN0YXR1c0NvZGUsIDQwMSwgJ25v'+
    'IHNlc3Npb24gaXMgNDAxLCBub3QgNDAyJyk7CiAgfSk7Cn0pOwoKdGVzdCgnd2l0aCB0aGUgcGF5d2FsbCBvZmYgdGhlIHBsYW4g'+
    'ZW5kcG9pbnQgaXMgbm90IGJsb2NrZWQgYnkgcGF5bWVudCcsIGFzeW5jICgpID0+IHsKICBhd2FpdCB3aXRoUGF5d2FsbChmYWxz'+
    'ZSwgYXN5bmMgKCkgPT4gewogICAgX3Jlc2V0KCk7CiAgICBjb25zdCB7IGhhbmRsZXIgfSA9IGF3YWl0IGltcG9ydCgnLi4vbmV0'+
    'bGlmeS9mdW5jdGlvbnMvcmVtZWRpYXRlLXBsYW4ubWpzJyk7CiAgICBjb25zdCByZXMgPSBhd2FpdCBoYW5kbGVyKHsgaHR0cE1l'+
    'dGhvZDogJ1BPU1QnLCBoZWFkZXJzOiBjb29raWVGb3IoUkVBRFkpLCBib2R5OiAne30nIH0pOwogICAgYXNzZXJ0Lm5vdEVxdWFs'+
    'KHJlcy5zdGF0dXNDb2RlLCA0MDIpOwogIH0pOwp9KTsK' }
  'netlify.toml' = @{ b64 = 'W2J1aWxkXQogIHB1Ymxpc2ggPSAiLiIKICBmdW5jdGlvbnMgPSAibmV0bGlmeS9mdW5jdGlvbnMiCgpbZnVuY3Rpb25zXQogIG5v'+
    'ZGVfYnVuZGxlciA9ICJlc2J1aWxkIgoKIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0t'+
    'LS0tLS0tLS0tLS0tLS0KIyBSZWRpcmVjdHMuIEFkZCB0aGUgZnVsbCBvbGQtdG8tbmV3IFVSTCBtYXAgaGVyZSBiZWZvcmUgY3V0'+
    'b3ZlciDigJQKIyBwdWxsIHRoZSBleGlzdGluZyBVUkwgbGlzdCBmcm9tIFNlYXJjaCBDb25zb2xlLgojIC0tLS0tLS0tLS0tLS0t'+
    'LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQpbW3JlZGlyZWN0c11dCiAgZnJvbSA9ICIv'+
    'aG9tZS8iCiAgdG8gPSAiLyIKICBzdGF0dXMgPSAzMDEKICBmb3JjZSA9IHRydWUKCltbcmVkaXJlY3RzXV0KICBmcm9tID0gIi9v'+
    'dXItc2VydmljZXMvIgogIHRvID0gIi8jc2VydmljZXMiCiAgc3RhdHVzID0gMzAxCgojIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0t'+
    'LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQojIFNlY3VyaXR5IGhlYWRlcnMuIFlvdSBzZWxsIGN5YmVy'+
    'c2VjdXJpdHksIHNvIHlvdXIgb3duIHNpdGUgc2hvdWxkCiMgc2NvcmUgd2VsbCBhdCBzZWN1cml0eWhlYWRlcnMuY29tLiBUd2Vu'+
    'dHkgbWludXRlcyBvZiB3b3JrLgojCiMgQ1NQIE5PVEU6ICd1bnNhZmUtaW5saW5lJyBmb3Igc2NyaXB0LXNyYyBpcyBoZXJlIG9u'+
    'bHkgYmVjYXVzZSB0aGUKIyB0b29sIHBhZ2VzIHVzZSBpbmxpbmUgPHNjcmlwdD4uIFdoZW4geW91IG1vdmUgdG8gQXN0cm8sIGV4'+
    'dHJhY3QKIyB0aG9zZSB0byBmaWxlcyBhbmQgZHJvcCBpdCDigJQgaW5saW5lIHNjcmlwdCBpcyB0aGUgb25lIHdlYWsgcG9pbnQK'+
    'IyBpbiB0aGlzIHBvbGljeS4gUnVuIGluIHJlcG9ydC1vbmx5IGZpcnN0IGFuZCB3YXRjaCB0aGUgY29uc29sZS4KIyAtLS0tLS0t'+
    'LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0KW1toZWFkZXJzXV0KICBmb3Ig'+
    'PSAiLyoiCiAgW2hlYWRlcnMudmFsdWVzXQogICAgIyBIU1RTIOKAlCBkZWxpYmVyYXRlbHkgY29uc2VydmF0aXZlIHRvIHN0YXJ0'+
    'LgogICAgIwogICAgIyBETyBOT1QgYWRkICJwcmVsb2FkIiBvciByYWlzZSBtYXgtYWdlIHVudGlsIHRuYmNnLnRlY2ggaGFzIGJl'+
    'ZW4KICAgICMgc2VydmluZyBjbGVhbmx5IG92ZXIgSFRUUFMgaGVyZSBmb3IgYSBmZXcgd2Vla3MuIFByZWxvYWQgaXMgY2xvc2Ug'+
    'dG8KICAgICMgaXJyZXZlcnNpYmxlOiBicm93c2VycyBzaGlwIHRoZSBsaXN0IGJha2VkIGluLCBzbyBpZiBIVFRQUyBicmVha3Mg'+
    'b24KICAgICMgYW55IHN1YmRvbWFpbiwgdmlzaXRvcnMgZ2V0IGEgaGFyZCBibG9jayB5b3UgY2Fubm90IGxpZnQgcXVpY2tseS4K'+
    'ICAgICMgUmVtb3ZhbCBmcm9tIHRoZSBwcmVsb2FkIGxpc3QgdGFrZXMgbW9udGhzLgogICAgIwogICAgIyBPbmNlIHlvdSBhcmUg'+
    'Y29uZmlkZW50LCBzdGVwIHVwIHRvOgogICAgIyAgIG1heC1hZ2U9MzE1MzYwMDA7IGluY2x1ZGVTdWJEb21haW5zOyBwcmVsb2Fk'+
    'CiAgICBTdHJpY3QtVHJhbnNwb3J0LVNlY3VyaXR5ID0gIm1heC1hZ2U9ODY0MDA7IGluY2x1ZGVTdWJEb21haW5zIgogICAgWC1G'+
    'cmFtZS1PcHRpb25zID0gIkRFTlkiCiAgICBYLUNvbnRlbnQtVHlwZS1PcHRpb25zID0gIm5vc25pZmYiCiAgICBSZWZlcnJlci1Q'+
    'b2xpY3kgPSAic3RyaWN0LW9yaWdpbi13aGVuLWNyb3NzLW9yaWdpbiIKICAgIFBlcm1pc3Npb25zLVBvbGljeSA9ICJnZW9sb2Nh'+
    'dGlvbj0oKSwgbWljcm9waG9uZT0oKSwgY2FtZXJhPSgpLCBwYXltZW50PShzZWxmKSIKICAgIENvbnRlbnQtU2VjdXJpdHktUG9s'+
    'aWN5ID0gIiIiCiAgICAgIGRlZmF1bHQtc3JjICdzZWxmJzsKICAgICAgYmFzZS11cmkgJ3NlbGYnOwogICAgICBmb3JtLWFjdGlv'+
    'biAnc2VsZic7CiAgICAgIGZyYW1lLWFuY2VzdG9ycyAnbm9uZSc7CiAgICAgIGltZy1zcmMgJ3NlbGYnIGRhdGE6IGh0dHBzOjsK'+
    'ICAgICAgZm9udC1zcmMgJ3NlbGYnIGh0dHBzOi8vZm9udHMuZ3N0YXRpYy5jb207CiAgICAgIHN0eWxlLXNyYyAnc2VsZicgJ3Vu'+
    'c2FmZS1pbmxpbmUnIGh0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb207CiAgICAgIHNjcmlwdC1zcmMgJ3NlbGYnICd1bnNhZmUt'+
    'aW5saW5lJzsKICAgICAgY29ubmVjdC1zcmMgJ3NlbGYnOwogICAgICBmcmFtZS1zcmMgaHR0cHM6Ly9jaGVja291dC5zdHJpcGUu'+
    'Y29tOwogICAgICBvYmplY3Qtc3JjICdub25lJwogICAgIiIiCgpbW2hlYWRlcnNdXQogIGZvciA9ICIvYXNzZXRzLyoiCiAgW2hl'+
    'YWRlcnMudmFsdWVzXQogICAgQ2FjaGUtQ29udHJvbCA9ICJwdWJsaWMsIG1heC1hZ2U9MzE1MzYwMDAsIGltbXV0YWJsZSIKCiMg'+
    'LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCiMgRU5WSVJPTk1F'+
    'TlQgVkFSSUFCTEVTIChzZXQgdGhlc2UgaW4gdGhlIE5ldGxpZnkgVUksIG5vdCBoZXJlIOKAlAojIG5ldmVyIGNvbW1pdCBzZWNy'+
    'ZXRzIHRvIHRoZSByZXBvKQojCiMgICBQQVlXQUxMX0VOQUJMRUQgICAgbGVhdmUgdW5zZXQgb3IgImZhbHNlIiBkdXJpbmcgdGhl'+
    'IGZyZWUgdGVzdC4KIyAgICAgICAgICAgICAgICAgICAgICBTZXQgInRydWUiIHRvIHN0YXJ0IGNoYXJnaW5nLgojICAgU1RSSVBF'+
    'X1NFQ1JFVF9LRVkgIG9ubHkgbmVlZGVkIG9uY2UgUEFZV0FMTF9FTkFCTEVEIGlzIHRydWUKIyAgIFNUUklQRV9QUklDRV9JRCAg'+
    'ICB0aGUgcHJpY2VfLi4uIGlkIGZyb20geW91ciBTdHJpcGUgcHJvZHVjdAojCiMgICBUaGUgc2FtZSBQQVlXQUxMX0VOQUJMRUQg'+
    'ZmxhZyBub3cgYWxzbyBnYXRlcyB0aGUgTWljcm9zb2Z0IDM2NQojICAgcmVtZWRpYXRpb24gc2NhbiAocmVtZWRpYXRlLXBsYW4g'+
    'LyByZW1lZGlhdGUtYXBwbHkpLCBub3QganVzdCB0aGUKIyAgIHN0YXRpYyByZXBvcnQuIFNldCBTVFJJUEVfUFJJQ0VfSURfU0NB'+
    'TiB0byBjaGFyZ2UgYSBkaWZmZXJlbnQgcHJpY2UKIyAgIGZvciB0aGUgc2NhbjsgaXQgZmFsbHMgYmFjayB0byBTVFJJUEVfUFJJ'+
    'Q0VfSUQgaWYgdW5zZXQuCiMgICBTSVRFX09SSUdJTiAgICAgICAgaHR0cHM6Ly95b3VyLWRvbWFpbi5jb20KIyAtLS0tLS0tLS0t'+
    'LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0KCiMgVGhlIGVuZ2luZSdzIHNvdXJj'+
    'ZSBsaXZlcyBpbiAvbGliIHNvIHRoZSBmdW5jdGlvbnMgY2FuIGltcG9ydCBpdC4gSXQgaXMKIyBub3Qgc2VjcmV0IChhbGwgY3Jl'+
    'ZGVudGlhbHMgYXJlIGVudiB2YXJzKSwgYnV0IHRoZXJlIGlzIG5vIHJlYXNvbiB0bwojIHNlcnZlIGl0IHRvIHZpc2l0b3JzLCBz'+
    'byBpdCA0MDRzLgpbW3JlZGlyZWN0c11dCiAgZnJvbSA9ICIvbGliLyoiCiAgdG8gPSAiLzQwNC5odG1sIgogIHN0YXR1cyA9IDQw'+
    'NAogIGZvcmNlID0gdHJ1ZQoKW1tyZWRpcmVjdHNdXQogIGZyb20gPSAiL2RvY3MtKiIKICB0byA9ICIvNDA0Lmh0bWwiCiAgc3Rh'+
    'dHVzID0gNDA0CiAgZm9yY2UgPSB0cnVlCgojID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09'+
    'PT09PT09PT09PT09PT09PQojIENPTVBMSUFOQ0UgUExBVEZPUk0KIwojIFRoZSBwb3J0YWwsIGFkbWluIGNvbnNvbGUgYW5kIHJl'+
    'cG9ydCBhcmUgcGxhaW4gc3RhdGljIHBhZ2VzIHVuZGVyCiMgL2NvbXBsaWFuY2UvLiBUaGUgQVBJIGlzIG5ldGxpZnkvZnVuY3Rp'+
    'b25zL2NvbXBsaWFuY2UtKi5tanMsIHJvdXRlZCBieQojIGVhY2ggZnVuY3Rpb24ncyBvd24gYGV4cG9ydCBjb25zdCBjb25maWcg'+
    'PSB7IHBhdGggfWAg4oCUIG5vIHJlZGlyZWN0cyBuZWVkZWQuCiMgVGhlIGFkbWluIGNvbnNvbGUgaXMgZ2F0ZWQgYXQgdGhlIGVk'+
    'Z2UgYnkKIyBuZXRsaWZ5L2VkZ2UtZnVuY3Rpb25zL2NvbXBsaWFuY2UtYWRtaW4tZ2F0ZS5qcyBiZWZvcmUgaXRzIEhUTUwgaXMg'+
    'c2VydmVkLgojCiMgRGVsaWJlcmF0ZWx5IE5PVCBjaGFuZ2VkOiB0aGUgc2l0ZS13aWRlIENTUC4gVGhlIHBvcnRhbCBsb2FkcyBu'+
    'byBleHRlcm5hbAojIHNjcmlwdCDigJQgaXQgdGFsa3MgdG8gTmV0bGlmeSBJZGVudGl0eSBhdCAvLm5ldGxpZnkvaWRlbnRpdHks'+
    'IHNhbWUgb3JpZ2luIOKAlAojIHNvIHNjcmlwdC1zcmMgJ3NlbGYnIHN0aWxsIGhvbGRzLgojCiMgTk9URSBPTiBmb3JjZTogYSBy'+
    'ZWRpcmVjdCBvbmx5IGZpcmVzIHdoZW4gbm8gcmVhbCBmaWxlIHNpdHMgYXQgdGhhdCBwYXRoLAojIHVubGVzcyBmb3JjZSBpcyBz'+
    'ZXQuIEV2ZXJ5IDQwNCBndWFyZCBiZWxvdyAoYW5kIHRoZSBwcmUtZXhpc3RpbmcgL2xpYiBhbmQKIyAvZG9jcy0gb25lcykgbmVl'+
    'ZHMgaXQsIG9yIHRoZSBzb3VyY2UgZmlsZXMgYXJlIHNlcnZlZCBhcyBzdGF0aWMgYXNzZXRzLgojID09PT09PT09PT09PT09PT09'+
    'PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQoKW2J1aWxkLmVudmlyb25tZW50XQogIE5PREVf'+
    'VkVSU0lPTiA9ICIyMiIKCiMgQ29tcGxpYW5jZSBwYWdlcyBjYXJyeSBwcml2YXRlIGNsaWVudCBkYXRhIOKAlCBuZXZlciBjYWNo'+
    'ZSwgbmV2ZXIgaW5kZXguCltbaGVhZGVyc11dCiAgZm9yID0gIi9jb21wbGlhbmNlLyoiCiAgW2hlYWRlcnMudmFsdWVzXQogICAg'+
    'Q2FjaGUtQ29udHJvbCA9ICJuby1zdG9yZSwgbWF4LWFnZT0wIgogICAgWC1Sb2JvdHMtVGFnID0gIm5vaW5kZXgsIG5vZm9sbG93'+
    'LCBub2FyY2hpdmUiCgojIFNvdXJjZSBhbmQgdG9vbGluZyB0aGF0IGxpdmVzIGluIHRoZSByZXBvIGJ1dCBtdXN0IG5vdCBiZSBz'+
    'ZXJ2ZWQsIGZvbGxvd2luZwojIHRoZSBzYW1lIHBhdHRlcm4gYWxyZWFkeSB1c2VkIGZvciAvbGliLgpbW3JlZGlyZWN0c11dCiAg'+
    'ZnJvbSA9ICIvYWdlbnQvKiIKICB0byA9ICIvNDA0Lmh0bWwiCiAgc3RhdHVzID0gNDA0CiAgZm9yY2UgPSB0cnVlCgpbW3JlZGly'+
    'ZWN0c11dCiAgZnJvbSA9ICIvdGVzdHMvKiIKICB0byA9ICIvNDA0Lmh0bWwiCiAgc3RhdHVzID0gNDA0CiAgZm9yY2UgPSB0cnVl'+
    'CgpbW3JlZGlyZWN0c11dCiAgZnJvbSA9ICIvZG9jcy8qIgogIHRvID0gIi80MDQuaHRtbCIKICBzdGF0dXMgPSA0MDQKICBmb3Jj'+
    'ZSA9IHRydWUKCltbcmVkaXJlY3RzXV0KICBmcm9tID0gIi9ub2RlX21vZHVsZXMvKiIKICB0byA9ICIvNDA0Lmh0bWwiCiAgc3Rh'+
    'dHVzID0gNDA0CiAgZm9yY2UgPSB0cnVlCgpbW3JlZGlyZWN0c11dCiAgZnJvbSA9ICIvcGFja2FnZS5qc29uIgogIHRvID0gIi80'+
    'MDQuaHRtbCIKICBzdGF0dXMgPSA0MDQKICBmb3JjZSA9IHRydWUKCltbcmVkaXJlY3RzXV0KICBmcm9tID0gIi9wYWNrYWdlLWxv'+
    'Y2suanNvbiIKICB0byA9ICIvNDA0Lmh0bWwiCiAgc3RhdHVzID0gNDA0CiAgZm9yY2UgPSB0cnVlCg==' }
}


foreach ($path in $Payload.Keys | Sort-Object) {
    $dir = Split-Path $path -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $bytes = [Convert]::FromBase64String($Payload[$path].b64)
    [System.IO.File]::WriteAllBytes((Join-Path (Get-Location) $path), $bytes)
    Ok ("{0,-42} {1,6} bytes" -f $path, $bytes.Length)
}

Write-Host "`n=== 3. Running the tests ===" -ForegroundColor Cyan

$testOut = & npm test 2>&1 | Out-String
Write-Host ($testOut -split "`n" | Select-String -Pattern '^# (tests|pass|fail)|^not ok' | ForEach-Object { "  $_" })

if ($testOut -notmatch '# fail 0') {
    Write-Host $testOut
    Fail "tests did not pass cleanly. Nothing has been committed. Send me the output above."
}
if ($testOut -match '# pass 20') { Ok "20 tests passing, as expected" }
else { Write-Host "  NOTE: test count differs from the expected 20 - not fatal, but tell me." -ForegroundColor Yellow }

Write-Host "`n=== 4. What is about to be committed ===" -ForegroundColor Cyan

$expected = @(
  'lib/entitlement.mjs',
  'netlify/functions/remediate-plan.mjs',
  'netlify/functions/remediate-apply.mjs',
  'tests/entitlement.test.mjs',
  'netlify.toml'
)

git add -- $expected
$staged = @(git diff --cached --name-only)
$staged | ForEach-Object { Write-Host "  $_" }

$unexpected = $staged | Where-Object { $expected -notcontains $_ }
if ($unexpected) {
    git reset | Out-Null
    Fail ("unexpected files staged: " + ($unexpected -join ', ') + ". Nothing committed. Tell me what you see.")
}
if ($staged.Count -eq 0) {
    Write-Host "`n  Nothing to commit - the patch is already in this branch. You are done.`n" -ForegroundColor Green
    exit 0
}
Ok "only the expected files are staged"

if ($DryRun) {
    git reset | Out-Null
    Write-Host "`n  DRY RUN - files written, tests pass, nothing committed.`n" -ForegroundColor Cyan
    exit 0
}

Write-Host "`n=== 5. Committing and pushing ===" -ForegroundColor Cyan

git commit -m "Gate the M365 remediation scan behind the paywall

The scan spends against ANTHROPIC_API_KEY on every planning call and
previously had no payment gate - only a sign-in and an in-memory rate
limiter. Adds lib/entitlement.mjs, checked in remediate-plan before the
Claude call so an unpaid request costs nothing, and carried forward in
the sealed session cookie so a run makes one Stripe call rather than one
per operation. Fails closed. Inert until PAYWALL_ENABLED=true." | Out-Null
Ok "committed"

git push
if ($LASTEXITCODE -ne 0) { Fail "push failed - see the error above. The commit is saved locally; nothing is lost." }
Ok "pushed to $branch"

Write-Host @"

DONE. Netlify will build automatically - watch it in the Deploys tab.

Nothing user-visible changes. PAYWALL_ENABLED is unset, so the gate
stays open and the scan behaves exactly as it did before. You have
shipped a switch in the off position.

STILL YOURS, AND I CANNOT DO THESE:
  1. Entra publisher verification  <- start this first, it takes days
  2. Stripe product + STRIPE_PRICE_ID_SCAN
  3. Netlify env vars (SESSION_SECRET, ANTHROPIC_API_KEY, ENTRA_*)
  4. FlexPoint white-label portal URL for the four #contact links

Only after 1-3 does flipping PAYWALL_ENABLED=true do anything.
"@ -ForegroundColor Cyan
