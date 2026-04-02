#Requires -Version 5.1
<#!
.SYNOPSIS
  Interactive SMTP setup helper for EntraLogin.
.DESCRIPTION
  Helps you choose a free SMTP provider for testing, collects credentials,
  writes backend/.env SMTP keys, and optionally verifies with a test email.
.USAGE
  powershell -ExecutionPolicy Bypass -File .\setup-smtp.ps1
#>

[CmdletBinding()] param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n---- $msg ----" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "  [INFO] $msg" -ForegroundColor DarkCyan }
function Write-WarnMsg($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red; exit 1 }

function Ask([string]$Prompt, [string]$Default = '') {
  $hint = if ($Default) { " [$Default]" } else { '' }
  $raw = Read-Host "    > $Prompt$hint"
  if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
  return $raw.Trim()
}

function AskSecret([string]$Prompt) {
  $ss = Read-Host "    > $Prompt" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-OrDefault([hashtable]$Map, [string]$Key, [string]$Default = '') {
  if ($Map.ContainsKey($Key)) { return $Map[$Key] }
  return $Default
}

function Read-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }

  foreach ($line in Get-Content $Path) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.TrimStart().StartsWith('#')) { continue }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { continue }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1)
    $map[$key] = $val
  }
  return $map
}

function Set-OrAddEnvValue([System.Collections.Generic.List[string]]$Lines, [string]$Key, [string]$Value) {
  $prefix = "${Key}="
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    if ($Lines[$i].StartsWith($prefix)) {
      $Lines[$i] = "${Key}=$Value"
      return
    }
  }
  $Lines.Add("${Key}=$Value")
}

function Write-DotEnv([string]$Path, [hashtable]$Updates) {
  if (-not (Test-Path $Path)) {
    Write-Fail "backend/.env not found. Run deploy.ps1 first so base config exists."
  }

  $rawLines = [System.Collections.Generic.List[string]]::new()
  foreach ($line in Get-Content $Path) { $rawLines.Add($line) }

  foreach ($k in $Updates.Keys) {
    Set-OrAddEnvValue -Lines $rawLines -Key $k -Value ([string]$Updates[$k])
  }

  [System.IO.File]::WriteAllLines($Path, $rawLines, [System.Text.UTF8Encoding]::new($false))
}

function Test-SmtpWithNodemailer(
  [string]$BackendDir,
  [string]$SmtpHost,
  [string]$Port,
  [string]$Secure,
  [string]$User,
  [string]$Pass,
  [string]$FromName,
  [string]$FromAddress,
  [string]$ToAddress,
  [string]$Provider
) {
  $nodeScript = @'
const nodemailer = require('nodemailer');

(async () => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  await transporter.verify();
  const info = await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
    to: process.env.SMTP_TO,
    subject: `[EntraLogin] SMTP test via ${process.env.SMTP_PROVIDER}`,
    text: 'SMTP is configured correctly for EntraLogin.',
    html: '<b>SMTP is configured correctly for EntraLogin.</b>'
  });

  console.log('SMTP verify passed. Message accepted:', info.messageId || '(no messageId)');
})();
'@

  Push-Location $BackendDir
  try {
    $env:SMTP_HOST = $SmtpHost
    $env:SMTP_PORT = $Port
    $env:SMTP_SECURE = $Secure
    $env:SMTP_USER = $User
    $env:SMTP_PASS = $Pass
    $env:EMAIL_FROM_NAME = $FromName
    $env:EMAIL_FROM_ADDRESS = $FromAddress
    $env:SMTP_TO = $ToAddress
    $env:SMTP_PROVIDER = $Provider

    node -e $nodeScript
    return $true
  }
  catch {
    Write-WarnMsg "SMTP test failed: $($_.Exception.Message)"
    return $false
  }
  finally {
    Pop-Location
  }
}

$rootDir = $PSScriptRoot
$backendDir = Join-Path $rootDir 'backend'
$envPath = Join-Path $backendDir '.env'

Write-Step 'EntraLogin SMTP setup (free test providers)'

if (-not (Test-Path $backendDir)) {
  Write-Fail 'backend folder not found. Run this script from project root.'
}

if (-not (Test-Path $envPath)) {
  Write-Fail 'backend/.env not found. Run deploy.ps1 first.'
}

$current = Read-DotEnv -Path $envPath

Write-Host ''
Write-Host 'Pick a provider:' -ForegroundColor Yellow
Write-Host '  1) Mailtrap Sandbox (best for test apps, captures mails in inbox)'
Write-Host '  2) Brevo SMTP (free tier, can send to real inboxes after sender verification)'
Write-Host '  3) Gmail App Password (free, personal testing only)'
Write-Host '  4) Custom SMTP (manual)'
Write-Host ''
$choice = Ask 'Choose [1/2/3/4]' '1'

$providerName = ''
$smtpHost = ''
$smtpPort = ''
$smtpSecure = 'false'
$link1 = ''
$link2 = ''
$link3 = ''

switch ($choice) {
  '1' {
    $providerName = 'Mailtrap Sandbox'
    $smtpHost = 'sandbox.smtp.mailtrap.io'
    $smtpPort = '2525'
    $smtpSecure = 'false'
    $link1 = 'https://mailtrap.io/'
    $link2 = 'https://mailtrap.io/signin'
    $link3 = 'https://mailtrap.io/inboxes'
  }
  '2' {
    $providerName = 'Brevo SMTP'
    $smtpHost = 'smtp-relay.brevo.com'
    $smtpPort = '587'
    $smtpSecure = 'false'
    $link1 = 'https://www.brevo.com/'
    $link2 = 'https://app.brevo.com/'
    $link3 = 'https://help.brevo.com/hc/en-us/articles/209467485'
  }
  '3' {
    $providerName = 'Gmail App Password'
    $smtpHost = 'smtp.gmail.com'
    $smtpPort = '587'
    $smtpSecure = 'false'
    $link1 = 'https://myaccount.google.com/security'
    $link2 = 'https://support.google.com/mail/answer/185833'
    $link3 = 'https://support.google.com/accounts/answer/185833'
  }
  '4' {
    $providerName = 'Custom SMTP'
    $smtpHost = Ask 'SMTP host' (Get-OrDefault $current 'SMTP_HOST')
    $smtpPort = Ask 'SMTP port' (Get-OrDefault $current 'SMTP_PORT' '587')
    $smtpSecure = Ask 'SMTP secure true/false' (Get-OrDefault $current 'SMTP_SECURE' 'false')
  }
  default {
    Write-Fail 'Invalid choice.'
  }
}

Write-Step 'Provider setup links and instructions'
if ($choice -eq '1') {
  Write-Host 'Mailtrap Sandbox setup:'
  Write-Host "  1. Create free account: $link1"
  Write-Host "  2. Open your inbox list: $link3"
  Write-Host '  3. Create inbox -> Integrations -> SMTP credentials.'
  Write-Host '  4. Copy username and password from Mailtrap credentials.'
  Write-Host '  5. Use any recipient for test capture, or Mailtrap test inbox addresses.'
}
elseif ($choice -eq '2') {
  Write-Host 'Brevo setup:'
  Write-Host "  1. Create free account: $link1"
  Write-Host "  2. In app, go to SMTP & API -> SMTP: $link2"
  Write-Host '  3. Create SMTP key (password) and copy it once.'
  Write-Host "  4. Verify sender/domain first (required): $link3"
  Write-Host '  5. SMTP user is usually your Brevo login email.'
}
elseif ($choice -eq '3') {
  Write-Host 'Gmail setup:'
  Write-Host "  1. Turn on 2-Step Verification: $link1"
  Write-Host "  2. Create App Password (Mail): $link2"
  Write-Host '  3. Use Gmail address as SMTP_USER and app password as SMTP_PASS.'
  Write-Host '  4. For test-only usage; not recommended for production workloads.'
}
else {
  Write-Host 'Custom SMTP selected. Enter values from your provider docs.'
}

Write-Host ''
$smtpUser = Ask 'SMTP username' (Get-OrDefault $current 'SMTP_USER')
$smtpPass = AskSecret 'SMTP password / API key'

$defaultFromAddress = Get-OrDefault $current 'EMAIL_FROM_ADDRESS'
if ([string]::IsNullOrWhiteSpace($defaultFromAddress)) { $defaultFromAddress = 'noreply@localhost' }

$defaultFromName = Get-OrDefault $current 'EMAIL_FROM_NAME' 'EntraLogin'
$emailFromAddress = Ask 'From email address' $defaultFromAddress
$emailFromName = Ask 'From display name' $defaultFromName

if ($choice -ne '4') {
  $smtpHost = Ask 'SMTP host override (Enter to keep default)' $smtpHost
  $smtpPort = Ask 'SMTP port override (Enter to keep default)' $smtpPort
  $smtpSecure = Ask 'SMTP secure true/false' $smtpSecure
}

$backupPath = "$envPath.smtp.bak.$((Get-Date).ToString('yyyyMMddHHmmss'))"
Copy-Item $envPath $backupPath -Force
Write-Ok "Backup created: $backupPath"

$updates = @{
  SMTP_HOST = $smtpHost
  SMTP_PORT = $smtpPort
  SMTP_SECURE = $smtpSecure
  SMTP_USER = $smtpUser
  SMTP_PASS = $smtpPass
  EMAIL_FROM_NAME = $emailFromName
  EMAIL_FROM_ADDRESS = $emailFromAddress
}

Write-DotEnv -Path $envPath -Updates $updates
Write-Ok 'backend/.env SMTP values updated.'

Write-Host ''
$runTest = Ask 'Send test email now? [Y/n]' 'Y'
if ($runTest -match '^[Yy]') {
  $toDefault = $emailFromAddress
  $toAddress = Ask 'Recipient email for SMTP test' $toDefault

  $ok = Test-SmtpWithNodemailer `
    -BackendDir $backendDir `
    -SmtpHost $smtpHost `
    -Port $smtpPort `
    -Secure $smtpSecure `
    -User $smtpUser `
    -Pass $smtpPass `
    -FromName $emailFromName `
    -FromAddress $emailFromAddress `
    -ToAddress $toAddress `
    -Provider $providerName

  if ($ok) {
    Write-Ok 'SMTP test succeeded.'
  } else {
    Write-WarnMsg 'SMTP test did not pass. Credentials or sender verification may be missing.'
  }
}

$restartApi = Ask 'Restart entralogin-api service now? [Y/n]' 'Y'
if ($restartApi -match '^[Yy]') {
  $svc = Get-Service 'entralogin-api' -ErrorAction SilentlyContinue
  if ($null -eq $svc) {
    Write-WarnMsg 'Service entralogin-api not found. Skip restart.'
  }
  else {
    try {
      Restart-Service 'entralogin-api' -Force
      Write-Ok 'Service entralogin-api restarted.'
    }
    catch {
      Write-WarnMsg "Could not restart service automatically: $($_.Exception.Message)"
      Write-Host 'Run PowerShell as Administrator and execute: Restart-Service entralogin-api'
    }
  }
}

Write-Host ''
Write-Host 'SMTP setup complete.' -ForegroundColor Green
Write-Host "Provider used: $providerName"
Write-Host "SMTP host: $smtpHost"
Write-Host "SMTP port: $smtpPort"
Write-Host "SMTP secure: $smtpSecure"
Write-Host 'If OTP emails still fail, check C:\Logs\entralogin\err.log for SMTP errors.'
