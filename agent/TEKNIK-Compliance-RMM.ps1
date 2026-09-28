<#
.SYNOPSIS
  TEKNIK Compliance Scan Agent - Windows workstation assessment for HIPAA Security Rule, PCI DSS v4.0.1,
  NIST CSF 2.0 / SP 800-171, and CIS Windows benchmarks.

.DESCRIPTION
  Runs 60+ technical checks, performs a PHI / cardholder-data discovery sweep (reporting ONLY file paths,
  pattern types and hit counts only - NEVER any fragment of the data itself), packages machine-generated evidence
  for controls that pass, and uploads the result to the TEKNIK compliance portal.

  Requires: Windows 10/11 or Server 2016+, PowerShell 5.1+, run as Administrator (SYSTEM via RMM is ideal).

.PARAMETER ClientEmail   Client contact e-mail. Used to register/invite the client in the portal.
.PARAMETER ClientName    Client display name. Appears as "Prepared for" on the report.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\TEKNIK-ComplianceScan.ps1 -ClientEmail "office@clinic.com" -ClientName "Sunrise Pediatrics"

.NOTES
  Version 1.0.0 - TEKNIK (TNB Consulting Group, LLC) - helpdesk@tnbcg.com - 305-419-9992
#>
# ===================================================================================
#
#   TEKNIK COMPLIANCE SCAN - single-file RMM agent
#
#   Creates the client organization on first check-in, runs the workstation
#   assessment, packages evidence, and uploads everything to the portal.
#
#   -------------------------------------------------------------------------------
#   EDIT THE THREE VALUES BELOW, OR LEAVE THEM AND SET THEM AS RMM VARIABLES.
#   -------------------------------------------------------------------------------
#
#   There is no param() block on purpose. Syncro, Atera and Level write their script
#   variables as assignments at the TOP of the file, and PowerShell requires param()
#   to be the first statement - a parameterised script cannot parse under them.
#
#   Anything the RMM already defined wins. Then the environment variable. Then what
#   you type here.
#
# ===================================================================================

$CFG_ClientName  = ""    # REQUIRED. Client display name, e.g. "Sunrise Pediatrics".
                         #   This is the join key: every workstation for a client must
                         #   use the IDENTICAL spelling or you get two organizations.

$CFG_ClientEmail = ""    # REQUIRED. Client contact, e.g. "office@sunrisepeds.com".
                         #   Gets the portal invitation on the first check-in.

$CFG_AgentKey    = ""    # REQUIRED. Shared TEKNIK enrolment secret (TEKNIK_AGENT_KEY
                         #   in the Netlify site environment). Keep it in a hidden /
                         #   masked RMM variable rather than typing it here.

# --- optional, safe to ignore ------------------------------------------------------
$CFG_NoUpload       = $false   # $true = scan and write JSON locally, upload nothing.
$CFG_SkipPhiScan    = $false   # $true = skip the data-discovery sweep (much faster).
$CFG_PhiBudgetMin   = 30       # Minutes allowed for data discovery before it stops.
$CFG_PhiExtraPaths  = ""       # Extra folders, semicolon separated:
                               #   "D:\Scans;\\NAS\Shared"
$CFG_ClientAdmins   = ""       # Client-owned admin accounts that should NOT be flagged,
                               #   semicolon separated:  "clinicadmin;drsmith"
# ===================================================================================

# --- resolution: RMM variable  ->  environment variable  ->  the values above -------
if (-not $ClientName)  { $ClientName  = $env:TEKNIK_CLIENT_NAME  }
if (-not $ClientName)  { $ClientName  = $CFG_ClientName  }
if (-not $ClientEmail) { $ClientEmail = $env:TEKNIK_CLIENT_EMAIL }
if (-not $ClientEmail) { $ClientEmail = $CFG_ClientEmail }
if (-not $AgentKey)    { $AgentKey    = $env:TEKNIK_AGENT_KEY    }
if (-not $AgentKey)    { $AgentKey    = $CFG_AgentKey    }
if (-not $ApiBase)     { $ApiBase     = 'https://tnbcg.tech/api/compliance' }

if ($null -eq $NoUpload)        { $NoUpload    = $CFG_NoUpload }
if ($null -eq $SkipPhiScan)     { $SkipPhiScan = $CFG_SkipPhiScan }
if (-not $PhiTimeBudgetMinutes) { $PhiTimeBudgetMinutes = $CFG_PhiBudgetMin }
if (-not $PhiExtraPaths)        { $PhiExtraPaths = $CFG_PhiExtraPaths }
if (-not $PhiMaxFileMB)         { $PhiMaxFileMB = 25 }
if (-not $PhiMaxFlaggedFiles)   { $PhiMaxFlaggedFiles = 500 }
if (-not $OutputDir)            { $OutputDir = "$env:ProgramData\TEKNIK\Compliance" }

# RMMs hand everything over as strings, so normalise the types.
$NoUpload    = ($NoUpload    -eq $true -or "$NoUpload"    -match '^(true|1|yes)$')
$SkipPhiScan = ($SkipPhiScan -eq $true -or "$SkipPhiScan" -match '^(true|1|yes)$')
$PhiTimeBudgetMinutes = [int]$PhiTimeBudgetMinutes
$PhiMaxFileMB         = [int]$PhiMaxFileMB
$PhiMaxFlaggedFiles   = [int]$PhiMaxFlaggedFiles
if ($PhiExtraPaths -is [string]) { $PhiExtraPaths = @($PhiExtraPaths -split '\s*[;,]\s*' | Where-Object { $_ }) }
if (-not $PhiExtraPaths) { $PhiExtraPaths = @() }

$AllowedAdminPatterns = @('teknik*','tnb*','tnbcg*','*\Domain Admins','*LAPS*')
if (-not $ClientAdmins) { $ClientAdmins = $CFG_ClientAdmins }
if ($ClientAdmins) { $AllowedAdminPatterns += @("$ClientAdmins" -split '\s*[;,]\s*' | Where-Object { $_ }) }

# --- refuse rather than create a junk organization ---------------------------------
$missing = @()
if (-not $ClientName)  { $missing += 'ClientName' }
if (-not $ClientEmail) { $missing += 'ClientEmail' }
if (-not $AgentKey -and -not $NoUpload) { $missing += 'AgentKey' }
if ($missing.Count) {
  Write-Host ("CONFIG ERROR: missing {0}. Set them at the top of this script or as RMM variables." -f ($missing -join ', '))
  exit 2
}
if ($ClientEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
  Write-Host "CONFIG ERROR: ClientEmail '$ClientEmail' is not a valid e-mail address."
  exit 2
}


$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$AgentVersion   = '1.0.0'
$CatalogVersion = '2026.09.1'
$ScanStart      = Get-Date
$RunId          = [guid]::NewGuid().ToString()


$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) { Write-Warning "Not running elevated - several checks (BitLocker, audit policy, LSA) will report 'error'. Re-run as Administrator." }

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$EvidenceDir = Join-Path $OutputDir "evidence-$RunId"
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
$LogFile = Join-Path $OutputDir "scan-$($ScanStart.ToString('yyyyMMdd-HHmmss')).log"

function Write-Log { param([string]$Msg, [string]$Level='INFO')
  $line = "{0} [{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'), $Level, $Msg
  Add-Content -Path $LogFile -Value $line
  if ($Level -eq 'WARN') { Write-Host $line -ForegroundColor Yellow } elseif ($Level -eq 'FAIL') { Write-Host $line -ForegroundColor Red } else { Write-Host $line }
}

# ------------------------------------------------------------------ findings plumbing
$Findings = New-Object System.Collections.Generic.List[object]
$EvidenceManifest = New-Object System.Collections.Generic.List[object]

function Add-Finding {
  param([string]$Control, [ValidateSet('pass','fail','warn','error','na')][string]$Status,
        [string]$Observed = '', [string]$Expected = '', $Detail = $null)
  $Findings.Add([pscustomobject]@{ control=$Control; status=$Status; observed=$Observed; expected=$Expected; detail=$Detail })
  $lvl = switch ($Status) { 'fail' {'FAIL'} 'warn' {'WARN'} 'error' {'WARN'} default {'INFO'} }
  Write-Log ("{0,-9} {1,-5} {2}" -f $Control, $Status.ToUpper(), $Observed) $lvl
}

function Invoke-Check { param([string]$Control, [scriptblock]$Body)
  try { & $Body } catch { Add-Finding $Control 'error' "Check error: $($_.Exception.Message)" }
}

function Save-Evidence { param([string]$Name, $Object, [string[]]$Controls, [string]$Format='json')
  try {
    $path = Join-Path $EvidenceDir $Name
    if ($Format -eq 'json') { $Object | ConvertTo-Json -Depth 6 | Set-Content -Path $path -Encoding UTF8 }
    else { $Object | Out-String | Set-Content -Path $path -Encoding UTF8 }
    $EvidenceManifest.Add([pscustomobject]@{ file=$Name; controls=$Controls; collected=(Get-Date).ToString('o') })
  } catch { Write-Log "Evidence save failed for $Name : $($_.Exception.Message)" 'WARN' }
}

function Get-Reg { param([string]$Path, [string]$Name)
  try { (Get-ItemProperty -Path $Path -Name $Name -ErrorAction Stop).$Name } catch { $null }
}
function Test-Svc { param([string]$Name) $s = Get-Service -Name $Name -ErrorAction SilentlyContinue; return ($null -ne $s -and $s.Status -eq 'Running') }
function Get-InstalledSoftware {
  $keys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
  Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } |
    Select-Object @{n='name';e={$_.DisplayName}}, @{n='version';e={$_.DisplayVersion}}, @{n='publisher';e={$_.Publisher}}, @{n='installDate';e={$_.InstallDate}} |
    Sort-Object name -Unique
}

Write-Log "TEKNIK Compliance Scan $AgentVersion (catalog $CatalogVersion) starting on $env:COMPUTERNAME for '$ClientName'"

# ------------------------------------------------------------------ system inventory
$OS   = Get-CimInstance Win32_OperatingSystem
$CS   = Get-CimInstance Win32_ComputerSystem
$BIOS = Get-CimInstance Win32_BIOS
$Build = [int]$OS.BuildNumber
$UBR = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' 'UBR'
$DisplayVersion = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' 'DisplayVersion'
$MachineGuid = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Cryptography' 'MachineGuid'
$IsServer = $OS.ProductType -ne 1
$dsreg = (dsregcmd /status 2>$null) -join "`n"
$AzureAdJoined = $dsreg -match 'AzureAdJoined\s*:\s*YES'
$DomainJoined  = $dsreg -match 'DomainJoined\s*:\s*YES'
$JoinType = if ($AzureAdJoined -and $DomainJoined) {'hybrid'} elseif ($AzureAdJoined) {'entra'} elseif ($DomainJoined) {'domain'} else {'workgroup'}
$LastUser = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\LogonUI' 'LastLoggedOnUser'
$Software = @(Get-InstalledSoftware)

$Device = [ordered]@{
  hostname=$env:COMPUTERNAME; machineGuid=$MachineGuid; osName=$OS.Caption; osVersion="$DisplayVersion"; osBuild="$Build.$UBR"
  manufacturer=$CS.Manufacturer; model=$CS.Model; serial=$BIOS.SerialNumber; domainJoin=$JoinType; domain=$CS.Domain
  lastUser=$LastUser; lastBoot=$OS.LastBootUpTime.ToString('o'); ramGB=[math]::Round($CS.TotalPhysicalMemory/1GB,1)
  isServer=$IsServer; cpu=(Get-CimInstance Win32_Processor | Select-Object -First 1).Name
}
Save-Evidence 'system-info.json' $Device @('PATCH-01','IAM-16')
Save-Evidence 'dsregcmd-status.txt' $dsreg @('IAM-16') 'text'
Save-Evidence 'software-inventory.json' $Software @('PATCH-05','DATA-02')

# ================================================================== ENDPOINT PROTECTION
$Mp = $null; $MpPref = $null
try { $Mp = Get-MpComputerStatus -ErrorAction Stop; $MpPref = Get-MpPreference -ErrorAction Stop } catch {}
$AvProducts = @()
try { $AvProducts = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop } catch {}
$AvEvidence = [ordered]@{ defender = $null; securityCenter = @() }
if ($Mp) { $AvEvidence.defender = $Mp | Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,IsTamperProtected,AntivirusSignatureAge,AntivirusSignatureLastUpdated,QuickScanAge,FullScanAge,AMEngineVersion,AntivirusSignatureVersion,BehaviorMonitorEnabled,IoavProtectionEnabled,NISEnabled }
foreach ($p in $AvProducts) {
  $state = [int]$p.productState
  $AvEvidence.securityCenter += [ordered]@{ name=$p.displayName; enabled=(($state -band 0x1000) -ne 0); upToDate=(($state -band 0x10) -eq 0); state=('0x{0:X6}' -f $state) }
}
Save-Evidence 'antimalware-status.json' $AvEvidence @('EP-01','EP-02','EP-03','EP-04','EP-05')
if ($MpPref) { Save-Evidence 'defender-preferences.json' ($MpPref | Select-Object MAPSReporting,SubmitSamplesConsent,AttackSurfaceReductionRules_Ids,AttackSurfaceReductionRules_Actions,DisableRealtimeMonitoring,ScanScheduleDay,ScanScheduleQuickScanTime,SignatureUpdateInterval,PUAProtection) @('EP-04','EP-06') }

Invoke-Check 'EP-01' {
  if ($Mp -and $Mp.AMServiceEnabled -and $Mp.RealTimeProtectionEnabled -and $Mp.AntivirusEnabled) {
    Add-Finding 'EP-01' 'pass' "Microsoft Defender active, real-time protection on (engine $($Mp.AMEngineVersion))" 'AV running with real-time protection'
  } else {
    $third = $AvEvidence.securityCenter | Where-Object { $_.enabled -and $_.name -notmatch 'Defender' } | Select-Object -First 1
    if ($third) { Add-Finding 'EP-01' 'pass' "Third-party AV active: $($third.name)" 'AV running with real-time protection' $third }
    else { Add-Finding 'EP-01' 'fail' 'No active anti-malware with real-time protection detected' 'AV running with real-time protection' $AvEvidence }
  }
}
Invoke-Check 'EP-02' {
  if ($Mp -and $Mp.AntivirusEnabled) {
    $age = [int]$Mp.AntivirusSignatureAge
    if ($age -le 3) { Add-Finding 'EP-02' 'pass' "Signatures $age day(s) old (v$($Mp.AntivirusSignatureVersion))" '<= 3 days' }
    elseif ($age -le 7) { Add-Finding 'EP-02' 'warn' "Signatures $age days old" '<= 3 days' }
    else { Add-Finding 'EP-02' 'fail' "Signatures $age days old" '<= 3 days' }
  } else {
    $third = $AvEvidence.securityCenter | Where-Object { $_.enabled } | Select-Object -First 1
    if ($third -and $third.upToDate) { Add-Finding 'EP-02' 'pass' "$($third.name) reports up to date" 'AV current' }
    elseif ($third) { Add-Finding 'EP-02' 'fail' "$($third.name) reports OUT OF DATE" 'AV current' }
    else { Add-Finding 'EP-02' 'fail' 'No AV to evaluate' 'AV current' }
  }
}
Invoke-Check 'EP-03' {
  if ($Mp -and $Mp.AntivirusEnabled) {
    if ($Mp.IsTamperProtected) { Add-Finding 'EP-03' 'pass' 'Tamper Protection on' 'Enabled' } else { Add-Finding 'EP-03' 'fail' 'Tamper Protection off' 'Enabled' }
  } else { Add-Finding 'EP-03' 'na' 'Third-party AV - evaluate vendor self-protection manually' 'Enabled' }
}
Invoke-Check 'EP-04' {
  if ($MpPref -and $Mp.AntivirusEnabled) {
    if ([int]$MpPref.MAPSReporting -ge 1) { Add-Finding 'EP-04' 'pass' "MAPS reporting level $($MpPref.MAPSReporting), samples=$($MpPref.SubmitSamplesConsent)" 'Cloud protection on' }
    else { Add-Finding 'EP-04' 'fail' 'Cloud-delivered protection disabled' 'Cloud protection on' }
  } else { Add-Finding 'EP-04' 'na' 'Third-party AV' 'Cloud protection on' }
}
Invoke-Check 'EP-05' {
  if ($Mp -and $Mp.AntivirusEnabled) {
    $q = [int]$Mp.QuickScanAge; $f = [int]$Mp.FullScanAge
    $best = [Math]::Min($q, $f)
    if ($best -le 7) { Add-Finding 'EP-05' 'pass' "Last scan $best day(s) ago (quick=$q, full=$f)" '<= 7 days' }
    else { Add-Finding 'EP-05' 'fail' "Last scan $best days ago (quick=$q, full=$f)" '<= 7 days' }
  } else { Add-Finding 'EP-05' 'na' 'Third-party AV - verify scan schedule' '<= 7 days' }
}
Invoke-Check 'EP-06' {
  if (-not $MpPref -or -not $Mp.AntivirusEnabled) { Add-Finding 'EP-06' 'na' 'Third-party AV'; return }
  $core = @('D4F940AB-401B-4EFC-AADC-AD5F3C50688A','3B576869-A4EC-4529-8536-B80A7769E899','BE9BA2D9-53EA-4CDC-84E5-9B1EEEE46550','9E6C4E1F-7D60-472F-BA1A-A39EF669E4B2','5BEB7EFE-FD9A-4556-801D-275E5FFC04CC','D3E037E1-3EB8-44C8-A917-57927947596D','26190899-1602-49E8-8B27-EB1D0A1CE869','E6DB77E5-3DF2-4CF1-B95A-636979351E5B')
  $ids = @($MpPref.AttackSurfaceReductionRules_Ids); $acts = @($MpPref.AttackSurfaceReductionRules_Actions)
  $enabled = 0
  for ($i=0; $i -lt $ids.Count; $i++) { if ($core -contains $ids[$i].ToUpper() -and [int]$acts[$i] -eq 1) { $enabled++ } }
  if ($enabled -ge 6) { Add-Finding 'EP-06' 'pass' "$enabled of 8 core ASR rules in block mode" '>= 6 of 8' }
  elseif ($enabled -ge 1) { Add-Finding 'EP-06' 'warn' "$enabled of 8 core ASR rules in block mode" '>= 6 of 8' }
  else { Add-Finding 'EP-06' 'fail' 'No ASR rules enforced' '>= 6 of 8' }
}
Invoke-Check 'EP-07' {
  $pol = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'EnableSmartScreen'
  $exp = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' 'SmartScreenEnabled'
  if ($pol -eq 1 -or ($null -eq $pol -and $exp -ne 'Off')) { Add-Finding 'EP-07' 'pass' "SmartScreen enabled (policy=$pol, explorer=$exp)" 'Enabled' }
  else { Add-Finding 'EP-07' 'fail' "SmartScreen disabled (policy=$pol, explorer=$exp)" 'Enabled' }
}

# ================================================================== ENCRYPTION
$BL = @(); try { $BL = Get-BitLockerVolume -ErrorAction Stop } catch {}
Save-Evidence 'bitlocker.json' ($BL | Select-Object MountPoint,VolumeType,VolumeStatus,ProtectionStatus,EncryptionMethod,EncryptionPercentage,@{n='keyProtectors';e={@($_.KeyProtector | ForEach-Object { $_.KeyProtectorType.ToString() })}}) @('ENC-01','ENC-02')
Invoke-Check 'ENC-01' {
  if (-not $IsAdmin) { Add-Finding 'ENC-01' 'error' 'Requires elevation'; return }
  $os = $BL | Where-Object { $_.MountPoint -eq $env:SystemDrive }
  if (-not $os) { Add-Finding 'ENC-01' 'fail' 'BitLocker not available / OS volume not reported' 'FullyEncrypted + Protection On'; return }
  $kp = @($os.KeyProtector | ForEach-Object { $_.KeyProtectorType.ToString() })
  if ($os.VolumeStatus -eq 'FullyEncrypted' -and $os.ProtectionStatus -eq 'On') {
    $note = if ($kp -contains 'RecoveryPassword') { '' } else { ' - WARNING: no recovery password protector (escrow impossible)' }
    Add-Finding 'ENC-01' ($(if ($note) {'warn'} else {'pass'})) "OS drive $($os.VolumeStatus), protection On, $($os.EncryptionMethod), protectors: $($kp -join ',')$note" 'FullyEncrypted + Protection On'
  } elseif ($os.VolumeStatus -like '*Encrypt*' -and $os.ProtectionStatus -eq 'Off') { Add-Finding 'ENC-01' 'fail' "Encrypted but protection is OFF (suspended) - $($os.EncryptionPercentage)%" 'Protection On' }
  else { Add-Finding 'ENC-01' 'fail' "OS drive $($os.VolumeStatus) ($($os.EncryptionPercentage)%), protection $($os.ProtectionStatus)" 'FullyEncrypted + Protection On' }
}
Invoke-Check 'ENC-02' {
  if (-not $IsAdmin) { Add-Finding 'ENC-02' 'error' 'Requires elevation'; return }
  $data = @($BL | Where-Object { $_.VolumeType -eq 'Data' -and $_.MountPoint -match '^[A-Z]:$' })
  if ($data.Count -eq 0) { Add-Finding 'ENC-02' 'na' 'No fixed data volumes' ; return }
  $bad = @($data | Where-Object { -not ($_.VolumeStatus -eq 'FullyEncrypted' -and $_.ProtectionStatus -eq 'On') })
  if ($bad.Count -eq 0) { Add-Finding 'ENC-02' 'pass' "$($data.Count) data volume(s) encrypted" 'All encrypted' }
  else { Add-Finding 'ENC-02' 'fail' ("Unencrypted: " + (($bad | ForEach-Object { "$($_.MountPoint) $($_.VolumeStatus)" }) -join '; ')) 'All encrypted' }
}
Invoke-Check 'ENC-03' {
  $tpm = $null; try { $tpm = Get-Tpm -ErrorAction Stop } catch {}
  $spec = (Get-CimInstance -Namespace root/cimv2/security/microsofttpm -ClassName Win32_Tpm -ErrorAction SilentlyContinue).SpecVersion
  if ($tpm -and $tpm.TpmPresent -and $tpm.TpmReady -and "$spec" -match '2\.0') { Add-Finding 'ENC-03' 'pass' "TPM 2.0 present and ready (spec $spec)" 'TPM 2.0 ready' }
  elseif ($tpm -and $tpm.TpmPresent) { Add-Finding 'ENC-03' 'warn' "TPM present but ready=$($tpm.TpmReady), spec=$spec" 'TPM 2.0 ready' }
  else { Add-Finding 'ENC-03' 'fail' 'No TPM detected' 'TPM 2.0 ready' }
}
Invoke-Check 'ENC-04' {
  try { $sb = Confirm-SecureBootUEFI -ErrorAction Stop; if ($sb) { Add-Finding 'ENC-04' 'pass' 'Secure Boot enabled' 'Enabled' } else { Add-Finding 'ENC-04' 'fail' 'Secure Boot disabled' 'Enabled' } }
  catch { Add-Finding 'ENC-04' 'fail' 'Legacy BIOS / Secure Boot not supported' 'Enabled (UEFI)' }
}
Invoke-Check 'ENC-05' {
  $fve = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\FVE' 'RDVDenyWriteAccess'
  $denyAll = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices' 'Deny_All'
  $denyWrite = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}' 'Deny_Write'
  if ($fve -eq 1 -or $denyAll -eq 1 -or $denyWrite -eq 1) { Add-Finding 'ENC-05' 'pass' "Removable storage controlled (BitLockerToGo required=$fve, denyAll=$denyAll, denyWrite=$denyWrite)" 'Write blocked or encryption required' }
  else { Add-Finding 'ENC-05' 'fail' 'Unrestricted writes to removable storage' 'Write blocked or encryption required' }
}

# ================================================================== PATCH MANAGEMENT
$Hotfixes = @(); try { $Hotfixes = Get-HotFix -ErrorAction Stop | Sort-Object InstalledOn -Descending } catch {}
Save-Evidence 'hotfixes.json' ($Hotfixes | Select-Object HotFixID,Description,InstalledOn -First 40) @('PATCH-02')
Invoke-Check 'PATCH-01' {
  $cap = $OS.Caption
  if ($IsServer) {
    if ($cap -match '2008|2012') { Add-Finding 'PATCH-01' 'fail' "$cap - end of support" 'Supported OS' }
    elseif ($cap -match '2016') { Add-Finding 'PATCH-01' 'warn' "$cap - extended support ends Jan 2027; plan migration" 'Supported OS' }
    else { Add-Finding 'PATCH-01' 'pass' "$cap build $Build" 'Supported OS' }
    return
  }
  if ($Build -lt 22000) { Add-Finding 'PATCH-01' 'fail' "$cap $DisplayVersion (build $Build) - Windows 10 reached end of support 14 Oct 2025. Override to N/A only if ESU-enrolled." 'Windows 11 24H2+' }
  elseif ($Build -lt 26100) {
    $edition = $OS.Caption
    if ($edition -match 'Enterprise|Education' -and $Build -ge 22631) { Add-Finding 'PATCH-01' 'warn' "$cap $DisplayVersion - 23H2 Enterprise supported until Nov 2026; upgrade soon" 'Windows 11 24H2+' }
    else { Add-Finding 'PATCH-01' 'fail' "$cap $DisplayVersion (build $Build) - this feature release is out of support" 'Windows 11 24H2+' }
  } else { Add-Finding 'PATCH-01' 'pass' "$cap $DisplayVersion (build $Build.$UBR)" 'Windows 11 24H2+' }
}
Invoke-Check 'PATCH-02' {
  $lastHF = ($Hotfixes | Where-Object { $_.InstalledOn } | Select-Object -First 1).InstalledOn
  $wuLast = $null
  $raw = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\Results\Install' 'LastSuccessTime'
  if ($raw) { try { $wuLast = [datetime]::Parse($raw) } catch {} }
  $last = @($lastHF, $wuLast) | Where-Object { $_ } | Sort-Object -Descending | Select-Object -First 1
  if (-not $last) { Add-Finding 'PATCH-02' 'fail' 'No update install history found' '<= 30 days'; return }
  $days = [int]((Get-Date) - $last).TotalDays
  if ($days -le 30) { Add-Finding 'PATCH-02' 'pass' "Last update installed $days day(s) ago ($($last.ToString('yyyy-MM-dd')))" '<= 30 days' }
  elseif ($days -le 60) { Add-Finding 'PATCH-02' 'warn' "Last update $days days ago" '<= 30 days' }
  else { Add-Finding 'PATCH-02' 'fail' "Last update $days days ago" '<= 30 days' }
}
Invoke-Check 'PATCH-03' {
  $p = @()
  if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { $p += 'CBS' }
  if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') { $p += 'WindowsUpdate' }
  if (Get-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' 'PendingFileRenameOperations') { $p += 'PendingFileRename' }
  if ($p.Count -eq 0) { Add-Finding 'PATCH-03' 'pass' 'No pending reboot' 'None' } else { Add-Finding 'PATCH-03' 'warn' "Reboot pending: $($p -join ', ')" 'None' }
}
Invoke-Check 'PATCH-04' {
  $svc = Get-Service wuauserv -ErrorAction SilentlyContinue
  $defer = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' 'DeferQualityUpdatesPeriodInDays'
  $noAuto = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' 'NoAutoUpdate'
  $wsus = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' 'UseWUServer'
  $mdm = Test-Path 'HKLM:\SOFTWARE\Microsoft\Enrollments'
  if ($svc.StartType -eq 'Disabled') { Add-Finding 'PATCH-04' 'fail' 'Windows Update service disabled' 'Enabled'; return }
  if ($defer -and [int]$defer -gt 7) { Add-Finding 'PATCH-04' 'warn' "Quality updates deferred $defer days" '<= 7 days'; return }
  if ($noAuto -eq 1 -and -not ($wsus -eq 1 -or $mdm)) { Add-Finding 'PATCH-04' 'warn' 'Automatic updates disabled with no WSUS/MDM management detected' 'Managed updates'; return }
  Add-Finding 'PATCH-04' 'pass' "Update service $($svc.StartType), defer=$defer, WSUS=$wsus, MDM=$mdm" 'Enabled'
}
Invoke-Check 'PATCH-05' {
  $rules = @(
    @{ re='Adobe Flash|Shockwave|Microsoft Silverlight|QuickTime'; sev='fail'; why='End-of-life plugin' },
    @{ re='^Java(\s+\d+)?\s+Update|Java 8 Update|Java\(TM\) (6|7|8)'; sev='fail'; why='Legacy Oracle Java runtime' },
    @{ re='Python 2\.'; sev='fail'; why='Python 2 EOL' },
    @{ re='Microsoft Office (Professional|Standard|Home|Professional Plus)?\s*20(10|13|16|19)'; sev='fail'; why='Office 2010/2013/2016/2019 out of support (2016/2019 EOS Oct 2025)' },
    @{ re='Adobe (Reader|Acrobat) (X|XI|2015|2017)'; sev='fail'; why='Unsupported Acrobat/Reader' },
    @{ re='Internet Explorer'; sev='warn'; why='IE retired' },
    @{ re='uTorrent|BitTorrent|qBittorrent|Vuze|FrostWire|LimeWire'; sev='fail'; why='P2P file sharing' },
    @{ re='TeamViewer|AnyDesk|LogMeIn|Splashtop|RustDesk|UltraViewer|Chrome Remote Desktop|GoToMyPC|ScreenConnect|ConnectWise Control|Ammyy|Supremo|Zoho Assist'; sev='warn'; why='Remote-access tool - confirm it is the TEKNIK-managed tool; remove otherwise' },
    @{ re='Wireshark|Nmap|Cain|Angry IP|Advanced IP Scanner'; sev='warn'; why='Network tooling on end-user workstation' },
    @{ re='VLC media player 2\.|7-Zip (9|15|16|17|18)\.|WinRAR 5\.|Notepad\+\+ 7\.[0-8]\.'; sev='warn'; why='Old version with known CVEs' },
    @{ re='CCleaner|Driver Booster|PC Optimizer|MyCleanPC|WebDiscover|Wondershare Helper|OpenCandy'; sev='warn'; why='PUP / bundleware' }
  )
  $hits = @()
  foreach ($s in $Software) { foreach ($r in $rules) { if ($s.name -match $r.re) { $hits += [pscustomobject]@{ name=$s.name; version=$s.version; severity=$r.sev; reason=$r.why }; break } } }
  if ($hits.Count -eq 0) { Add-Finding 'PATCH-05' 'pass' "$($Software.Count) applications inventoried, none flagged" 'No EOL/high-risk software' }
  elseif (@($hits | Where-Object severity -eq 'fail').Count -gt 0) { Add-Finding 'PATCH-05' 'fail' ("Flagged: " + (($hits | Select-Object -First 6 | ForEach-Object { $_.name }) -join '; ')) 'No EOL/high-risk software' $hits }
  else { Add-Finding 'PATCH-05' 'warn' ("Review: " + (($hits | ForEach-Object { $_.name }) -join '; ')) 'No EOL/high-risk software' $hits }
}

# ================================================================== IDENTITY & ACCESS
$LocalUsers = @(); try { $LocalUsers = Get-LocalUser -ErrorAction Stop } catch {}
$Admins = @(); try { $Admins = Get-LocalGroupMember -Group 'Administrators' -ErrorAction Stop } catch {}
Save-Evidence 'local-accounts.json' @{ users=($LocalUsers | Select-Object Name,Enabled,PasswordRequired,PasswordLastSet,LastLogon,@{n='sid';e={$_.SID.Value}}); administrators=($Admins | Select-Object Name,ObjectClass,PrincipalSource) } @('IAM-01','IAM-02','IAM-03','IAM-04','IAM-14')
$NetAccounts = (net accounts 2>$null) -join "`n"
Save-Evidence 'net-accounts.txt' $NetAccounts @('IAM-05','IAM-07','IAM-08','IAM-09','IAM-10') 'text'
$SecPol = @{}
if ($IsAdmin) {
  $cfg = Join-Path $env:TEMP "teknik-secpol-$RunId.inf"
  secedit /export /cfg $cfg /quiet 2>$null | Out-Null
  if (Test-Path $cfg) {
    Get-Content $cfg | ForEach-Object { if ($_ -match '^\s*([A-Za-z]+)\s*=\s*(.+?)\s*$') { $SecPol[$matches[1]] = $matches[2] } }
    Save-Evidence 'security-policy.inf' (Get-Content $cfg) @('IAM-05','IAM-06','IAM-07','IAM-08','IAM-09','IAM-10') 'text'
    Remove-Item $cfg -Force -ErrorAction SilentlyContinue
  }
}
function Get-NetAcct([string]$label) { if ($NetAccounts -match "(?m)^$label[^:]*:\s*(.+)$") { return $matches[1].Trim() } ; return $null }

Invoke-Check 'IAM-01' {
  if ($Admins.Count -eq 0) { Add-Finding 'IAM-01' 'error' 'Could not enumerate Administrators group'; return }
  $names = @($Admins | ForEach-Object { $_.Name })
  $rid500 = ($LocalUsers | Where-Object { $_.SID.Value -like 'S-1-5-21-*-500' }).Name
  $unexpected = @($names | Where-Object { $n = $_; $short = ($n -split '\\')[-1]; -not (($short -eq $rid500) -or ($n -match 'Domain Admins|Enterprise Admins') -or (($AllowedAdminPatterns | Where-Object { $n -like $_ -or $short -like $_ }).Count -gt 0)) })
  $lastShort = if ($LastUser) { ($LastUser -split '\\')[-1] } else { '' }
  $userIsAdmin = $lastShort -and ($unexpected | Where-Object { ($_ -split '\\')[-1] -ieq $lastShort })
  if ($unexpected.Count -eq 0) { Add-Finding 'IAM-01' 'pass' "Administrators: $($names -join ', ')" 'Managed accounts only' }
  elseif ($userIsAdmin -or $unexpected.Count -gt 2) { Add-Finding 'IAM-01' 'fail' "Unmanaged local admins: $($unexpected -join ', ')$(if($userIsAdmin){' (includes last interactive user)'})" 'Managed accounts only' @{ members=$names; unexpected=$unexpected } }
  else { Add-Finding 'IAM-01' 'warn' "Review local admins: $($unexpected -join ', ')" 'Managed accounts only' @{ members=$names; unexpected=$unexpected } }
}
Invoke-Check 'IAM-02' {
  $g = $LocalUsers | Where-Object { $_.SID.Value -like 'S-1-5-21-*-501' }
  if (-not $g -or -not $g.Enabled) { Add-Finding 'IAM-02' 'pass' 'Guest disabled' 'Disabled' } else { Add-Finding 'IAM-02' 'fail' 'Guest account ENABLED' 'Disabled' }
}
Invoke-Check 'IAM-03' {
  $a = $LocalUsers | Where-Object { $_.SID.Value -like 'S-1-5-21-*-500' }
  if (-not $a) { Add-Finding 'IAM-03' 'na' 'No RID-500 account'; return }
  if (-not $a.Enabled) { Add-Finding 'IAM-03' 'pass' "Built-in Administrator '$($a.Name)' disabled" 'Disabled or renamed' }
  elseif ($a.Name -ne 'Administrator') { Add-Finding 'IAM-03' 'pass' "Built-in Administrator renamed to '$($a.Name)' (enabled)" 'Disabled or renamed' }
  else { Add-Finding 'IAM-03' 'fail' "Built-in 'Administrator' enabled with default name" 'Disabled or renamed' }
}
Invoke-Check 'IAM-04' {
  $bad = @($LocalUsers | Where-Object { $_.Enabled -and -not $_.PasswordRequired })
  if ($bad.Count -eq 0) { Add-Finding 'IAM-04' 'pass' 'All enabled accounts require a password' 'Password required' }
  else { Add-Finding 'IAM-04' 'fail' "Password not required: $(($bad | ForEach-Object Name) -join ', ')" 'Password required' }
}
Invoke-Check 'IAM-05' {
  $v = Get-NetAcct 'Minimum password length'; if ($null -eq $v) { $v = $SecPol['MinimumPasswordLength'] }
  $n = 0; [int]::TryParse("$v", [ref]$n) | Out-Null
  if ($n -ge 12) { Add-Finding 'IAM-05' 'pass' "Minimum length $n" '>= 12' } elseif ($n -ge 8) { Add-Finding 'IAM-05' 'warn' "Minimum length $n" '>= 12' } else { Add-Finding 'IAM-05' 'fail' "Minimum length $n" '>= 12' }
}
Invoke-Check 'IAM-06' {
  if ($SecPol.Count -eq 0) { Add-Finding 'IAM-06' 'error' 'secedit export unavailable (elevation)'; return }
  if ($SecPol['PasswordComplexity'] -eq '1') { Add-Finding 'IAM-06' 'pass' 'Complexity enabled' 'Enabled' } else { Add-Finding 'IAM-06' 'fail' 'Complexity disabled' 'Enabled' }
}
Invoke-Check 'IAM-07' {
  $v = Get-NetAcct 'Maximum password age'
  if ("$v" -match 'Unlimited') { Add-Finding 'IAM-07' 'warn' 'Maximum password age unlimited - acceptable only with MFA + breach-detection (document as override)' '<= 90 days'; return }
  $n = 0; [int]::TryParse(("$v" -replace '\D',''), [ref]$n) | Out-Null
  if ($n -ge 1 -and $n -le 90) { Add-Finding 'IAM-07' 'pass' "Max age $n days" '<= 90 days' } else { Add-Finding 'IAM-07' 'warn' "Max age $v" '<= 90 days' }
}
Invoke-Check 'IAM-08' {
  $v = Get-NetAcct 'Length of password history'
  $n = 0; [int]::TryParse(("$v" -replace '\D',''), [ref]$n) | Out-Null
  if ($n -ge 4) { Add-Finding 'IAM-08' 'pass' "History $n" '>= 4' } else { Add-Finding 'IAM-08' 'fail' "History $v" '>= 4' }
}
Invoke-Check 'IAM-09' {
  $v = Get-NetAcct 'Lockout threshold'
  if ("$v" -match 'Never') { Add-Finding 'IAM-09' 'fail' 'Lockout threshold: Never' '<= 10 attempts'; return }
  $n = 0; [int]::TryParse(("$v" -replace '\D',''), [ref]$n) | Out-Null
  if ($n -ge 1 -and $n -le 10) { Add-Finding 'IAM-09' 'pass' "Lockout after $n attempts" '<= 10' } else { Add-Finding 'IAM-09' 'fail' "Lockout threshold $v" '<= 10' }
}
Invoke-Check 'IAM-10' {
  $t = Get-NetAcct 'Lockout threshold'; if ("$t" -match 'Never') { Add-Finding 'IAM-10' 'fail' 'No lockout configured' '>= 30 min'; return }
  $v = Get-NetAcct 'Lockout duration'
  $n = 0; [int]::TryParse(("$v" -replace '\D',''), [ref]$n) | Out-Null
  if ($n -ge 30 -or $n -eq 0 -and "$v" -match '0') { Add-Finding 'IAM-10' 'pass' "Lockout duration $v min" '>= 30 min' } else { Add-Finding 'IAM-10' 'fail' "Lockout duration $v min" '>= 30 min' }
}
Invoke-Check 'IAM-11' {
  $inact = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' 'InactivityTimeoutSecs'
  $polTO = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Control Panel\Desktop' 'ScreenSaveTimeOut'
  $polSec = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Control Panel\Desktop' 'ScreenSaverIsSecure'
  $mdmTO = Get-Reg 'HKLM:\SOFTWARE\Microsoft\PolicyManager\current\device\DeviceLock' 'MaxInactivityTimeDeviceLock'
  $userHits = @()
  foreach ($h in (Get-ChildItem Registry::HKEY_USERS -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'S-1-5-21-\d+-\d+-\d+-\d+$' })) {
    $p = "Registry::$($h.Name)\Control Panel\Desktop"; $pp = "Registry::$($h.Name)\Software\Policies\Microsoft\Windows\Control Panel\Desktop"
    $to = Get-Reg $pp 'ScreenSaveTimeOut'; if (-not $to) { $to = Get-Reg $p 'ScreenSaveTimeOut' }
    $sec = Get-Reg $pp 'ScreenSaverIsSecure'; if ($null -eq $sec) { $sec = Get-Reg $p 'ScreenSaverIsSecure' }
    $act = Get-Reg $pp 'ScreenSaveActive'; if ($null -eq $act) { $act = Get-Reg $p 'ScreenSaveActive' }
    $userHits += [pscustomobject]@{ sid=$h.PSChildName; timeout=$to; secure=$sec; active=$act }
  }
  if (($inact -and [int]$inact -le 900 -and [int]$inact -gt 0) -or ($mdmTO -and [int]$mdmTO -le 15 -and [int]$mdmTO -gt 0)) { Add-Finding 'IAM-11' 'pass' "Machine inactivity lock: InactivityTimeoutSecs=$inact, MDM=$mdmTO min" '<= 15 min, secure'; return }
  if ($polTO -and [int]$polTO -le 900 -and $polSec -eq '1') { Add-Finding 'IAM-11' 'pass' "Machine policy screensaver $polTO s, secure" '<= 15 min, secure'; return }
  $ok = @($userHits | Where-Object { $_.active -eq '1' -and $_.secure -eq '1' -and $_.timeout -and [int]$_.timeout -le 900 })
  if ($userHits.Count -gt 0 -and $ok.Count -eq $userHits.Count) { Add-Finding 'IAM-11' 'warn' "Per-user screensaver lock configured for all $($userHits.Count) profile(s) but not enforced by policy" '<= 15 min, enforced' $userHits }
  else { Add-Finding 'IAM-11' 'fail' "No enforced inactivity lock (InactivityTimeoutSecs=$inact, policy=$polTO/$polSec, MDM=$mdmTO)" '<= 15 min, enforced' $userHits }
}
Invoke-Check 'IAM-12' {
  $k = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
  $lua = Get-Reg $k 'EnableLUA'; $cp = Get-Reg $k 'ConsentPromptBehaviorAdmin'; $sd = Get-Reg $k 'PromptOnSecureDesktop'
  if ($lua -eq 1 -and $cp -ne 0) { Add-Finding 'IAM-12' 'pass' "UAC on (ConsentPromptBehaviorAdmin=$cp, SecureDesktop=$sd)" 'Enabled' } else { Add-Finding 'IAM-12' 'fail' "UAC EnableLUA=$lua, ConsentPromptBehaviorAdmin=$cp" 'Enabled' }
}
Invoke-Check 'IAM-13' {
  $k = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
  $auto = Get-Reg $k 'AutoAdminLogon'; $pw = Get-Reg $k 'DefaultPassword'
  if ("$auto" -eq '1' -and $pw) { Add-Finding 'IAM-13' 'fail' "AutoAdminLogon enabled with plaintext DefaultPassword for '$(Get-Reg $k 'DefaultUserName')'" 'Disabled' }
  elseif ("$auto" -eq '1') { Add-Finding 'IAM-13' 'warn' 'AutoAdminLogon enabled (no stored DefaultPassword - check LSA secret)' 'Disabled' }
  else { Add-Finding 'IAM-13' 'pass' 'Automatic logon disabled' 'Disabled' }
}
Invoke-Check 'IAM-14' {
  $cut = (Get-Date).AddDays(-90)
  $stale = @($LocalUsers | Where-Object { $_.Enabled -and $_.LastLogon -and $_.LastLogon -lt $cut -and $_.SID.Value -notlike '*-500' })
  if ($stale.Count -eq 0) { Add-Finding 'IAM-14' 'pass' 'No enabled local accounts inactive > 90 days' 'None' }
  else { Add-Finding 'IAM-14' 'warn' ("Inactive enabled accounts: " + (($stale | ForEach-Object { "$($_.Name) (last $($_.LastLogon.ToString('yyyy-MM-dd')))" }) -join ', ')) 'None' }
}
Invoke-Check 'IAM-15' {
  $winLaps = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Policies\LAPS') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\LAPS\Config')
  $legacy = (Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft Services\AdmPwd' 'AdmPwdEnabled') -eq 1
  if ($winLaps -or $legacy) { Add-Finding 'IAM-15' 'pass' "LAPS configured (WindowsLAPS=$winLaps, legacy=$legacy)" 'LAPS enabled' }
  elseif ($JoinType -eq 'workgroup') { Add-Finding 'IAM-15' 'warn' 'Workgroup device - LAPS unavailable; ensure unique local admin password' 'LAPS enabled' }
  else { Add-Finding 'IAM-15' 'fail' 'LAPS not configured' 'LAPS enabled' }
}
Invoke-Check 'IAM-16' {
  if ($JoinType -ne 'workgroup') { Add-Finding 'IAM-16' 'pass' "Join type: $JoinType ($($CS.Domain))" 'Entra ID / AD joined' } else { Add-Finding 'IAM-16' 'fail' 'Workgroup (unmanaged identity)' 'Entra ID / AD joined' }
}

# ================================================================== NETWORK SECURITY
$FW = @(); try { $FW = Get-NetFirewallProfile -ErrorAction Stop } catch {}
Save-Evidence 'firewall-profiles.json' ($FW | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction,LogBlocked,LogMaxSizeKilobytes,LogFileName) @('NET-01','NET-02')
Invoke-Check 'NET-01' {
  if ($FW.Count -eq 0) { Add-Finding 'NET-01' 'error' 'Firewall status unavailable'; return }
  $bad = @($FW | Where-Object { -not $_.Enabled -or $_.DefaultInboundAction -eq 'Allow' })
  if ($bad.Count -eq 0) { Add-Finding 'NET-01' 'pass' 'All profiles enabled, inbound default Block' 'Enabled on all profiles' }
  else { Add-Finding 'NET-01' 'fail' ("Weak profiles: " + (($bad | ForEach-Object { "$($_.Name)(enabled=$($_.Enabled),in=$($_.DefaultInboundAction))" }) -join ', ')) 'Enabled on all profiles' }
}
Invoke-Check 'NET-02' {
  $off = @($FW | Where-Object { -not $_.LogBlocked })
  if ($FW.Count -gt 0 -and $off.Count -eq 0) { Add-Finding 'NET-02' 'pass' 'Dropped-packet logging on all profiles' 'Enabled' } else { Add-Finding 'NET-02' 'fail' "Logging off for: $(($off | ForEach-Object Name) -join ', ')" 'Enabled' }
}
$SmbSrv = $null; $SmbCli = $null
try { $SmbSrv = Get-SmbServerConfiguration -ErrorAction Stop; $SmbCli = Get-SmbClientConfiguration -ErrorAction Stop } catch {}
$Smb1Feat = $null; try { $Smb1Feat = (Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction Stop).State } catch {}
Save-Evidence 'smb.json' @{ server=($SmbSrv | Select-Object EnableSMB1Protocol,RequireSecuritySignature,EncryptData,EnableSecuritySignature); client=($SmbCli | Select-Object RequireSecuritySignature,EnableSecuritySignature); smb1Feature="$Smb1Feat" } @('NET-03','NET-04')
Invoke-Check 'NET-03' {
  $enabled = ($SmbSrv -and $SmbSrv.EnableSMB1Protocol) -or ("$Smb1Feat" -eq 'Enabled')
  if (-not $enabled) { Add-Finding 'NET-03' 'pass' "SMBv1 disabled (feature=$Smb1Feat)" 'Disabled' } else { Add-Finding 'NET-03' 'fail' "SMBv1 ENABLED (server=$($SmbSrv.EnableSMB1Protocol), feature=$Smb1Feat)" 'Disabled' }
}
Invoke-Check 'NET-04' {
  if (-not $SmbSrv) { Add-Finding 'NET-04' 'error' 'SMB config unavailable'; return }
  if ($SmbSrv.RequireSecuritySignature -and $SmbCli.RequireSecuritySignature) { Add-Finding 'NET-04' 'pass' 'SMB signing required (client + server)' 'Required' }
  elseif ($SmbSrv.RequireSecuritySignature -or $SmbCli.RequireSecuritySignature) { Add-Finding 'NET-04' 'warn' "Signing required: server=$($SmbSrv.RequireSecuritySignature) client=$($SmbCli.RequireSecuritySignature)" 'Required' }
  else { Add-Finding 'NET-04' 'fail' 'SMB signing not required' 'Required' }
}
Invoke-Check 'NET-05' {
  $llmnr = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' 'EnableMulticast'
  $nb = @(Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters\Interfaces' -ErrorAction SilentlyContinue | ForEach-Object { Get-Reg $_.PSPath 'NetbiosOptions' })
  $nbOn = @($nb | Where-Object { $_ -ne 2 }).Count
  if ($llmnr -eq 0 -and $nbOn -eq 0) { Add-Finding 'NET-05' 'pass' 'LLMNR disabled, NetBIOS disabled on all interfaces' 'Both disabled' }
  elseif ($llmnr -eq 0) { Add-Finding 'NET-05' 'warn' "LLMNR disabled; NetBIOS still enabled on $nbOn interface(s)" 'Both disabled' }
  else { Add-Finding 'NET-05' 'fail' "LLMNR enabled (EnableMulticast=$llmnr); NetBIOS enabled on $nbOn interface(s)" 'Both disabled' }
}
Invoke-Check 'NET-06' {
  $deny = Get-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' 'fDenyTSConnections'
  $nla = Get-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' 'UserAuthentication'
  $rules = @(Get-NetFirewallRule -DisplayGroup 'Remote Desktop' -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' })
  $publicOpen = @($rules | Where-Object { $_.Profile -match 'Public|Any' }).Count -gt 0
  if ($deny -eq 1) { Add-Finding 'NET-06' 'pass' 'Remote Desktop disabled' 'Disabled or NLA + scoped' }
  elseif ($nla -eq 1 -and -not $publicOpen) { Add-Finding 'NET-06' ($(if ($IsServer) {'pass'} else {'warn'})) "RDP enabled with NLA; firewall rules not open on Public profile" 'Disabled or NLA + scoped' }
  elseif ($nla -eq 1) { Add-Finding 'NET-06' 'warn' 'RDP enabled with NLA but firewall rule open on Public profile' 'Disabled or NLA + scoped' }
  else { Add-Finding 'NET-06' 'fail' 'RDP enabled WITHOUT Network Level Authentication' 'Disabled or NLA + scoped' }
}
Invoke-Check 'NET-07' {
  $s = Get-Service RemoteRegistry -ErrorAction SilentlyContinue
  if (-not $s -or $s.StartType -eq 'Disabled') { Add-Finding 'NET-07' 'pass' 'Remote Registry disabled' 'Disabled' } elseif ($s.Status -eq 'Running') { Add-Finding 'NET-07' 'fail' 'Remote Registry running' 'Disabled' } else { Add-Finding 'NET-07' 'warn' "Remote Registry $($s.StartType) (stopped)" 'Disabled' }
}
Invoke-Check 'NET-08' {
  if (-not (Test-Svc 'WinRM')) { Add-Finding 'NET-08' 'pass' 'WinRM service not running' 'Encrypted, no Basic'; return }
  $cfg = (winrm get winrm/config 2>$null) -join "`n"
  $unenc = [regex]::Matches($cfg, 'AllowUnencrypted\s*=\s*(\w+)') | ForEach-Object { $_.Groups[1].Value }
  $basic = [regex]::Matches($cfg, 'Basic\s*=\s*(\w+)') | ForEach-Object { $_.Groups[1].Value }
  if (($unenc -contains 'true') -or ($basic -contains 'true')) { Add-Finding 'NET-08' 'fail' "WinRM AllowUnencrypted=[$($unenc -join ',')] Basic=[$($basic -join ',')]" 'false / false' } else { Add-Finding 'NET-08' 'pass' 'WinRM encrypted, Basic auth off' 'false / false' }
}
Invoke-Check 'NET-09' {
  $risky = @(21,23,69,512,513,514,1433,1434,3306,5432,5800,5900,5901,6881,6882,6883,6884,6885,6886,6887,6888,6889,8291,27017)
  $procs = @{}; Get-Process | ForEach-Object { $procs[$_.Id] = $_.ProcessName }
  $l = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -notin @('127.0.0.1','::1') } |
        Select-Object @{n='port';e={$_.LocalPort}}, @{n='address';e={$_.LocalAddress}}, @{n='pid';e={$_.OwningProcess}}, @{n='process';e={$procs[[int]$_.OwningProcess]}} | Sort-Object port -Unique)
  Save-Evidence 'listening-ports.json' $l @('NET-09')
  $bad = @($l | Where-Object { $risky -contains [int]$_.port })
  if ($bad.Count -eq 0) { Add-Finding 'NET-09' 'pass' "$($l.Count) listener(s), none on high-risk ports" 'No risky listeners' $l }
  else { Add-Finding 'NET-09' 'warn' ("High-risk listeners: " + (($bad | ForEach-Object { "$($_.port)/$($_.process)" }) -join ', ')) 'No risky listeners' $l }
}
Invoke-Check 'NET-10' {
  $out = netsh wlan show profiles 2>$null
  if (-not $out -or ($out -join '') -notmatch 'All User Profile') { Add-Finding 'NET-10' 'na' 'No Wi-Fi profiles / no WLAN adapter'; return }
  $names = [regex]::Matches(($out -join "`n"), 'All User Profile\s*:\s*(.+)') | ForEach-Object { $_.Groups[1].Value.Trim() }
  $weak = @()
  foreach ($n in $names) { $d = (netsh wlan show profile name="$n" 2>$null) -join "`n"; if ($d -match 'Authentication\s*:\s*(Open|WEP|Shared)') { $weak += "$n ($($matches[1]))" } }
  if ($weak.Count -eq 0) { Add-Finding 'NET-10' 'pass' "$($names.Count) Wi-Fi profile(s), all WPA2/WPA3" 'WPA2/WPA3 only' } else { Add-Finding 'NET-10' 'fail' "Insecure Wi-Fi profiles: $($weak -join ', ')" 'WPA2/WPA3 only' }
}

# ================================================================== LOGGING & MONITORING
$AuditCsv = @(); if ($IsAdmin) { try { $AuditCsv = (auditpol /get /category:* /r 2>$null) | ConvertFrom-Csv } catch {} }
Save-Evidence 'auditpol.csv' ($AuditCsv | ConvertTo-Csv -NoTypeInformation) @('LOG-01') 'text'
Invoke-Check 'LOG-01' {
  if ($AuditCsv.Count -eq 0) { Add-Finding 'LOG-01' 'error' 'auditpol unavailable (elevation)'; return }
  $req = @{ 'Credential Validation'='both'; 'User Account Management'='both'; 'Security Group Management'='both'; 'Logon'='both'; 'Logoff'='success'; 'Account Lockout'='both'; 'Audit Policy Change'='both'; 'Sensitive Privilege Use'='both'; 'Process Creation'='success'; 'Security State Change'='success'; 'System Integrity'='both' }
  $missing = @()
  foreach ($k in $req.Keys) {
    $row = $AuditCsv | Where-Object { $_.Subcategory -eq $k } | Select-Object -First 1
    $s = if ($row) { $row.'Inclusion Setting' } else { 'No Auditing' }
    $ok = switch ($req[$k]) { 'both' { $s -eq 'Success and Failure' } 'success' { $s -match 'Success' } }
    if (-not $ok) { $missing += "$k ($s)" }
  }
  if ($missing.Count -eq 0) { Add-Finding 'LOG-01' 'pass' 'All required audit subcategories enabled' 'CIS L1 audit baseline' }
  elseif ($missing.Count -le 3) { Add-Finding 'LOG-01' 'warn' "Missing: $($missing -join '; ')" 'CIS L1 audit baseline' $missing }
  else { Add-Finding 'LOG-01' 'fail' "$($missing.Count) subcategories not audited: $($missing -join '; ')" 'CIS L1 audit baseline' $missing }
}
Invoke-Check 'LOG-02' {
  $logs = @('Security','Application','System') | ForEach-Object { $l = Get-WinEvent -ListLog $_ -ErrorAction SilentlyContinue; [pscustomobject]@{ log=$_; maxMB=[math]::Round($l.MaximumSizeInBytes/1MB); mode=$l.LogMode; oldest=(Get-WinEvent -LogName $_ -MaxEvents 1 -Oldest -ErrorAction SilentlyContinue).TimeCreated } }
  Save-Evidence 'eventlog-config.json' $logs @('LOG-02')
  $sec = $logs | Where-Object log -eq 'Security'; $app = $logs | Where-Object log -eq 'Application'; $sys = $logs | Where-Object log -eq 'System'
  $span = if ($sec.oldest) { [int]((Get-Date) - $sec.oldest).TotalDays } else { -1 }
  if ($sec.maxMB -ge 196 -and $app.maxMB -ge 32 -and $sys.maxMB -ge 32) { Add-Finding 'LOG-02' 'pass' "Security=$($sec.maxMB)MB (oldest event $span days), App=$($app.maxMB)MB, Sys=$($sys.maxMB)MB" 'Sec >=196MB, App/Sys >=32MB' }
  else { Add-Finding 'LOG-02' 'fail' "Security=$($sec.maxMB)MB (covers $span days), App=$($app.maxMB)MB, Sys=$($sys.maxMB)MB" 'Sec >=196MB, App/Sys >=32MB' }
}
Invoke-Check 'LOG-03' {
  $sb = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging' 'EnableScriptBlockLogging'
  $ml = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ModuleLogging' 'EnableModuleLogging'
  if ($sb -eq 1 -and $ml -eq 1) { Add-Finding 'LOG-03' 'pass' 'Script block + module logging on' 'Both enabled' } elseif ($sb -eq 1) { Add-Finding 'LOG-03' 'warn' 'Script block logging on; module logging off' 'Both enabled' } else { Add-Finding 'LOG-03' 'fail' "ScriptBlock=$sb Module=$ml" 'Both enabled' }
}
Invoke-Check 'LOG-04' {
  $st = (w32tm /query /status 2>$null) -join "`n"
  Save-Evidence 'w32tm-status.txt' $st @('LOG-04') 'text'
  if (-not (Test-Svc 'W32Time')) { Add-Finding 'LOG-04' 'fail' 'Windows Time service not running' 'Synced within 5 min'; return }
  $src = if ($st -match 'Source:\s*(.+)') { $matches[1].Trim() } else { 'unknown' }
  if ($src -match 'Local CMOS|Free-running') { Add-Finding 'LOG-04' 'fail' "Time source: $src (not synchronized)" 'Synced within 5 min'; return }
  $off = $null
  try { $sc = (w32tm /stripchart /computer:time.windows.com /samples:1 /dataonly 2>$null) -join "`n"; if ($sc -match ',\s*([+-]?\d+\.\d+)s') { $off = [math]::Abs([double]$matches[1]) } } catch {}
  if ($null -ne $off -and $off -gt 300) { Add-Finding 'LOG-04' 'fail' "Clock offset $([math]::Round($off))s from reference (source $src)" 'Synced within 5 min' }
  else { Add-Finding 'LOG-04' 'pass' "Source $src$(if($null -ne $off){"; offset $([math]::Round($off,2))s"})" 'Synced within 5 min' }
}
Invoke-Check 'LOG-05' {
  $edr = @{ Sense='Microsoft Defender for Endpoint'; CSFalconService='CrowdStrike Falcon'; SentinelAgent='SentinelOne'; HuntressAgent='Huntress'; 'Sophos MCS Client'='Sophos Central'; 'Elastic Agent'='Elastic Agent'; SplunkForwarder='Splunk UF'; WazuhSvc='Wazuh'; AzureMonitorAgent='Azure Monitor Agent'; HealthService='MMA/Log Analytics'; BlackpointSnap='Blackpoint SNAP'; CylanceSvc='Cylance'; 'ESET Service'='ESET'; 'Rapid7 Insight Agent'='Rapid7'; 'Arctic Wolf Agent'='Arctic Wolf'; 'ThreatLocker Service'='ThreatLocker' }
  $rmm = @{ NinjaRMMAgent='NinjaOne'; 'Datto RMM'='Datto RMM'; CagService='Datto RMM'; 'ScreenConnect Client'='ConnectWise'; ITSPlatform='ConnectWise RMM'; 'Advanced Monitoring Agent'='N-able'; 'Kaseya Agent'='Kaseya'; 'Atera'='Atera'; 'SyncroLive'='Syncro'; 'LTService'='ConnectWise Automate' }
  $found = @(); $foundRmm = @()
  foreach ($s in Get-Service -ErrorAction SilentlyContinue) { foreach ($k in $edr.Keys) { if ($s.Name -like "$k*" -and $s.Status -eq 'Running') { $found += $edr[$k] } }; foreach ($k in $rmm.Keys) { if ($s.Name -like "$k*" -and $s.Status -eq 'Running') { $foundRmm += $rmm[$k] } } }
  $wef = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\EventLog\EventForwarding\SubscriptionManager' '1'
  if ($wef) { $found += 'Windows Event Forwarding' }
  $found = @($found | Sort-Object -Unique); $foundRmm = @($foundRmm | Sort-Object -Unique)
  if ($found.Count -gt 0) { Add-Finding 'LOG-05' 'pass' "Central logging/EDR: $($found -join ', ')$(if($foundRmm){" (RMM: $($foundRmm -join ', '))"})" 'EDR/SIEM/WEF present' }
  elseif ($foundRmm.Count -gt 0) { Add-Finding 'LOG-05' 'warn' "RMM only ($($foundRmm -join ', ')) - no EDR/SIEM/WEF detected" 'EDR/SIEM/WEF present' }
  else { Add-Finding 'LOG-05' 'fail' 'No log forwarding, EDR, or RMM agent detected' 'EDR/SIEM/WEF present' }
}

# ================================================================== SYSTEM HARDENING
Invoke-Check 'HARD-01' {
  $k = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer'
  $ndt = Get-Reg $k 'NoDriveTypeAutoRun'; $na = Get-Reg $k 'NoAutorun'
  if ($ndt -eq 255 -and $na -eq 1) { Add-Finding 'HARD-01' 'pass' 'AutoRun disabled for all drives' 'Disabled' } elseif ($ndt -eq 255 -or $na -eq 1) { Add-Finding 'HARD-01' 'warn' "Partial: NoDriveTypeAutoRun=$ndt NoAutorun=$na" 'Disabled' } else { Add-Finding 'HARD-01' 'fail' "AutoRun not disabled (NoDriveTypeAutoRun=$ndt NoAutorun=$na)" 'Disabled' }
}
Invoke-Check 'HARD-02' {
  $k = 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa'
  $ra = Get-Reg $k 'RestrictAnonymous'; $rs = Get-Reg $k 'RestrictAnonymousSAM'; $ea = Get-Reg $k 'EveryoneIncludesAnonymous'
  if ($ra -ge 1 -and $rs -eq 1 -and ($ea -eq 0 -or $null -eq $ea)) { Add-Finding 'HARD-02' 'pass' "RestrictAnonymous=$ra SAM=$rs Everyone=$ea" 'Restricted' } else { Add-Finding 'HARD-02' 'fail' "RestrictAnonymous=$ra SAM=$rs EveryoneIncludesAnonymous=$ea" 'Restricted' }
}
Invoke-Check 'HARD-03' {
  $k = 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa'
  $nolm = Get-Reg $k 'NoLMHash'; $lvl = Get-Reg $k 'LmCompatibilityLevel'
  if (($nolm -eq 1 -or $null -eq $nolm) -and $lvl -ge 5) { Add-Finding 'HARD-03' 'pass' "NoLMHash=$nolm LmCompatibilityLevel=$lvl" 'NoLMHash=1, level 5' }
  elseif ($nolm -eq 1 -or $null -eq $nolm) { Add-Finding 'HARD-03' 'warn' "LM hash off; LmCompatibilityLevel=$lvl (default 3 permits NTLMv1 responses)" 'Level 5' }
  else { Add-Finding 'HARD-03' 'fail' "NoLMHash=$nolm LmCompatibilityLevel=$lvl" 'NoLMHash=1, level 5' }
}
Invoke-Check 'HARD-04' {
  $v = Get-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest' 'UseLogonCredential'
  if ($v -eq 1) { Add-Finding 'HARD-04' 'fail' 'WDigest UseLogonCredential=1 (plaintext creds in LSASS)' '0' } else { Add-Finding 'HARD-04' 'pass' "WDigest UseLogonCredential=$(if($null -eq $v){'default(0)'}else{$v})" '0' }
}
Invoke-Check 'HARD-05' {
  $ppl = Get-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'RunAsPPL'
  $dg = Get-CimInstance -Namespace root/Microsoft/Windows/DeviceGuard -ClassName Win32_DeviceGuard -ErrorAction SilentlyContinue
  $cg = $dg -and (@($dg.SecurityServicesRunning) -contains 1)
  if ($ppl -ge 1 -and $cg) { Add-Finding 'HARD-05' 'pass' 'LSA protection on, Credential Guard running' 'Both' }
  elseif ($ppl -ge 1 -or $cg) { Add-Finding 'HARD-05' 'warn' "RunAsPPL=$ppl CredentialGuard=$cg" 'Both' }
  else { Add-Finding 'HARD-05' 'fail' 'Neither LSA protection nor Credential Guard enabled' 'Both' }
}
Invoke-Check 'HARD-06' {
  $f = Get-WindowsOptionalFeature -Online -FeatureName MicrosoftWindowsPowerShellV2 -ErrorAction SilentlyContinue
  if (-not $f -or $f.State -ne 'Enabled') { Add-Finding 'HARD-06' 'pass' "PowerShell 2.0 engine: $(if($f){$f.State}else{'not present'})" 'Removed' } else { Add-Finding 'HARD-06' 'fail' 'PowerShell 2.0 engine enabled' 'Removed' }
}
Invoke-Check 'HARD-07' {
  $p = $OS.DataExecutionPrevention_SupportPolicy
  if ($p -in 1,3) { Add-Finding 'HARD-07' 'pass' "DEP policy $p ($(if($p -eq 1){'AlwaysOn'}else{'OptOut'}))" 'OptOut/AlwaysOn' } else { Add-Finding 'HARD-07' 'fail' "DEP policy $p" 'OptOut/AlwaysOn' }
}
Invoke-Check 'HARD-08' {
  $svcs = @(Get-CimInstance Win32_Service | Where-Object { $_.PathName -and $_.PathName -notmatch '^"' -and $_.PathName -notmatch '^[A-Za-z]:\\Windows\\' -and ($_.PathName -split '\.exe')[0] -match ' ' } | Select-Object Name,PathName)
  if ($svcs.Count -eq 0) { Add-Finding 'HARD-08' 'pass' 'No unquoted service paths' 'None' } else { Add-Finding 'HARD-08' 'warn' "Unquoted paths: $(($svcs | ForEach-Object Name) -join ', ')" 'None' $svcs }
}
Invoke-Check 'HARD-09' {
  if ($JoinType -notin 'domain','hybrid') { Add-Finding 'HARD-09' 'na' 'Not AD-joined'; return }
  $c = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' 'CachedLogonsCount'
  if ($null -eq $c) { $c = 10 }
  if ([int]$c -le 4) { Add-Finding 'HARD-09' 'pass' "CachedLogonsCount=$c" '<= 4' } else { Add-Finding 'HARD-09' 'warn' "CachedLogonsCount=$c" '<= 4' }
}
Invoke-Check 'HARD-10' {
  $t = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' 'legalnoticetext'
  if ($t -and $t.Trim().Length -gt 10) { Add-Finding 'HARD-10' 'pass' 'Logon banner configured' 'Configured' } else { Add-Finding 'HARD-10' 'fail' 'No logon banner' 'Configured' }
}
Invoke-Check 'HARD-11' {
  $w = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows Script Host\Settings' 'Enabled'
  if ($w -eq 0) { Add-Finding 'HARD-11' 'pass' 'Windows Script Host disabled' 'Disabled' } else { Add-Finding 'HARD-11' 'warn' 'Windows Script Host enabled (default)' 'Disabled' }
}

# ================================================================== DATA PROTECTION
Invoke-Check 'DATA-02' {
  $hits = @($Software | Where-Object { $_.name -match '^Dropbox|Google Drive|iCloud|^Box$|Box Drive|MEGAsync|pCloud|Sync\.com|Tresorit|Mediafire|Icedrive' } | ForEach-Object name)
  foreach ($h in (Get-ChildItem Registry::HKEY_USERS -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'S-1-5-21-\d+-\d+-\d+-\d+$' })) {
    if (Test-Path "Registry::$($h.Name)\Software\Microsoft\OneDrive\Accounts\Personal") { $hits += 'OneDrive (personal account)' }
  }
  $hits = @($hits | Sort-Object -Unique)
  if ($hits.Count -eq 0) { Add-Finding 'DATA-02' 'pass' 'No personal cloud-sync clients' 'None' } else { Add-Finding 'DATA-02' 'warn' "Sync clients: $($hits -join ', ')" 'None' $hits }
}
Invoke-Check 'DATA-03' {
  $e = Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'PasswordManagerEnabled'; $c = Get-Reg 'HKLM:\SOFTWARE\Policies\Google\Chrome' 'PasswordManagerEnabled'
  $chrome = $Software | Where-Object name -match '^Google Chrome'
  if ($e -eq 0 -and ($c -eq 0 -or -not $chrome)) { Add-Finding 'DATA-03' 'pass' 'Browser password managers disabled by policy' 'Disabled' } else { Add-Finding 'DATA-03' 'warn' "Edge policy=$e Chrome policy=$c" 'Disabled' }
}
Invoke-Check 'DATA-04' {
  $agents = @{ VeeamEndpointBackupSvc='Veeam Agent'; 'Datto'='Datto'; 'AcronisCyberProtectionService'='Acronis'; 'AcrSch2Svc'='Acronis'; bzserv='Backblaze'; CarboniteService='Carbonite'; 'Code42Service'='CrashPlan'; BackupFP='N-able Cove'; 'Axcient'='Axcient'; 'CBBackupService'='MSP360'; 'ShadowProtectSvc'='ShadowProtect'; 'MacriumService'='Macrium'; 'DattoSIRIS'='Datto SIRIS'; 'Druva'='Druva'; 'SpiderOak'='SpiderOak' }
  $found = @(); foreach ($s in Get-Service -ErrorAction SilentlyContinue) { foreach ($k in $agents.Keys) { if ($s.Name -like "$k*" -or $s.DisplayName -like "*$k*") { $found += $agents[$k] } } }
  $kfm = $false
  foreach ($h in (Get-ChildItem Registry::HKEY_USERS -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'S-1-5-21-\d+-\d+-\d+-\d+$' })) {
    $v = Get-Reg "Registry::$($h.Name)\Software\Microsoft\OneDrive\Accounts\Business1" 'KfmFoldersProtectedNow'; if ($v) { $kfm = $true }
  }
  $found = @($found | Sort-Object -Unique)
  if ($found.Count -gt 0) { Add-Finding 'DATA-04' 'pass' "Backup agent: $($found -join ', ')$(if($kfm){' + OneDrive KFM'})" 'Managed backup present' }
  elseif ($kfm) { Add-Finding 'DATA-04' 'warn' 'OneDrive Known Folder Move only (Desktop/Documents/Pictures) - no image/agent backup' 'Managed backup present' }
  else { Add-Finding 'DATA-04' 'fail' 'No endpoint backup agent or OneDrive KFM detected' 'Managed backup present' }
}

# ================================================================== PHI / CHD DISCOVERY (DATA-01)
# Reports ONLY: file name, full path, size, modified date, owner, and which pattern types matched
# with their hit counts. NO fragment of file content is ever captured, not even masked or truncated -
# there is deliberately no sample field. Note that a file PATH can itself contain a patient name, so
# these findings are still confidential client data even though they carry no record content.
function Test-Luhn([string]$n) { $d = ($n -replace '\D',''); if ($d.Length -lt 13) { return $false }; $sum=0; $alt=$false; for ($i=$d.Length-1; $i -ge 0; $i--) { $x=[int][string]$d[$i]; if ($alt) { $x*=2; if ($x -gt 9) { $x-=9 } }; $sum+=$x; $alt=-not $alt }; return ($sum % 10) -eq 0 }
$RxTimeout = [TimeSpan]::FromSeconds(5)
$PhiPatterns = [ordered]@{
  SSN       = New-Object regex('\b(?!000|666|9\d\d)\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b', 'None', $RxTimeout)
  PAN       = New-Object regex('\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))(?:[ -]?\d{4}){2}[ -]?\d{1,4}\b', 'None', $RxTimeout)
  MRN       = New-Object regex('\b(?:MRN|Medical\s+Record\s+(?:No|Number|#)|Patient\s+ID|Chart\s*#)\s*[:#]?\s*[A-Z]?\d{5,12}\b', 'IgnoreCase', $RxTimeout)
  MedicareMBI = New-Object regex('\b[1-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d[AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d[AC-HJKMNP-RT-Y]{2}\d{2}\b', 'None', $RxTimeout)
  NPI       = New-Object regex('\bNPI\s*[:#]?\s*\d{10}\b', 'IgnoreCase', $RxTimeout)
  DOB       = New-Object regex('\b(?:DOB|Date\s+of\s+Birth|Birth\s*date)\s*[:#]?\s*\d{1,2}[/.-]\d{1,2}[/.-](?:\d{2}|\d{4})\b', 'IgnoreCase', $RxTimeout)
  ICD10     = New-Object regex('\b(?:ICD[- ]?10|Dx|Diagnosis(?:\s+Code)?)\s*[:#]?\s*[A-TV-Z]\d{2}(?:\.\d{1,4})?\b', 'IgnoreCase', $RxTimeout)
  InsuranceID = New-Object regex('\b(?:Member|Subscriber|Policy|Group)\s*(?:ID|No|Number|#)\s*[:#]?\s*[A-Z0-9]{6,15}\b', 'IgnoreCase', $RxTimeout)
  CVV       = New-Object regex('\b(?:CVV2?|CVC2?|CID|security\s+code)\s*[:#]?\s*\d{3,4}\b', 'IgnoreCase', $RxTimeout)
  Credential = New-Object regex('(?:password|passwd|pwd)\s*[:=]\s*\S{4,}', 'IgnoreCase', $RxTimeout)
}
$ClinicalTerms = New-Object regex('\b(patient|diagnos\w*|prescri\w*|medication|treatment\s+plan|lab\s+result|discharge|clinical|physician|provider\s+notes|allerg\w*|immuniz\w*|radiolog\w*|pathology|HIPAA|insurance\s+claim|EOB|explanation\s+of\s+benefits|copay|procedure\s+code|CPT)\b', 'IgnoreCase', $RxTimeout)
$IdentifierTypes = @('SSN','PAN','MRN','MedicareMBI','CVV')
$TextExt = @('.txt','.csv','.log','.json','.xml','.rtf','.eml','.html','.htm','.md','.ini','.sql','.tsv','.vcf')
$OfficeExt = @('.docx','.xlsx','.pptx','.docm','.xlsm')
$OtherExt = @('.pdf','.msg','.doc','.xls')
$AllExt = $TextExt + $OfficeExt + $OtherExt
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem -ErrorAction SilentlyContinue

function Get-FileText([System.IO.FileInfo]$f) {
  $ext = $f.Extension.ToLower()
  try {
    if ($TextExt -contains $ext) { return [System.IO.File]::ReadAllText($f.FullName) }
    if ($OfficeExt -contains $ext) {
      $sb = New-Object System.Text.StringBuilder
      $z = [System.IO.Compression.ZipFile]::OpenRead($f.FullName)
      try { foreach ($e in $z.Entries) { if ($e.FullName -match '^(word/(document|header\d*|footer\d*|comments)\.xml|xl/sharedStrings\.xml|xl/worksheets/sheet\d+\.xml|ppt/slides/slide\d+\.xml)$') { $sr = New-Object System.IO.StreamReader($e.Open()); $x = $sr.ReadToEnd(); $sr.Dispose(); [void]$sb.Append(($x -replace '<[^>]+>',' ')).Append("`n") } } } finally { $z.Dispose() }
      return $sb.ToString()
    }
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    if ($ext -eq '.pdf') {
      $latin = [System.Text.Encoding]::GetEncoding(28591).GetString($bytes)
      $sb = New-Object System.Text.StringBuilder
      foreach ($m in [regex]::Matches($latin, '(?s)(<<.*?>>)\s*stream\r?\n(.*?)endstream')) {
        $dict = $m.Groups[1].Value; $data = $m.Groups[2].Value
        if ($dict -match 'FlateDecode') {
          try { $raw = [System.Text.Encoding]::GetEncoding(28591).GetBytes($data); $ms = New-Object System.IO.MemoryStream(,$raw); $ms.Position = 2; $ds = New-Object System.IO.Compression.DeflateStream($ms, [System.IO.Compression.CompressionMode]::Decompress); $out = New-Object System.IO.MemoryStream; $ds.CopyTo($out); $data = [System.Text.Encoding]::GetEncoding(28591).GetString($out.ToArray()) } catch { continue }
        }
        foreach ($t in [regex]::Matches($data, '\(((?:\\.|[^\\)]){1,500})\)')) { [void]$sb.Append(($t.Groups[1].Value -replace '\\([()\\])','$1')).Append(' ') }
        [void]$sb.Append("`n")
      }
      return $sb.ToString()
    }
    # .msg/.doc/.xls (OLE) - scan both ANSI and UTF-16 interpretations of the raw bytes
    return ([System.Text.Encoding]::GetEncoding(28591).GetString($bytes) + "`n" + [System.Text.Encoding]::Unicode.GetString($bytes))
  } catch { return $null }
}

$PhiResults = New-Object System.Collections.Generic.List[object]
$PhiStats = [ordered]@{ scannedFiles=0; skippedLarge=0; unreadable=0; flaggedFiles=0; identifierFiles=0; mailArchives=@(); timedOut=$false; roots=@() }
if (-not $SkipPhiScan) {
  $deadline = (Get-Date).AddMinutes($PhiTimeBudgetMinutes)
  $roots = @()
  foreach ($u in (Get-ChildItem 'C:\Users' -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin 'Public','Default','Default User','All Users' })) { $roots += $u.FullName }
  $roots += 'C:\Users\Public'
  foreach ($d in (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -ne 'C' -and $_.Used -gt 0 })) { $roots += $d.Root }
  foreach ($p in @('C:\Temp','C:\Shared','C:\Share','C:\Data','C:\Scans','C:\Fax','C:\inetpub\wwwroot') + $PhiExtraPaths) { if (Test-Path $p) { $roots += $p } }
  $roots = @($roots | Sort-Object -Unique); $PhiStats.roots = $roots
  Write-Log "PHI discovery: scanning $($roots.Count) root(s), budget $PhiTimeBudgetMinutes min"
  $excludeDir = New-Object regex('\\AppData\\(Local\\(Microsoft|Google|Packages|Temp\\[^\\]*\\cache|Mozilla|NVIDIA|Adobe\\Common)|LocalLow|Roaming\\(Microsoft\\(Windows|Teams|Office\\16)|Adobe|Mozilla|Code))|\\node_modules\\|\\\.git\\|\\Windows\\|\\Program Files|\\\$Recycle\.Bin|\\System Volume Information', 'IgnoreCase')
  foreach ($root in $roots) {
    if ((Get-Date) -gt $deadline) { $PhiStats.timedOut = $true; break }
    $files = $null
    try { $files = Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { -not $excludeDir.IsMatch($_.DirectoryName) } } catch { continue }
    foreach ($f in $files) {
      if ((Get-Date) -gt $deadline) { $PhiStats.timedOut = $true; break }
      $ext = $f.Extension.ToLower()
      if ($ext -in '.pst','.ost') { $PhiStats.mailArchives += [pscustomobject]@{ path=$f.FullName; sizeMB=[math]::Round($f.Length/1MB) }; continue }
      if ($AllExt -notcontains $ext) { continue }
      if ($f.Length -gt ($PhiMaxFileMB * 1MB)) { $PhiStats.skippedLarge++; continue }
      if ($f.Length -eq 0) { continue }
      $PhiStats.scannedFiles++
      $text = Get-FileText $f
      if ($null -eq $text) { $PhiStats.unreadable++; continue }
      if ($text.Length -lt 8) { continue }
      $hits = [ordered]@{}; $identifier = $false
      foreach ($name in $PhiPatterns.Keys) {
        try {
          $ms = $PhiPatterns[$name].Matches($text)
          $count = 0
          foreach ($m in $ms) {
            if ($name -eq 'PAN' -and -not (Test-Luhn $m.Value)) { continue }
            $count++
            if ($count -ge 500) { break }
          }
          if ($count -gt 0) { $hits[$name] = $count; if ($IdentifierTypes -contains $name) { $identifier = $true } }
        } catch [System.Text.RegularExpressions.RegexMatchTimeoutException] { $hits["$name(timeout)"] = -1 } catch { }
      }
      $clinical = 0; try { $clinical = @($ClinicalTerms.Matches($text) | ForEach-Object { $_.Value.ToLower() } | Sort-Object -Unique).Count } catch {}
      $flag = $identifier -or ($hits.Count -gt 0 -and $clinical -ge 2) -or ($clinical -ge 6)
      if (-not $flag) { continue }
      $owner = ''; try { $owner = (Get-Acl -LiteralPath $f.FullName -ErrorAction Stop).Owner } catch {}
      $PhiResults.Add([pscustomobject]@{ name=$f.Name; path=$f.FullName; ext=$ext; sizeKB=[math]::Round($f.Length/1KB); modified=$f.LastWriteTime.ToString('o'); owner=$owner; hits=$hits; clinicalTerms=$clinical; identifier=$identifier })
      $PhiStats.flaggedFiles++; if ($identifier) { $PhiStats.identifierFiles++ }
      if ($PhiResults.Count -ge $PhiMaxFlaggedFiles) { Write-Log "PHI discovery: flagged-file cap ($PhiMaxFlaggedFiles) reached" 'WARN'; break }
    }
    if ($PhiResults.Count -ge $PhiMaxFlaggedFiles) { break }
  }
  Save-Evidence 'phi-discovery.json' @{ stats=$PhiStats; files=$PhiResults } @('DATA-01')
  Invoke-Check 'DATA-01' {
    $summary = "$($PhiStats.scannedFiles) files scanned; $($PhiStats.identifierFiles) with direct identifiers (SSN/PAN/MRN/MBI/CVV), $($PhiStats.flaggedFiles - $PhiStats.identifierFiles) with probable clinical/insurance content; $($PhiStats.mailArchives.Count) mail archive(s)$(if($PhiStats.timedOut){' - TIME BUDGET EXHAUSTED, partial'})"
    $encrypted = ($BL | Where-Object { $_.MountPoint -eq $env:SystemDrive }).ProtectionStatus -eq 'On'
    if ($PhiStats.identifierFiles -gt 0) { Add-Finding 'DATA-01' 'fail' $summary 'No PHI/CHD outside controlled systems' @{ stats=$PhiStats; top=($PhiResults | Where-Object identifier | Select-Object -First 50) } }
    elseif ($PhiStats.flaggedFiles -gt 0 -or $PhiStats.mailArchives.Count -gt 0) { Add-Finding 'DATA-01' 'warn' $summary 'No PHI/CHD outside controlled systems' @{ stats=$PhiStats; top=($PhiResults | Select-Object -First 50) } }
    else { Add-Finding 'DATA-01' 'pass' "$summary$(if(-not $encrypted){' (disk NOT encrypted)'})" 'No PHI/CHD outside controlled systems' @{ stats=$PhiStats } }
  }
} else { Add-Finding 'DATA-01' 'na' 'PHI discovery skipped (-SkipPhiScan)' }

# ================================================================== PACKAGE & UPLOAD
$ScanEnd = Get-Date
$Summary = @{ pass=@($Findings | Where-Object status -eq 'pass').Count; fail=@($Findings | Where-Object status -eq 'fail').Count; warn=@($Findings | Where-Object status -eq 'warn').Count; error=@($Findings | Where-Object status -eq 'error').Count; na=@($Findings | Where-Object status -eq 'na').Count }
$Inventory = @{
  software = $Software
  shares = @(Get-SmbShare -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '\$$' } | Select-Object Name,Path,Description)
  adapters = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4Address } | ForEach-Object { [pscustomobject]@{ name=$_.InterfaceAlias; ipv4=($_.IPv4Address.IPAddress -join ','); gateway=($_.IPv4DefaultGateway.NextHop -join ','); dns=($_.DNSServer.ServerAddresses -join ',') } })
  localUsers = @($LocalUsers | Select-Object Name,Enabled,@{n='lastLogon';e={if($_.LastLogon){$_.LastLogon.ToString('o')}}})
  localAdmins = @($Admins | ForEach-Object Name)
}
$Payload = [ordered]@{
  runId=$RunId; agentVersion=$AgentVersion; catalogVersion=$CatalogVersion
  client=@{ name=$ClientName; email=$ClientEmail }
  device=$Device
  startedAt=$ScanStart.ToString('o'); finishedAt=$ScanEnd.ToString('o'); ranAsAdmin=$IsAdmin
  summary=$Summary; findings=$Findings; inventory=$Inventory; evidenceManifest=$EvidenceManifest
}
$JsonPath = Join-Path $OutputDir "scan-$env:COMPUTERNAME-$($ScanStart.ToString('yyyyMMdd-HHmmss')).json"
$Payload | ConvertTo-Json -Depth 8 | Set-Content -Path $JsonPath -Encoding UTF8
Save-Evidence 'manifest.json' $EvidenceManifest @()
$ZipPath = Join-Path $OutputDir "evidence-$env:COMPUTERNAME-$($ScanStart.ToString('yyyyMMdd-HHmmss')).zip"
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($EvidenceDir, $ZipPath)
Remove-Item $EvidenceDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host ("TEKNIK Compliance Scan complete - {0} pass / {1} fail / {2} warn / {3} error / {4} n/a in {5:n0}s" -f $Summary.pass,$Summary.fail,$Summary.warn,$Summary.error,$Summary.na,($ScanEnd-$ScanStart).TotalSeconds) -ForegroundColor Cyan
Write-Host "Results: $JsonPath`nEvidence: $ZipPath"

if ($NoUpload) { Write-Log 'Upload skipped (-NoUpload)'; exit 0 }
try {
  $headers = @{ 'X-Agent-Key' = $AgentKey; 'X-Agent-Version' = $AgentVersion; 'Content-Type' = 'application/json; charset=utf-8' }
  $body = [System.Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Depth 8 -Compress))
  $resp = Invoke-RestMethod -Method Post -Uri "$ApiBase/agent-ingest" -Headers $headers -Body $body -TimeoutSec 120
  Write-Log "Uploaded scan: scanId=$($resp.scanId) device=$($resp.deviceId) org=$($resp.orgId)"
  $zipBytes = [System.IO.File]::ReadAllBytes($ZipPath)
  if ($zipBytes.Length -gt 4MB) { Write-Log "Evidence zip is $([math]::Round($zipBytes.Length/1MB,1)) MB - exceeds 4 MB function limit; kept locally only" 'WARN' }
  else {
    $ev = @{ scanId=$resp.scanId; filename=(Split-Path $ZipPath -Leaf); contentType='application/zip'; controls=@($EvidenceManifest | ForEach-Object { $_.controls } | Sort-Object -Unique); description="Agent-collected evidence bundle ($($EvidenceManifest.Count) artifacts)"; dataBase64=[Convert]::ToBase64String($zipBytes) } | ConvertTo-Json -Compress
    $r2 = Invoke-RestMethod -Method Post -Uri "$ApiBase/agent-evidence" -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($ev)) -TimeoutSec 120
    Write-Log "Uploaded evidence bundle: $($r2.evidenceId)"
  }
  if ($resp.portalUrl) { Write-Host "Client portal: $($resp.portalUrl)" -ForegroundColor Green }
} catch {
  Write-Log "Upload failed: $($_.Exception.Message). Results retained at $JsonPath" 'FAIL'
  if ($_.ErrorDetails.Message) { Write-Log $_.ErrorDetails.Message 'FAIL' }
  exit 3
}
exit 0
