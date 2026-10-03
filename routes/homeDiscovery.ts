import { Router } from 'express';
import { exec } from 'node:child_process';
import util from 'node:util';
import path from 'node:path';
import { matterMdnsDiscovery, DiscoveredSmartDevice } from '../services/home/matterMdnsDiscovery';

const execAsync = util.promisify(exec);

export interface DiscoveredNetworkDevice {
  id: string;
  rawName: string;
  cleanName: string;
  vendor: string;
  model?: string;
  ip?: string;
  mac?: string;
  uri?: string;
  protocol: 'MATTER' | 'UPNP' | 'WIFI_DIRECT' | 'WSD' | 'LAN_IP' | 'BLUETOOTH' | 'HUE' | 'HAP' | 'AIRPLAY';
  deviceClass: 'TV' | 'SPEAKER' | 'CAMERA' | 'LIGHT' | 'HUB' | 'DISPLAY' | 'PRINTER' | 'MOBILE' | 'WORKSTATION' | 'SENSOR';
  status: 'ONLINE' | 'STANDBY' | 'AVAILABLE';
  lastSeen: string;
}

let cachedDevices: DiscoveredNetworkDevice[] = [];
let cachedSsid = 'Wi-Fi Network';
let lastScanTime = 0;

export const homeDiscoveryRouter = Router();

homeDiscoveryRouter.get('/api/home/discover', async (req, res) => {
  const force = req.query.force === 'true';
  const now = Date.now();

  // Return cached results if scanned within last 20 seconds and not forced
  if (!force && cachedDevices.length > 0 && now - lastScanTime < 20000) {
    return res.json({
      success: true,
      cached: true,
      timestamp: new Date(lastScanTime).toISOString(),
      networkInterface: cachedSsid,
      count: cachedDevices.length,
      devices: cachedDevices
    });
  }

  console.log('[HomeDiscovery] Live scan requested at', new Date().toISOString());

  try {
    const scriptPath = path.resolve(process.cwd(), 'services', 'home', 'discoverCurrentDevices.ps1');

    // Run PowerShell PnP/ARP scan and mDNS smart home scan concurrently
    const [psResult, mdnsResult] = await Promise.all([
      execAsync(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`,
        { timeout: 30000 }
      ).catch(e => {
        console.warn('[HomeDiscovery] PowerShell scan error:', e.message);
        return { stdout: '[]' };
      }),
      matterMdnsDiscovery.scan(2000).catch(e => {
        console.warn('[HomeDiscovery] mDNS scan error:', e.message);
        return { matterNodes: [], smartDevices: [] };
      })
    ]);

    let rawList: any[] = [];
    try {
      const parsed = JSON.parse(psResult.stdout.trim());
      rawList = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      rawList = [];
    }

    // Determine current live SSID
    const detectedSsid = rawList.find(i => i.Network)?.Network;
    if (detectedSsid) {
      cachedSsid = `Wi-Fi (${detectedSsid})`;
    }

    // Index mDNS smart devices by IP
    const mdnsByIp = new Map<string, DiscoveredSmartDevice>();
    for (const sm of mdnsResult.smartDevices) {
      mdnsByIp.set(sm.ip, sm);
    }

    const seenIds = new Set<string>();
    const devices: DiscoveredNetworkDevice[] = [];

    // 1. Process PnP and ARP devices, resolving against mDNS findings
    for (const item of rawList) {
      if (!item.Name) continue;
      let rawName = String(item.Name).trim();
      let vendor = 'Generic';
      let model: string | undefined = undefined;
      let deviceClass: DiscoveredNetworkDevice['deviceClass'] = 'DISPLAY';
      let protocol: DiscoveredNetworkDevice['protocol'] = 'LAN_IP';

      // If ARP found an IP that matches an mDNS smart device, enrich it!
      if (item.Ip && mdnsByIp.has(item.Ip)) {
        const sm = mdnsByIp.get(item.Ip)!;
        rawName = sm.name;
        vendor = sm.vendor;
        model = sm.model;
        deviceClass = sm.deviceClass;
        protocol = sm.protocol as any;
        mdnsByIp.delete(item.Ip); // Mark as consumed
      } else {
        if (/samsung/i.test(rawName)) vendor = 'Samsung';
        else if (/hp|officejet/i.test(rawName)) vendor = 'HP';
        else if (/razer/i.test(rawName)) vendor = 'Razer';
        else if (/apple/i.test(rawName)) vendor = 'Apple';
        else if (/sony/i.test(rawName)) vendor = 'Sony';
        else if (/google|nest/i.test(rawName)) vendor = 'Google';
        else if (/amazon|echo/i.test(rawName)) vendor = 'Amazon';
        else if (/native instruments|maschine|komplete/i.test(rawName)) vendor = 'Native Instruments';

        if (/router|gateway|hub/i.test(rawName) || item.Class === 'Hub') deviceClass = 'HUB';
        else if (/speaker|sound|audio/i.test(rawName)) deviceClass = 'SPEAKER';
        else if (/cam|camera/i.test(rawName)) deviceClass = 'CAMERA';
        else if (/light|lamp|strip|bulb/i.test(rawName)) deviceClass = 'LIGHT';
        else if (/printer|scanner|officejet/i.test(rawName)) deviceClass = 'PRINTER';
        else if (/ultra|phone|galaxy s/i.test(rawName)) deviceClass = 'MOBILE';
        else if (/workstation|host machine|maschine|komplete/i.test(rawName) || item.Class === 'Workstation') deviceClass = 'WORKSTATION';

        if (/bluetooth|bthenum|bthle/i.test(item.Class || '') || /bthenum|bthle/i.test(item.InstanceId || '')) protocol = 'BLUETOOTH';
        else if (/wsd/i.test(item.Class || '') || /wsd/i.test(item.InstanceId || '')) protocol = 'WSD';
        else if (/upnp/i.test(item.Class || '')) protocol = 'UPNP';
        else if (/wifi/i.test(item.Class || '')) protocol = 'WIFI_DIRECT';
      }

      const normKey = (item.Ip || rawName).toLowerCase();
      if (seenIds.has(normKey)) continue;
      seenIds.add(normKey);

      devices.push({
        id: `dev-${Buffer.from(item.Ip || rawName).toString('hex').slice(0, 10)}`,
        rawName,
        cleanName: rawName.replace(/^\[.*?\]\s*/, '').replace(/#miracast/i, ''),
        vendor,
        model,
        ip: item.Ip,
        mac: item.Mac,
        protocol,
        deviceClass,
        status: item.Status === 'OK' || item.Status === 'Reachable' || item.Status === 5 ? 'ONLINE' : 'AVAILABLE',
        lastSeen: new Date().toISOString()
      });
    }

    // 2. Add any remaining mDNS smart devices that weren't in ARP
    for (const sm of mdnsByIp.values()) {
      const normKey = sm.ip.toLowerCase();
      if (seenIds.has(normKey)) continue;
      seenIds.add(normKey);

      devices.push({
        id: sm.id,
        rawName: sm.name,
        cleanName: sm.cleanName,
        vendor: sm.vendor,
        model: sm.model,
        ip: sm.ip,
        protocol: sm.protocol as any,
        deviceClass: sm.deviceClass,
        status: 'ONLINE',
        lastSeen: sm.lastSeen
      });
    }

    if (devices.length > 0) {
      cachedDevices = devices;
      lastScanTime = Date.now();
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      networkInterface: cachedSsid,
      count: devices.length,
      devices
    });
  } catch (error: any) {
    if (cachedDevices.length > 0) {
      return res.json({
        success: true,
        cached: true,
        fallback: true,
        timestamp: new Date(lastScanTime).toISOString(),
        networkInterface: cachedSsid,
        count: cachedDevices.length,
        devices: cachedDevices
      });
    }
    res.status(500).json({ success: false, error: error?.message || 'Discovery scan failed' });
  }
});
