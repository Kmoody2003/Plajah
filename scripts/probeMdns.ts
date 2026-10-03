import dgram from 'node:dgram';

// Construct standard DNS query for _matterc._udp.local and _services._dns-sd._udp.local
function buildDnsQuery(name: string): Buffer {
  const parts = name.split('.');
  const qnameParts: Buffer[] = [];
  for (const part of parts) {
    const len = Buffer.from([part.length]);
    const str = Buffer.from(part, 'utf8');
    qnameParts.push(len, str);
  }
  qnameParts.push(Buffer.from([0])); // null terminator

  const header = Buffer.from([
    0x00, 0x00, // ID = 0
    0x00, 0x00, // Flags: Standard query
    0x00, 0x01, // Questions: 1
    0x00, 0x00, // Answer RRs: 0
    0x00, 0x00, // Authority RRs: 0
    0x00, 0x00  // Additional RRs: 0
  ]);

  const qtypeAndClass = Buffer.from([
    0x00, 0x0c, // Type: PTR (12)
    0x00, 0x01  // Class: IN (1)
  ]);

  return Buffer.concat([header, ...qnameParts, qtypeAndClass]);
}

const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
const seen = new Set<string>();

socket.on('message', (msg, rinfo) => {
  const text = msg.toString('utf8');
  console.log(`[Packet In] ${rinfo.address}:${rinfo.port} (${msg.length} bytes):`);
  const lines = text.split('\r\n').filter(Boolean).slice(0, 5);
  console.log(lines.join(' | '));
});

// Test ephemeral port binding for mDNS and SSDP
socket.bind(0, '10.0.0.30', () => {
  try {
    socket.setBroadcast(true);
    socket.setMulticastInterface('10.0.0.30');
  } catch (err: any) {
    console.log('Socket config info:', err.message);
  }
  const localPort = socket.address().port;
  console.log(`[Discovery Probe] Bound to 10.0.0.30:${localPort}...`);

  // SSDP M-SEARCH
  const ssdp = Buffer.from(
    'M-SEARCH * HTTP/1.1\r\n' +
    'HOST: 239.255.255.250:1900\r\n' +
    'MAN: "ssdp:discover"\r\n' +
    'MX: 3\r\n' +
    'ST: ssdp:all\r\n\r\n'
  );
  socket.send(ssdp, 0, ssdp.length, 1900, '239.255.255.250');

  // Also query mDNS 5353
  const services = [
    '_matterc._udp.local',
    '_matter._tcp.local',
    '_googlecast._tcp.local',
    '_airplay._tcp.local',
    '_services._dns-sd._udp.local'
  ];
  for (const s of services) {
    const q = buildDnsQuery(s);
    socket.send(q, 0, q.length, 5353, '224.0.0.251');
  }

  for (const s of services) {
    const q = buildDnsQuery(s);
    socket.send(q, 0, q.length, 5353, '224.0.0.251');
  }

  setTimeout(() => {
    console.log(`[mDNS Probe] Finished. Found ${seen.size} unique service announcements.`);
    socket.close();
    process.exit(0);
  }, 4000);
});
