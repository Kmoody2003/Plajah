// ─────────────────────────────────────────────────────────────────────────────
// Networks discipline data for Plajah Academia's science studios.
// Accuracy-first: every figure carries a real Wikipedia slug so portraits +
// biographies enrich live at runtime; every law is KaTeX-ready; every tool URL
// points at a real, free resource. Conforms to ScienceDisciplineData (./types).
// ─────────────────────────────────────────────────────────────────────────────
import type { ScienceDisciplineData } from './types';

const DATA: ScienceDisciplineData = {
  id: 'networks',
  label: 'Networks',
  icon: 'Network',
  accent: '#74C0FC',
  accent2: '#1C7ED6',
  tagline: 'How packets, protocols and routers connect every machine on Earth.',
  heroBlurb:
    'Computer networking is the science of moving information reliably between machines that share nothing but a wire or a radio wave. From packet switching and TCP/IP to routing, DNS and the modern Internet, learn the layered architecture, the pioneers who built it, and the mathematics of throughput, delay and congestion.',
  arXivCategory: 'cs.NI',
  arXivQuery: 'network protocol distributed system',
  simulators: [],

  figureHalls: [
    { id: 'origins', label: 'Origins', blurb: 'The theorists and builders of packet switching and the first wide-area networks.' },
    { id: 'internet', label: 'Internet Architecture', blurb: 'The architects of TCP/IP, routing and the protocols that stitched the networks into one Internet.' },
    { id: 'web-apps', label: 'Web & Applications', blurb: 'Those who built the naming, hypertext and application layers people actually use.' },
    { id: 'wireless-security', label: 'Wireless & Security', blurb: 'Pioneers of radio networking, cryptographic security and the switching that keeps links loop-free.' },
  ],

  figures: [
    // ── Origins
    {
      id: 'baran', name: 'Paul Baran', wikiSlug: 'Paul_Baran', hall: 'origins',
      role: 'Engineer', era: 'Origins', nationality: 'Polish-American', years: '1926–2011',
      tagline: 'Co-inventor of packet switching.',
      works: ['On Distributed Communications (1964)', 'Distributed adaptive message-block networking'],
      techniques: ['Designed survivable distributed networks for the RAND Corporation', 'Independently conceived packet switching', 'Advocated redundant, mesh-connected routing'],
    },
    {
      id: 'davies', name: 'Donald Davies', wikiSlug: 'Donald_Davies', hall: 'origins',
      role: 'Computer scientist', era: 'Origins', nationality: 'British', years: '1924–2000',
      tagline: 'Coined the term "packet switching".',
      works: ['NPL network', 'Packet switching (naming and design)'],
      techniques: ['Independently invented packet switching', 'Built the NPL data network in the UK', 'Coined the word "packet"'],
    },
    {
      id: 'kleinrock', name: 'Leonard Kleinrock', wikiSlug: 'Leonard_Kleinrock', hall: 'origins',
      role: 'Computer scientist', era: 'Origins', nationality: 'American', years: 'b. 1934',
      tagline: 'Pioneer of the mathematical theory of packet networks.',
      works: ['Queueing theory for data networks', 'First ARPANET message (1969)'],
      techniques: ['Applied queueing theory to packet networks', 'Supervised the first ARPANET node at UCLA', 'Sent the first message over the ARPANET'],
    },
    {
      id: 'roberts', name: 'Lawrence Roberts', wikiSlug: 'Lawrence_Roberts_(scientist)', hall: 'origins',
      role: 'Engineer', era: 'Origins', nationality: 'American', years: '1937–2018',
      tagline: 'Chief architect of the ARPANET.',
      works: ['ARPANET design', 'Interface Message Processor (IMP) specification'],
      techniques: ['Led the design and deployment of the ARPANET', 'Chose packet switching for the network', 'Managed the first wide-area computer network'],
    },

    // ── Internet Architecture
    {
      id: 'cerf', name: 'Vint Cerf', wikiSlug: 'Vint_Cerf', hall: 'internet',
      role: 'Computer scientist', era: 'Internet', nationality: 'American', years: 'b. 1943',
      tagline: 'A "father of the Internet".',
      works: ['TCP/IP protocol suite', 'A Protocol for Packet Network Intercommunication (1974)'],
      techniques: ['Co-designed TCP/IP with Bob Kahn', 'Established the layered end-to-end Internet architecture', '2004 Turing Award with Kahn'],
    },
    {
      id: 'kahn', name: 'Bob Kahn', wikiSlug: 'Bob_Kahn', hall: 'internet',
      role: 'Engineer', era: 'Internet', nationality: 'American', years: 'b. 1938',
      tagline: 'Co-inventor of TCP/IP.',
      works: ['TCP/IP', 'Open-architecture networking', 'Internetworking protocols'],
      techniques: ['Co-created TCP/IP with Vint Cerf', 'Formulated the open-architecture networking principle', '2004 Turing Award with Cerf'],
    },
    {
      id: 'postel', name: 'Jon Postel', wikiSlug: 'Jon_Postel', hall: 'internet',
      role: 'Computer scientist', era: 'Internet', nationality: 'American', years: '1943–1998',
      tagline: 'Editor of the RFCs and steward of Internet numbers.',
      works: ['RFC editor', 'IANA', 'DNS deployment', 'Robustness principle'],
      techniques: ['Edited the foundational RFC protocol documents', 'Administered the Internet’s number and name space (IANA)', 'Formulated Postel’s Law: "be conservative in what you send, liberal in what you accept"'],
    },
    {
      id: 'metcalfe', name: 'Robert Metcalfe', wikiSlug: 'Robert_Metcalfe', hall: 'wireless-security',
      role: 'Engineer', era: 'LANs', nationality: 'American', years: 'b. 1946',
      tagline: 'Co-inventor of Ethernet.',
      works: ['Ethernet (1973)', 'Metcalfe’s Law', '3Com'],
      techniques: ['Co-invented Ethernet local-area networking', 'Formulated Metcalfe’s Law on network value', '2022 Turing Award'],
    },

    // ── Web & Applications
    {
      id: 'berners-lee', name: 'Tim Berners-Lee', wikiSlug: 'Tim_Berners-Lee', hall: 'web-apps',
      role: 'Computer scientist', era: 'Web', nationality: 'British', years: 'b. 1955',
      tagline: 'Inventor of the World Wide Web.',
      works: ['HTTP', 'HTML', 'URLs', 'First web server & browser (1990)'],
      techniques: ['Built the application-layer Web atop TCP/IP', 'Defined HTTP, HTML and the URL', 'Founded the W3C to keep the Web open'],
    },
    {
      id: 'mockapetris', name: 'Paul Mockapetris', wikiSlug: 'Paul_Mockapetris', hall: 'web-apps',
      role: 'Computer scientist', era: 'Internet', nationality: 'American', years: 'b. 1948',
      tagline: 'Inventor of the Domain Name System.',
      works: ['Domain Name System (DNS)', 'RFC 882 / 883 / 1034 / 1035'],
      techniques: ['Designed the hierarchical, distributed DNS', 'Replaced the flat HOSTS.TXT file with delegated name resolution', 'Enabled human-readable names to scale to the global Internet'],
    },
    {
      id: 'fielding', name: 'Roy Fielding', wikiSlug: 'Roy_Fielding', hall: 'web-apps',
      role: 'Computer scientist', era: 'Web', nationality: 'American', years: 'b. 1965',
      tagline: 'Defined the REST architectural style and co-authored HTTP.',
      works: ['REST (2000 dissertation)', 'HTTP/1.1 specification', 'Apache HTTP Server'],
      techniques: ['Formalised REST as the architecture of the Web', 'Co-authored the HTTP/1.1 and URI standards', 'Co-founded the Apache web server project'],
    },

    // ── Wireless & Security
    {
      id: 'perlman', name: 'Radia Perlman', wikiSlug: 'Radia_Perlman', hall: 'wireless-security',
      role: 'Computer scientist', era: 'Switching', nationality: 'American', years: 'b. 1951',
      tagline: '"Mother of the Internet"; inventor of the Spanning Tree Protocol.',
      works: ['Spanning Tree Protocol (STP)', 'TRILL', 'Network security work'],
      techniques: ['Invented the Spanning Tree Protocol that makes bridged LANs loop-free', 'Designed TRILL for scalable layer-2 networking', 'Advanced robust and secure routing'],
    },
    {
      id: 'diffie', name: 'Whitfield Diffie', wikiSlug: 'Whitfield_Diffie', hall: 'wireless-security',
      role: 'Cryptographer', era: 'Security', nationality: 'American', years: 'b. 1944',
      tagline: 'Co-inventor of public-key cryptography.',
      works: ['Diffie–Hellman key exchange', 'New Directions in Cryptography (1976)'],
      techniques: ['Enabled secure key exchange over untrusted networks', 'Made TLS and secure web traffic possible', '2015 Turing Award with Martin Hellman'],
    },
    {
      id: 'hamming', name: 'Richard Hamming', wikiSlug: 'Richard_Hamming', hall: 'origins',
      role: 'Mathematician', era: 'Foundations', nationality: 'American', years: '1915–1998',
      tagline: 'Founder of error-correcting codes.',
      works: ['Hamming codes', 'Hamming distance', 'Error Detecting and Error Correcting Codes (1950)'],
      techniques: ['Invented the first error-correcting codes', 'Defined Hamming distance for code words', 'Made reliable transmission over noisy links possible'],
    },
    {
      id: 'jacobson', name: 'Van Jacobson', wikiSlug: 'Van_Jacobson', hall: 'internet',
      role: 'Computer scientist', era: 'Internet', nationality: 'American', years: 'b. 1950',
      tagline: 'Saved the Internet from congestion collapse.',
      works: ['TCP congestion control (1988)', 'traceroute', 'tcpdump', 'Content-centric networking'],
      techniques: ['Designed TCP slow-start and congestion avoidance', 'Built core diagnostic tools (traceroute, tcpdump)', 'Prevented the late-1980s congestion collapse of the Internet'],
    },
  ],

  concepts: [
    { id: 'packet-switching', name: 'Packet Switching', blurb: 'Breaking data into independently routed packets that share links, rather than dedicating a circuit per conversation.', wikiSlug: 'Packet_switching', tags: ['foundations', 'architecture'] },
    { id: 'tcp-ip', name: 'TCP/IP', blurb: 'The Internet protocol suite: IP delivers packets best-effort, TCP layers reliable, ordered streams on top.', wikiSlug: 'Internet_protocol_suite', tags: ['protocols', 'transport'] },
    { id: 'osi-model', name: 'OSI Model', blurb: 'A seven-layer reference model — physical to application — for describing and comparing network protocols.', wikiSlug: 'OSI_model', tags: ['architecture', 'model'] },
    { id: 'routing', name: 'Routing', blurb: 'Choosing paths for packets across an internetwork using algorithms like shortest-path and distance-vector.', wikiSlug: 'Routing', tags: ['routing', 'algorithms'] },
    { id: 'bgp', name: 'BGP', blurb: 'The Border Gateway Protocol that exchanges reachability between autonomous systems — the glue of the global Internet.', wikiSlug: 'Border_Gateway_Protocol', tags: ['routing', 'internet'] },
    { id: 'dns', name: 'DNS', blurb: 'The Domain Name System, a distributed hierarchy that resolves human-readable names to IP addresses.', wikiSlug: 'Domain_Name_System', tags: ['naming', 'application'] },
    { id: 'congestion-control', name: 'Congestion Control', blurb: 'Algorithms that pace senders to avoid overwhelming the network, keeping throughput high and loss low.', wikiSlug: 'Network_congestion', tags: ['transport', 'performance'] },
    { id: 'ethernet', name: 'Ethernet & LANs', blurb: 'The dominant local-area link technology, using framing and (historically) CSMA/CD to share a medium.', wikiSlug: 'Ethernet', tags: ['link-layer', 'lan'] },
    { id: 'tls', name: 'TLS & Network Security', blurb: 'Transport Layer Security encrypts and authenticates traffic, protecting data in transit across the Internet.', wikiSlug: 'Transport_Layer_Security', tags: ['security', 'transport'] },
    { id: 'sdn', name: 'Software-Defined Networking', blurb: 'Separating the control plane from the data plane so networks can be programmed centrally.', wikiSlug: 'Software-defined_networking', tags: ['architecture', 'modern'] },
    { id: 'wireless', name: 'Wireless & Cellular', blurb: 'Radio networking — Wi-Fi and cellular (LTE/5G) — that connects mobile devices without wires.', wikiSlug: 'Wireless_network', tags: ['wireless', 'physical'] },
    { id: 'error-correction', name: 'Error Detection & Correction', blurb: 'Checksums, CRCs and codes that detect or repair bit errors introduced by noisy links.', wikiSlug: 'Error_detection_and_correction', tags: ['link-layer', 'reliability'] },
  ],

  eras: [
    {
      id: 'circuit', title: 'Circuits & Signalling', span: '1870s–1950s',
      essay: 'Telephony built the first global communication network on circuit switching — a dedicated path per call. Nyquist and Shannon then established the theoretical limits of signalling over noisy channels, and Hamming showed how codes could correct errors.',
      developments: ['Circuit-switched telephony', 'Nyquist and sampling theory', 'Shannon’s channel capacity (1948)', 'Hamming error-correcting codes (1950)'],
      turningPoints: ['Communication given a mathematical theory', 'Reliable transmission over noisy links becomes possible'],
    },
    {
      id: 'packet', title: 'Packet Switching', span: '1960s',
      essay: 'Baran and Davies independently conceived packet switching — chopping messages into packets routed independently over shared links. Kleinrock’s queueing theory gave it a mathematical footing, setting the stage for a radically more efficient and survivable network.',
      developments: ['Baran’s distributed networks (1964)', 'Davies coins "packet switching"', 'Kleinrock’s queueing theory', 'The case against dedicated circuits'],
      turningPoints: ['Messages split into independently routed packets', 'Networks designed to survive node failures'],
    },
    {
      id: 'arpanet', title: 'The ARPANET', span: '1969–1974',
      essay: 'The ARPANET connected its first four nodes in 1969, proving packet switching at scale. Roberts led its design, Kleinrock hosted the first node, and the Network Working Group’s RFCs established the collaborative, open standards process that still governs the Internet.',
      developments: ['First ARPANET message (1969)', 'Interface Message Processors', 'The RFC process', 'Email emerges (1971)'],
      turningPoints: ['Packet switching validated in practice', 'Open, collaborative standards via RFCs'],
    },
    {
      id: 'tcpip', title: 'TCP/IP & Internetworking', span: '1974–1983',
      essay: 'Cerf and Kahn’s TCP/IP let heterogeneous networks interconnect as a single "network of networks". The end-to-end principle pushed intelligence to the edges, and on 1 January 1983 the ARPANET switched to TCP/IP — the birthday of the modern Internet.',
      developments: ['TCP/IP design (1974)', 'The end-to-end principle', 'DNS invented (1983)', 'ARPANET flag day, 1 Jan 1983'],
      turningPoints: ['Independent networks unify under TCP/IP', 'Names decoupled from addresses via DNS'],
    },
    {
      id: 'lan-web', title: 'LANs & the Web', span: '1980s–1990s',
      essay: 'Ethernet and the Spanning Tree Protocol built robust local networks, while congestion control saved the growing Internet from collapse. Then Berners-Lee’s World Wide Web gave the Internet a universal application layer, and traffic exploded.',
      developments: ['Ethernet and Spanning Tree Protocol', 'TCP congestion control (1988)', 'The World Wide Web (1990)', 'Commercial ISPs and NSFNET'],
      turningPoints: ['Local networks made robust and loop-free', 'The Web makes the Internet mainstream'],
    },
    {
      id: 'broadband', title: 'Broadband & Wireless', span: '2000s',
      essay: 'Always-on broadband, Wi-Fi and cellular data untethered the Internet from the desk. Content delivery networks, peer-to-peer and streaming reshaped traffic patterns, and TLS made encrypted commerce and communication routine.',
      developments: ['Wi-Fi (802.11) and 3G/4G', 'Content delivery networks', 'BitTorrent and streaming', 'Widespread TLS/HTTPS'],
      turningPoints: ['The Internet goes mobile and always-on', 'Encryption becomes the default'],
    },
    {
      id: 'cloud-sdn', title: 'Cloud, SDN & Programmable Networks', span: '2010s–present',
      essay: 'Hyperscale data centres, software-defined networking and network-function virtualisation turned networks into programmable software. QUIC and HTTP/3 modernised transport, and 5G, edge computing and encrypted-by-default traffic define today’s Internet.',
      developments: ['Software-defined networking', 'QUIC and HTTP/3', '5G and edge computing', 'Encrypted-by-default web'],
      turningPoints: ['Networks become programmable software', 'Transport reinvented for the mobile, encrypted web'],
    },
  ],

  laws: [
    {
      id: 'shannon-capacity', category: 'Information Theory', name: 'Shannon–Hartley Channel Capacity',
      latex: 'C = B \\log_2\\!\\left(1 + \\dfrac{S}{N}\\right)',
      variables: [
        { sym: 'C', name: 'Channel capacity', unit: 'bits/s' },
        { sym: 'B', name: 'Bandwidth', unit: 'Hz' },
        { sym: 'S/N', name: 'Signal-to-noise ratio' },
      ],
      description: 'The maximum error-free data rate of a channel of given bandwidth and noise level — the fundamental limit of any link.',
      reference: 'Shannon–Hartley theorem',
    },
    {
      id: 'nyquist', category: 'Information Theory', name: 'Nyquist Signalling Rate',
      latex: 'C = 2B \\log_2 M',
      variables: [
        { sym: 'C', name: 'Maximum data rate', unit: 'bits/s' },
        { sym: 'B', name: 'Bandwidth', unit: 'Hz' },
        { sym: 'M', name: 'Number of signalling levels' },
      ],
      description: 'For a noiseless channel, the maximum symbol rate given bandwidth and the number of discrete signal levels.',
      reference: 'Nyquist (1928)',
    },
    {
      id: 'littles-law', category: 'Queueing', name: 'Little’s Law',
      latex: 'L = \\lambda W',
      variables: [
        { sym: 'L', name: 'Average number in the system' },
        { sym: '\\lambda', name: 'Average arrival rate', unit: 'packets/s' },
        { sym: 'W', name: 'Average time in the system', unit: 's' },
      ],
      description: 'Relates queue length, arrival rate and delay in any stable system — the cornerstone of network performance analysis.',
      reference: 'Little (1961)',
    },
    {
      id: 'metcalfe', category: 'Network Value', name: 'Metcalfe’s Law',
      latex: 'V \\propto n(n - 1) \\approx n^2',
      variables: [
        { sym: 'V', name: 'Value of the network' },
        { sym: 'n', name: 'Number of connected nodes' },
      ],
      description: 'The value of a communication network grows roughly with the square of the number of connected users, since each can reach all others.',
      reference: 'Metcalfe',
    },
    {
      id: 'bandwidth-delay', category: 'Transport', name: 'Bandwidth-Delay Product',
      latex: 'BDP = B \\times RTT',
      variables: [
        { sym: 'BDP', name: 'In-flight data capacity', unit: 'bits' },
        { sym: 'B', name: 'Bottleneck bandwidth', unit: 'bits/s' },
        { sym: 'RTT', name: 'Round-trip time', unit: 's' },
      ],
      description: 'The amount of data that can be "in the pipe" — the ideal window size a sender needs to keep a link fully utilised.',
    },
    {
      id: 'throughput', category: 'Transport', name: 'TCP Throughput (Mathis Model)',
      latex: 'T \\approx \\dfrac{MSS}{RTT \\cdot \\sqrt{p}}',
      variables: [
        { sym: 'T', name: 'Throughput', unit: 'bits/s' },
        { sym: 'MSS', name: 'Maximum segment size', unit: 'bytes' },
        { sym: 'RTT', name: 'Round-trip time', unit: 's' },
        { sym: 'p', name: 'Packet loss probability' },
      ],
      description: 'Approximates steady-state TCP throughput; it falls with round-trip time and the square root of the loss rate.',
      reference: 'Mathis et al. (1997)',
    },
    {
      id: 'aimd', category: 'Congestion Control', name: 'AIMD Window Dynamics',
      latex: '\\text{ACK: } w \\leftarrow w + \\dfrac{1}{w}, \\quad \\text{Loss: } w \\leftarrow \\dfrac{w}{2}',
      variables: [
        { sym: 'w', name: 'Congestion window', unit: 'segments' },
      ],
      description: 'Additive-increase/multiplicative-decrease: TCP grows its window slowly but halves it on loss, converging to a fair, stable share.',
      reference: 'Jacobson (1988); Chiu & Jain',
    },
    {
      id: 'queue-utilisation', category: 'Queueing', name: 'M/M/1 Average Delay',
      latex: 'W = \\dfrac{1}{\\mu - \\lambda}',
      variables: [
        { sym: 'W', name: 'Average time in system', unit: 's' },
        { sym: '\\mu', name: 'Service rate', unit: 'packets/s' },
        { sym: '\\lambda', name: 'Arrival rate', unit: 'packets/s' },
      ],
      description: 'For a single-server queue with Poisson arrivals, delay blows up as the arrival rate approaches the service rate.',
      reference: 'Kleinrock, Queueing Systems',
    },
    {
      id: 'utilisation', category: 'Queueing', name: 'Server Utilisation',
      latex: '\\rho = \\dfrac{\\lambda}{\\mu}',
      variables: [
        { sym: '\\rho', name: 'Utilisation (must be < 1 for stability)' },
        { sym: '\\lambda', name: 'Arrival rate', unit: 'packets/s' },
        { sym: '\\mu', name: 'Service rate', unit: 'packets/s' },
      ],
      description: 'The fraction of time a link or server is busy; the queue is only stable when utilisation stays below one.',
    },
    {
      id: 'hamming-distance', category: 'Coding', name: 'Hamming Distance',
      latex: 'd_H(x, y) = \\sum_{i=1}^{n} [\\,x_i \\ne y_i\\,]',
      variables: [
        { sym: 'x, y', name: 'Equal-length code words' },
        { sym: 'n', name: 'Word length', unit: 'bits' },
      ],
      description: 'The number of differing bit positions between two words; a code’s minimum distance sets how many errors it can detect or correct.',
      reference: 'Hamming (1950)',
    },
    {
      id: 'error-correction', category: 'Coding', name: 'Error-Correction Capability',
      latex: 't = \\left\\lfloor \\dfrac{d_{\\min} - 1}{2} \\right\\rfloor',
      variables: [
        { sym: 't', name: 'Correctable errors per word' },
        { sym: 'd_{\\min}', name: 'Minimum Hamming distance of the code' },
      ],
      description: 'A block code with minimum distance d can correct up to t errors — the design target for reliable links.',
    },
    {
      id: 'crc', category: 'Coding', name: 'Cyclic Redundancy Check',
      latex: 'R(x) = M(x) \\cdot x^{k} \\bmod G(x)',
      variables: [
        { sym: 'M(x)', name: 'Message polynomial' },
        { sym: 'G(x)', name: 'Generator polynomial' },
        { sym: 'R(x)', name: 'CRC remainder (checksum)' },
        { sym: 'k', name: 'Degree of the generator' },
      ],
      description: 'A checksum computed by polynomial division over GF(2); the standard frame-error detector in Ethernet and Wi-Fi.',
    },
    {
      id: 'ipv4-space', category: 'Addressing', name: 'IPv4 Address Space',
      latex: 'N = 2^{32} \\approx 4.29 \\times 10^{9}',
      variables: [
        { sym: 'N', name: 'Total IPv4 addresses' },
      ],
      description: 'IPv4 uses 32-bit addresses, giving about 4.3 billion — exhaustion of which drove the move to 128-bit IPv6.',
    },
    {
      id: 'subnet', category: 'Addressing', name: 'Subnet Host Count',
      latex: 'H = 2^{\\,32 - p} - 2',
      variables: [
        { sym: 'H', name: 'Usable host addresses' },
        { sym: 'p', name: 'Prefix length (CIDR /p)' },
      ],
      description: 'The number of assignable hosts in an IPv4 subnet, subtracting the network and broadcast addresses.',
    },
    {
      id: 'propagation-delay', category: 'Physical', name: 'Propagation Delay',
      latex: 't_{prop} = \\dfrac{d}{v}',
      variables: [
        { sym: 't_{prop}', name: 'Propagation delay', unit: 's' },
        { sym: 'd', name: 'Link distance', unit: 'm' },
        { sym: 'v', name: 'Signal speed in the medium', unit: 'm/s' },
      ],
      description: 'The time for a signal to travel the length of a link — a floor on latency set by physics, not bandwidth.',
    },
    {
      id: 'transmission-delay', category: 'Physical', name: 'Transmission Delay',
      latex: 't_{trans} = \\dfrac{L}{B}',
      variables: [
        { sym: 't_{trans}', name: 'Transmission delay', unit: 's' },
        { sym: 'L', name: 'Packet length', unit: 'bits' },
        { sym: 'B', name: 'Link bandwidth', unit: 'bits/s' },
      ],
      description: 'The time to push all bits of a packet onto the wire; total one-way delay adds transmission, propagation, queueing and processing.',
    },
  ],

  tools: [
    { name: 'Wireshark', org: 'Wireshark Foundation', url: 'https://www.wireshark.org', desc: 'The standard open-source packet analyser for capturing and inspecting network traffic.', kind: 'software', access: 'Open' },
    { name: 'Cloudflare Radar', org: 'Cloudflare', url: 'https://radar.cloudflare.com', desc: 'Live global Internet traffic, routing, outage and protocol-adoption trends.', kind: 'api', access: 'Open' },
    { name: 'RIPE Atlas', org: 'RIPE NCC', url: 'https://atlas.ripe.net', desc: 'A global network of probes for active Internet measurement (ping, traceroute, DNS).', kind: 'api', access: 'Free key' },
    { name: 'RIPEstat', org: 'RIPE NCC', url: 'https://stat.ripe.net', desc: 'Open data on IP prefixes, ASNs, BGP routing and reverse DNS.', kind: 'api', access: 'Free API' },
    { name: 'Mininet', org: 'Mininet', url: 'https://mininet.org', desc: 'Emulate a full software-defined network of hosts, switches and links on one machine.', kind: 'software', access: 'Open' },
    { name: 'nmap', org: 'Nmap Project', url: 'https://nmap.org', desc: 'Open-source network scanner for host discovery, port scanning and service detection.', kind: 'software', access: 'Open' },
    { name: 'BGP.tools', org: 'BGP.tools', url: 'https://bgp.tools', desc: 'Explore the global BGP routing table, autonomous systems and peering.', kind: 'api', access: 'Open' },
    { name: 'Hurricane Electric BGP', org: 'Hurricane Electric', url: 'https://bgp.he.net', desc: 'Interactive maps and data for BGP prefixes, ASNs and IX peering.', kind: 'api', access: 'Open' },
    { name: 'Internet Society Pulse', org: 'Internet Society', url: 'https://pulse.internetsociety.org', desc: 'Metrics on the health, availability and evolution of the global Internet.', kind: 'dataset', access: 'Open' },
    { name: 'CAIDA', org: 'UC San Diego', url: 'https://www.caida.org/data/', desc: 'Research datasets and tools for Internet topology, routing and traffic.', kind: 'dataset', access: 'Open' },
    { name: 'iperf3', org: 'ESnet', url: 'https://iperf.fr', desc: 'Open-source tool for actively measuring achievable network bandwidth.', kind: 'software', access: 'Open' },
    { name: 'IETF RFCs', org: 'IETF', url: 'https://www.rfc-editor.org', desc: 'The authoritative, free archive of Internet protocol standards and specifications.', kind: 'dataset', access: 'Open' },
    { name: 'ns-3', org: 'nsnam', url: 'https://www.nsnam.org', desc: 'Discrete-event network simulator for research and teaching.', kind: 'software', access: 'Open' },
  ],
};

export default DATA;
