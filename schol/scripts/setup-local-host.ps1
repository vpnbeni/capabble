# Adds schol.capabble -> 127.0.0.1 to the Windows hosts file (run as Administrator).
# Alternative: use http://schol.capabble.localhost:5175 without this script.

$entry = '127.0.0.1 schol.capabble'
$hostsPath = "$env:Windir\System32\drivers\etc\hosts"
$hosts = Get-Content $hostsPath -Raw

if ($hosts -match '(?m)^\s*127\.0\.0\.1\s+schol\.capabble\s*$') {
  Write-Host 'schol.capabble is already mapped to 127.0.0.1 in hosts.'
  exit 0
}

Add-Content -Path $hostsPath -Value "`n$entry"
Write-Host "Added: $entry"
Write-Host 'Open SCHOL at http://schol.capabble:5175'
