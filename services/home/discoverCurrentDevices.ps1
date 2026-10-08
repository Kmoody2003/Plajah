# Plajah Home - Live Real-Time Network & Matter Device Discovery
# Scans ONLY the CURRENT active network interface and subnet
# Strictly ignores phantom / historical devices from past networks (CM_PROB_PHANTOM)

$ErrorActionPreference = 'SilentlyContinue'
$results = @()

# 1. Determine active interface, gateway, and SSID
$activeRoute = Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object -First 1
$activeIfIndex = $activeRoute.InterfaceIndex
$gatewayIp = $activeRoute.NextHop

$netIp = Get-NetIPAddress -InterfaceIndex $activeIfIndex -AddressFamily IPv4 | Select-Object -First 1
$localIp = $netIp.IPAddress

$wlanLines = (netsh wlan show interfaces) | Where-Object { $_ -match '^\s+SSID\s*:\s*(.+)$' }
$ssid = if ($wlanLines -and $wlanLines -match ':\s*(.+)$') { $matches[1].Trim() } else { 'Wi-Fi Network' }

# Host Machine Node (Local PC running Plajah)
$hostMachineName = $env:COMPUTERNAME
$results += [PSCustomObject]@{
  Name = $hostMachineName + ' - Workstation'
  Status = 'OK'
  Class = 'Workstation'
  InstanceId = 'local-' + $hostMachineName
  Ip = $localIp
  Network = $ssid
  Source = 'Local'
}

# 2. Physically connected and present devices ONLY (Present == True, Status == OK)
# Excludes any disconnected phantom devices from other locations
$pnp = Get-PnpDevice -Class Media, AudioEndpoint, Camera, Image, Printer, Bluetooth -PresentOnly -Status OK
foreach ($d in $pnp) {
  $name = $d.FriendlyName
  if ($name -and $name.Trim() -ne '' -and $name -notmatch 'Driver|Processing|Component|Configuration|Service|Enumerator|Profile|Generic Access|Attribute Service|NAP Service|Hands-Free|SPP Server|Object Push|Phonebook|InstantHotspot|NearbySharing|Mixed Reality|teVirtualMIDI|Oculus|Realtek\(R\) Audio') {
    $results += [PSCustomObject]@{
      Name = $name
      Status = $d.Status
      Class = $d.Class
      InstanceId = $d.InstanceId
      Source = 'PnP'
    }
  }
}

# 3. Active, currently reachable IP hosts on the local network
$arp = Get-NetNeighbor -InterfaceIndex $activeIfIndex -AddressFamily IPv4 | Where-Object { 
  $_.State -in @('Reachable', 'Permanent') -and 
  $_.IPAddress -notlike '224.*' -and 
  $_.IPAddress -notlike '239.*' -and 
  $_.IPAddress -notlike '*.255' -and
  $_.IPAddress -ne '0.0.0.0' -and
  $_.IPAddress -ne $localIp
}

foreach ($a in $arp) {
  $ip = $a.IPAddress
  $label = if ($ip -eq $gatewayIp) {
    'Wi-Fi Router Gateway - ' + $ssid
  } else {
    'Network Device - ' + $ip
  }

  $results += [PSCustomObject]@{
    Name = $label
    Status = $a.State
    Class = if ($ip -eq $gatewayIp) { 'Hub' } else { 'NetworkHost' }
    InstanceId = $ip
    Ip = $ip
    Mac = $a.LinkLayerAddress
    Network = $ssid
    Source = 'ARP'
  }
}

$results | ConvertTo-Json -Compress
