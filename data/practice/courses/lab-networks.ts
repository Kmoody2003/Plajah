import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

/** Compact question builder: mcq with 4 choices (rotated so correct answers spread across 0-3). */
const q = (
  lessonId: string,
  n: number,
  level: 1 | 2 | 3,
  prompt: string,
  choices: string[],
  answer: number,
  hint: string,
  explanation: string,
): Question => {
  const k = (lessonId.length * 3 + n * 5 + lessonId.charCodeAt(lessonId.length - 1)) % 4;
  const rotated = choices.map((_, i) => choices[(i - k + 4) % 4]);
  return { id: `${lessonId}.q${n}`, lessonId, kind: 'mcq', prompt, choices: rotated, answer: (answer + k) % 4, hint, explanation, level };
};

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'lab-networks',
    label: 'Computer Networks',
    blurb: 'How packets, protocols and routers connect every machine on Earth, from packet switching to TLS.',
    accent: '#74C0FC',
    framework: 'ngss',
    tracks: [
      {
        id: 'lab-networks.t1',
        title: 'Packets, Delay and Limits',
        blurb: 'How data moves, what slows it down, and the physics that caps it.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-networks.l01',
            title: 'Packet Switching',
            blurb: 'Chopping messages into packets that share links.',
            minutes: 6,
            body:
              'Telephone networks used circuit switching: each call reserved a dedicated path for its whole duration, even during silences. Packet switching takes a different approach. A message is cut into small packets, each carrying a destination address, and the packets share links with everyone else\'s traffic. Routers forward each packet independently, and the receiver reassembles the message.\n\nThis is efficient for bursty computer traffic, because a link is used only when someone actually has data to send. This sharing is called statistical multiplexing. It is also more survivable: if one link fails, later packets can take another route. Paul Baran proposed distributed, survivable networks of message blocks in his 1964 report On Distributed Communications, and Donald Davies independently invented the idea in Britain and coined the word packet. Leonard Kleinrock\'s queueing theory gave the approach a mathematical footing, and Lawrence Roberts chose it for the ARPANET, whose first message was sent in 1969.\n\nThe price of sharing is that packets may wait in queues, arrive out of order, or be dropped when buffers fill. Higher layers must cope with that.\n\nA good analogy is the post: a long letter split into numbered postcards that travel separately and may take different routes, then get put back in order at the destination.',
          },
          {
            id: 'lab-networks.l02',
            title: 'Where Delay Comes From',
            blurb: 'Transmission, propagation, queueing and processing delay.',
            minutes: 8,
            body:
              'The time a packet takes to cross a network is the sum of four delays: processing (examining the header), queueing (waiting for the link), transmission and propagation. Two of these have simple formulas that students often confuse.\n\nTransmission delay is the time to push all of a packet\'s bits onto the wire: t_trans = L / B, where L is the packet length in bits and B is the link bandwidth in bits per second. A 1500-byte packet is 12,000 bits, so on a 10 megabit per second link it takes 12,000 / 10,000,000 = 0.0012 s, or 1.2 ms.\n\nPropagation delay is the time for a signal to travel the length of the link: t_prop = d / v, where d is the distance and v is the signal speed in the medium, typically about two thirds of the speed of light, 2 x 10^8 metres per second. For a 2000 km link, 2,000,000 / 200,000,000 = 0.01 s, or 10 ms.\n\nThe difference matters. Buying more bandwidth shrinks transmission delay but cannot reduce propagation delay, which is set by physics and distance. That is why a very fast intercontinental link still has noticeable lag.\n\nA useful picture is a convoy of cars: transmission delay is how long it takes the whole convoy to enter the road, while propagation delay is how long the first car needs to drive to the far end.',
          },
          {
            id: 'lab-networks.l03',
            title: 'Queues and Little\'s Law',
            blurb: 'Why delay explodes as a link nears full load.',
            minutes: 8,
            body:
              'Because packets share links, they sometimes have to wait. Queueing theory, which Leonard Kleinrock applied to networks, describes how long. Two results are especially useful.\n\nLittle\'s Law says that in any stable system, L = lambda x W: the average number of items in the system equals the arrival rate times the average time each spends there. If 500 packets per second arrive at a router and each spends on average 0.02 s there, then on average 500 x 0.02 = 10 packets are in the system.\n\nFor a simple single-server queue with random (Poisson) arrivals, the average time in the system is W = 1 / (mu - lambda), where mu is the service rate and lambda the arrival rate, both in packets per second. Utilisation is rho = lambda / mu, and the queue is only stable when rho is below 1. If mu = 1000 and lambda = 900, then rho = 0.9 and W = 1 / 100 = 10 ms. At lambda = 990 the delay becomes 1 / 10 = 100 ms, ten times larger, even though the load only rose 10 percent.\n\nThe lesson is that delay is not linear in load: it blows up as utilisation approaches 100 percent. Engineers therefore keep links well below full capacity if they want low latency, much as a motorway moves smoothly at moderate traffic but jams badly near its limit.',
          },
          {
            id: 'lab-networks.l04',
            title: 'Channel Capacity: Nyquist and Shannon',
            blurb: 'The physical limits of any link.',
            minutes: 8,
            body:
              'How fast can data be sent over a wire or radio channel? Two limits answer this. Harry Nyquist (1928) considered a noiseless channel: the maximum data rate is C = 2B log2(M), where B is bandwidth in hertz and M is the number of distinct signal levels. With B = 3000 Hz and M = 4 levels, C = 2 x 3000 x log2(4) = 2 x 3000 x 2 = 12,000 bits per second. More levels allow more bits per symbol, but real channels have noise, which limits how many levels can be told apart.\n\nClaude Shannon\'s 1948 theory gives the limit with noise: C = B log2(1 + S/N), where S/N is the signal-to-noise ratio as a plain ratio (not decibels). With B = 1 MHz and S/N = 255, C = 1,000,000 x log2(256) = 8,000,000 bits per second. The remarkable part is that Shannon proved error-free communication is possible at any rate below C, with suitable coding, and impossible above it.\n\nThere are two ways to raise the capacity: more bandwidth, or a better signal-to-noise ratio. Notice that capacity grows only logarithmically with signal power, so doubling the power adds just a bit more per hertz, while doubling the bandwidth doubles C.\n\nThis is the fundamental ceiling behind everything from Wi-Fi to fibre links, and it motivated error-correcting codes that get close to it.',
          },
        ],
      },
      {
        id: 'lab-networks.t2',
        title: 'The Internet Architecture',
        blurb: 'Layers, addresses and routing: how separate networks become one.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-networks.l05',
            title: 'TCP/IP and the End-to-End Principle',
            blurb: 'Best-effort delivery below, reliability at the edges.',
            minutes: 7,
            body:
              'The Internet is a network of networks, and TCP/IP is the set of rules that lets them interconnect. Vint Cerf and Bob Kahn designed it in the 1970s, publishing A Protocol for Packet Network Intercommunication in 1974. The design splits the work in two. The Internet Protocol (IP) moves packets between any two hosts on a best-effort basis: it tries, but may lose, delay, duplicate or reorder packets. The Transmission Control Protocol (TCP) runs on the end hosts and adds reliability, ordering and flow control, so that an application sees a clean, ordered stream of bytes.\n\nThis follows the end-to-end principle: keep the network core simple and put intelligence at the edges. A simple core is cheap, scales well and can carry new applications nobody planned for.\n\nThe cut-over came on 1 January 1983, when the ARPANET switched to TCP/IP in what is called the flag day. That date is often called the birthday of the modern Internet. Specification RFC 793 (1981) defined TCP, and the RFC process, edited for years by Jon Postel, kept standards open and collaborative. Postel\'s robustness principle advised being conservative in what you send and liberal in what you accept.\n\nAn analogy is the postal service plus a careful pen friend: the post office just does its best to move envelopes, while the two correspondents number their letters, ask for missing ones and put them in order.',
          },
          {
            id: 'lab-networks.l06',
            title: 'Layers and Addresses',
            blurb: 'The layered model, IP addresses and subnets.',
            minutes: 8,
            body:
              'Networking is organised in layers, each providing a service to the layer above. The OSI model describes seven: physical, data link, network, transport, session, presentation and application. In the Internet suite these collapse into roughly four or five: link (Ethernet, Wi-Fi), internet (IP), transport (TCP and UDP) and application (HTTP, DNS, TLS). Each layer wraps the data from above with its own header, so a web page is carried inside a TCP segment, inside an IP packet, inside a link frame. Layering lets each part evolve independently.\n\nIPv4 addresses are 32 bits long, giving 2^32, about 4.29 billion, addresses. That ran short, which drove the move to 128-bit IPv6. Addresses are grouped into subnets with CIDR notation, where /p means the first p bits identify the network. The number of usable host addresses is H = 2^(32 - p) - 2, because the first address of the block names the network and the last is the broadcast address. A /24 therefore has 2^8 - 2 = 254 hosts, and a /26 has 2^6 - 2 = 62.\n\nA longer prefix means a smaller subnet. Routers match addresses by prefix, which keeps routing tables small, much like postal codes let a sorting office handle a letter without knowing the street.',
          },
          {
            id: 'lab-networks.l07',
            title: 'Routing and BGP',
            blurb: 'How each router picks the next hop.',
            minutes: 7,
            body:
              'Routing is the problem of deciding, at every router, which neighbour should receive each packet. No router knows the entire path; each just needs to choose a good next hop, and the combined choices deliver the packet. The genius of the Internet is that this works at planetary scale.\n\nLink-state protocols such as OSPF have every router flood information about its links, so each builds a map of the topology and runs Dijkstra\'s shortest-path algorithm (1959) locally. Distance-vector protocols such as RIP rely on the Bellman-Ford algorithm: each router tells its neighbours its distances to destinations, and everyone gradually updates. Distance is measured in a cost that may reflect hops, delay or administrator preference.\n\nBetween different organisations, the Internet uses the Border Gateway Protocol (BGP, RFC 4271). The Internet is made of autonomous systems, each run by one operator such as an ISP or a university. BGP exchanges reachability information between them, and routes are chosen using policies, not just shortest distance. It is a path-vector protocol, which means each route lists the sequence of autonomous systems it traverses so loops can be detected.\n\nRouting is like asking directions at each junction: you do not know the full route to a distant city, but at every corner someone points you to a sensible next road. The agreement between operators about whom they will carry traffic for is why BGP is as much about business policy as geography.',
          },
        ],
      },
      {
        id: 'lab-networks.t3',
        title: 'Reliability and Performance',
        blurb: 'Coping with noisy links and sharing capacity fairly.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'lab-networks.l08',
            title: 'Error Detection and Hamming Distance',
            blurb: 'Redundancy that catches or repairs corrupted bits.',
            minutes: 8,
            body:
              'Physical links corrupt bits, so networks add redundancy that lets a receiver detect errors, and sometimes correct them without asking for a resend. Richard Hamming introduced the first error-correcting codes in 1950 and defined Hamming distance: the number of bit positions in which two equal-length words differ. For 10110 and 11100, the words differ in the second and fourth positions, so the distance is 2.\n\nA code is a set of valid words. Its minimum distance d_min, the smallest Hamming distance between any two valid words, determines its power. A code can detect up to d_min - 1 errors, and can correct up to t = floor((d_min - 1) / 2) errors. If d_min = 3, then t = floor(2 / 2) = 1: any single flipped bit leaves the received word closer to the original word than to any other, so the receiver can repair it. If d_min = 5, then t = 2.\n\nIn practice, links use a cyclic redundancy check (CRC), a checksum computed by polynomial division. A CRC reliably detects frame errors in Ethernet and Wi-Fi but does not correct them, so a corrupted frame is simply discarded and recovered by retransmission higher up. Codes such as Reed-Solomon correct errors directly, for example on discs and in satellite links.\n\nShannon showed that with enough redundancy, reliable transmission is possible up to the channel capacity, so coding is how real systems approach that limit.',
          },
          {
            id: 'lab-networks.l09',
            title: 'Bandwidth-Delay Product and TCP Throughput',
            blurb: 'How much data must be in flight to fill a link.',
            minutes: 8,
            body:
              'To keep a link busy, a sender must have enough data in flight, sent but not yet acknowledged, to cover the time before the first acknowledgement returns. The bandwidth-delay product measures this: BDP = B x RTT, where B is the bottleneck bandwidth and RTT is the round-trip time. With a 100 megabit per second link and an RTT of 40 ms, BDP = 100,000,000 x 0.04 = 4,000,000 bits, which is 500,000 bytes, or 500 kB. If TCP\'s window is smaller than that, the sender stalls waiting for acknowledgements and the link is underused.\n\nReal throughput is also limited by loss. The Mathis model gives an approximation for steady-state TCP: T is about MSS / (RTT x sqrt(p)), where MSS is the segment size and p is the packet loss probability. Two consequences follow. Throughput is inversely proportional to RTT, so doubling RTT halves throughput. And it falls with the square root of loss, so quadrupling the loss rate halves the throughput.\n\nThis explains why transcontinental downloads are slower than local ones on identical links, and why even a small loss rate on a long path hurts so much. Fixes include larger windows, content delivery networks that move data closer to users, and newer transports.\n\nIt is like filling a pipe with water: the amount in the pipe at any moment is the flow rate times the travel time, and a short hose cannot be kept full by a slow tap.',
          },
          {
            id: 'lab-networks.l10',
            title: 'Congestion Control',
            blurb: 'How TCP shares links without collapsing them.',
            minutes: 7,
            body:
              'If every sender transmitted as fast as it could, links would overflow, packets would be dropped and retransmissions would make things worse. In the mid-1980s, this caused congestion collapses that cut Internet throughput by orders of magnitude. Van Jacobson\'s 1988 paper Congestion Avoidance and Control introduced the fixes now used in TCP, described in RFC 5681.\n\nThe central idea is that each sender keeps a congestion window w, the amount of unacknowledged data it may have in flight, and treats packet loss as a signal that the network is congested. In slow start the window grows quickly at first. In congestion avoidance TCP uses additive-increase, multiplicative-decrease (AIMD): for each acknowledged window it grows w by about one segment (w increases by 1/w per acknowledgement), and on a loss it halves it. A window of 20 segments that suffers a loss drops to 10.\n\nAIMD is more than a hack. Chiu and Jain proved that it converges toward fairness and efficiency: flows with larger windows lose more in absolute terms when halved, so competing flows drift toward equal shares of a bottleneck.\n\nThe pattern is a sawtooth: slow, steady growth followed by a sudden cut. Think of cars merging onto a busy road, easing gently forward until horns sound, then backing off sharply so everyone gets through.',
          },
        ],
      },
      {
        id: 'lab-networks.t4',
        title: 'Names, Security and the Web',
        blurb: 'The services people actually use, and how they stay trustworthy.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'lab-networks.l11',
            title: 'DNS: The Internet\'s Phone Book',
            blurb: 'Turning names into addresses with a distributed hierarchy.',
            minutes: 7,
            body:
              'People remember names like example.com, but packets need IP addresses. The Domain Name System (DNS) translates between them. Early on, a single file called HOSTS.TXT, edited by hand and copied around, listed every machine. That could not scale, so Paul Mockapetris designed DNS (RFC 882 and 883, then RFC 1034 and 1035 in 1987) as a hierarchical, distributed database.\n\nNames are read from right to left. The root sits at the top, below it are top-level domains such as .com, and below those are zones run by organisations. Each level delegates authority downward, so no single machine holds everything. The root is anchored by 13 root server identities, each replicated widely using anycast. A resolver, working for your device, asks the root where to find the .com servers, asks those about example.com, and finally asks the authoritative server for the address.\n\nCaching makes this fast. Every answer carries a time-to-live (TTL) that tells resolvers how long they may reuse it, so most lookups finish from a nearby cache in milliseconds and the root servers stay lightly loaded. The trade-off is that a changed record may take up to its TTL to be seen everywhere.\n\nDNS is like a phone book that is split across many offices: you ask the head office which regional office knows the entry, and keep a copy of what you learned so you do not need to ask again soon.',
          },
          {
            id: 'lab-networks.l12',
            title: 'TLS and Secure Connections',
            blurb: 'Encryption and authentication for traffic in transit.',
            minutes: 8,
            body:
              'Data crossing the Internet passes through machines nobody trusts. Transport Layer Security (TLS) wraps an ordinary TCP connection in encryption and authentication, so an eavesdropper sees only ciphertext and a client can check it really is talking to the intended server. This is what the padlock for HTTPS indicates.\n\nThe core problem is how two strangers agree on a secret key over an open channel. Whitfield Diffie and Martin Hellman solved it in 1976 with public-key key exchange. In the TLS handshake the two sides use such an exchange to agree a fresh symmetric session key, which is then used to encrypt the actual data because symmetric encryption is much faster. A server also presents a certificate, signed by a certificate authority (CA), tying its public key to its identity; the client trusts the CA chain, not each website individually.\n\nTLS 1.3 (RFC 8446, 2018) cut the handshake to a single round trip and removed many legacy weak options, and it provides forward secrecy by default, so recorded traffic cannot be decrypted later even if a server\'s long-term key is stolen.\n\nTwo guarantees matter: confidentiality (others cannot read it) and authentication (you know who you reached). TLS does not make a website honest, though. A valid certificate shows you reached the named server, not that the server is trustworthy.',
          },
          {
            id: 'lab-networks.l13',
            title: 'The Web, Ethernet and Network Value',
            blurb: 'Local links, the application layer and why networks grow in value.',
            minutes: 7,
            body:
              'Two more pieces complete the picture. Locally, Ethernet, co-invented by Robert Metcalfe in 1973, became the dominant link technology for local-area networks. Early Ethernet shared a medium using CSMA/CD, in which stations listen before sending and back off if two collide. Switched LANs later needed loop-free topologies, which Radia Perlman\'s Spanning Tree Protocol provides by disabling redundant links, and Wi-Fi and cellular networks extended the same ideas over radio.\n\nAbove the network, Tim Berners-Lee built the World Wide Web in 1990 as an application layer on top of TCP/IP. He defined three things: the URL to name a resource, HTTP to fetch it, and HTML to describe pages. Roy Fielding later formalised the Web\'s architecture as REST and co-authored the HTTP/1.1 specification. Because the Web needed no changes to the network core, it was an example of the end-to-end principle in action, and traffic exploded.\n\nMetcalfe\'s Law captures why such networks become so valuable: the value V grows roughly with the square of the number of nodes n, since V is proportional to n(n - 1). Doubling the number of connected users roughly quadruples the number of possible connections. A network of 10 users has 90 directed pairs, but 100 users has 9,900.\n\nThis is a rule of thumb, not a precise law, but it explains why each new member makes a network more attractive to the next.',
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lab-networks',
    questions: [
      // l01
      q('lab-networks.l01', 1, 1, 'What is a packet in packet switching?', ['A small chunk of a message carrying its own address', 'A dedicated circuit reserved for the whole length of a call', 'A type of cable', 'A router program'], 0, 'Messages are divided into pieces.', 'Messages are cut into small packets, each addressed and forwarded independently.'),
      q('lab-networks.l01', 2, 1, 'Who coined the term "packet" for this approach?', ['Donald Davies', 'Tim Berners-Lee', 'Vint Cerf and Bob Kahn together', 'Paul Mockapetris'], 0, 'He built the NPL network in Britain.', 'Donald Davies independently invented packet switching and coined the word packet.'),
      q('lab-networks.l01', 3, 2, 'Why is packet switching more efficient than circuit switching for bursty computer traffic?', ['Links are used only when someone has data, and are shared among many users', 'Each user gets a private dedicated wire that stays reserved even while idle or silent', 'Packets are never queued', 'It uses a different alphabet'], 0, 'Think about idle time in a reserved circuit.', 'Sharing links through statistical multiplexing avoids wasting reserved capacity during idle periods.'),
      q('lab-networks.l01', 4, 3, 'What is a drawback that packet switching introduces compared with a reserved circuit?', ['Packets may queue, be reordered or be dropped', 'Calls can never connect', 'Messages cannot be longer than one packet', 'Addresses are not needed'], 0, 'Sharing has a cost.', 'Because packets share links, they can wait in queues, arrive out of order, or be dropped, so higher layers must cope.'),
      // l02
      q('lab-networks.l02', 1, 1, 'Which formula gives transmission delay?', ['L / B (packet length over bandwidth)', 'd / v (distance over speed)', 'B x RTT (bandwidth times round-trip time)', 'L x B'], 0, 'It is the time to push the bits onto the wire.', 'Transmission delay is packet length in bits divided by link bandwidth in bits per second.'),
      q('lab-networks.l02', 2, 1, 'Which delay can never be reduced by buying a faster (higher-bandwidth) link?', ['Propagation delay', 'Transmission delay of the packet', 'Queueing delay at the router', 'None of these, as all can be reduced'], 0, 'It depends on distance and signal speed.', 'Propagation delay depends on distance and the signal speed in the medium, not on bandwidth.'),
      q('lab-networks.l02', 3, 2, 'A 12,000-bit packet is sent over a 10 Mbit/s link. What is the transmission delay?', ['0.12 ms', '1.2 ms', '12 ms', '120 ms'], 1, 'Divide 12,000 by 10,000,000 and convert to milliseconds.', '12,000 / 10,000,000 = 0.0012 s, which is 1.2 ms.'),
      q('lab-networks.l02', 4, 3, 'A link is 2000 km long and signals travel at 2 x 10^8 m/s. What is the propagation delay, and what does upgrading the link from 10 Mbit/s to 1 Gbit/s do to it?', ['10 ms, and it stays the same', '10 ms, and it drops 100-fold', '1 ms, and it stays the same', '100 ms, and it drops 100-fold'], 0, 'Distance over speed does not involve bandwidth.', '2,000,000 m / 200,000,000 m/s = 0.01 s = 10 ms, and it is unaffected by bandwidth.'),
      // l03
      q('lab-networks.l03', 1, 1, 'What does Little\'s Law state?', ['L = lambda x W', 'L = lambda divided by W', 'W = L times lambda', 'L = W minus lambda'], 0, 'Average number equals arrival rate times time in system.', 'Little\'s Law: the average number in the system equals the arrival rate times the average time spent in it.'),
      q('lab-networks.l03', 2, 1, 'For a queue to be stable, what must the utilisation rho = lambda / mu satisfy?', ['rho < 1', 'rho > 1', 'rho = 0', 'rho = 2'], 0, 'Arrivals cannot exceed service on average.', 'If arrivals exceed the service rate on average, the queue grows without bound, so rho must be below 1.'),
      q('lab-networks.l03', 3, 2, 'A router receives 500 packets per second and each spends 0.02 s there on average. How many packets are in the system on average?', ['5', '10', '25', '250'], 1, 'Use L = lambda x W.', 'L = 500 x 0.02 = 10 packets.'),
      q('lab-networks.l03', 4, 3, 'With mu = 1000 packets/s, the arrival rate rises from 900 to 990 packets/s. By what factor does the M/M/1 average delay change?', ['It stays about the same as before', 'It rises about 10-fold', 'It rises by about ten percent', 'It halves, since the system speeds up'], 1, 'Compute W = 1/(mu - lambda) for both.', 'W goes from 1/100 = 10 ms to 1/10 = 100 ms, ten times larger, though load rose only 10 percent.'),
      // l04
      q('lab-networks.l04', 1, 1, 'What does the Shannon-Hartley formula give?', ['The maximum error-free data rate of a noisy channel', 'The average delay experienced by a packet crossing one link', 'The number of IP addresses', 'The size of a packet'], 0, 'It involves bandwidth and signal-to-noise ratio.', 'C = B log2(1 + S/N) is the capacity of a channel with bandwidth B and noise.'),
      q('lab-networks.l04', 2, 1, 'In the Nyquist formula C = 2B log2(M), what does M stand for?', ['The number of signalling levels', 'The number of messages', 'The maximum delay allowed on the channel', 'The modulation frequency'], 0, 'More of these give more bits per symbol.', 'M is the number of distinct signal levels used per symbol.'),
      q('lab-networks.l04', 3, 2, 'A noiseless channel has B = 3000 Hz and uses M = 4 signal levels. What is the Nyquist maximum rate?', ['6,000 bit/s', '12,000 bit/s', '24,000 bit/s', '3,000 bit/s'], 1, 'log2(4) is 2.', 'C = 2 x 3000 x log2(4) = 2 x 3000 x 2 = 12,000 bit/s.'),
      q('lab-networks.l04', 4, 3, 'A channel has B = 1 MHz and S/N = 255. What is the Shannon capacity?', ['1 Mbit/s', '4 Mbit/s', '8 Mbit/s', '255 Mbit/s'], 2, 'S/N + 1 equals 256, a power of 2.', 'C = 1,000,000 x log2(256) = 8,000,000 bit/s.'),
      // l05
      q('lab-networks.l05', 1, 1, 'Which protocol provides reliable, ordered delivery of a byte stream?', ['TCP', 'The Internet Protocol', 'Ethernet framing', 'The Domain Name System'], 0, 'It runs on end hosts.', 'TCP adds reliability, ordering and flow control on top of best-effort IP.'),
      q('lab-networks.l05', 2, 1, 'On what date did the ARPANET switch to TCP/IP?', ['1 January 1983', '29 October 1969, the first message', '1 January 1990, the Web launch', '4 July 1974, the TCP paper'], 0, 'It is called the flag day.', 'The ARPANET flag day on 1 January 1983 moved the whole network to TCP/IP.'),
      q('lab-networks.l05', 3, 2, 'IP is best-effort. What does that mean for an application using only IP?', ['Packets may be lost, delayed, duplicated or reordered', 'Every packet is guaranteed to arrive, in order, exactly once', 'Packets are always encrypted', 'Packets always arrive in order'], 0, 'No guarantees are made.', 'IP tries to deliver but gives no guarantee of delivery or order, which is why TCP is layered on top.'),
      q('lab-networks.l05', 4, 3, 'What is the main argument of the end-to-end principle?', ['Keep the network core simple and put intelligence at the edges', 'Put all reliability features in the routers', 'Every router must store the full connection state', 'Hosts should not do any checking'], 0, 'Think about who benefits from a simple core.', 'A simple core is cheap, scales and supports new applications, while end hosts supply the specific services they need.'),
      // l06
      q('lab-networks.l06', 1, 1, 'How many bits are in an IPv4 address?', ['32', '64', '128', '16'], 0, 'IPv6 is the one with 128.', 'IPv4 addresses are 32 bits long, giving about 4.29 billion addresses.'),
      q('lab-networks.l06', 2, 1, 'Which layer in the Internet suite includes TCP and UDP?', ['Transport', 'Link, covering Ethernet and Wi-Fi', 'Application, covering HTTP and DNS', 'Physical, covering cables and signals'], 0, 'It sits between IP and the application.', 'TCP and UDP are transport-layer protocols.'),
      q('lab-networks.l06', 3, 2, 'How many usable host addresses are in an IPv4 /24 subnet?', ['24', '128', '254', '256'], 2, 'Use 2^(32 - 24) - 2.', '2^8 = 256, minus the network and broadcast addresses, gives 254.'),
      q('lab-networks.l06', 4, 3, 'How many usable host addresses does a /26 subnet have, and why is it smaller than a /24?', ['62; a longer prefix leaves fewer host bits', '64; a longer prefix leaves more host bits', '254; the prefix does not matter', '30; it uses a different address length'], 0, 'Host bits = 32 - 26.', '2^(32 - 26) - 2 = 64 - 2 = 62; more bits in the network prefix mean fewer bits for hosts.'),
      // l07
      q('lab-networks.l07', 1, 1, 'Which algorithm do link-state protocols such as OSPF run on each router?', ['Dijkstra\'s shortest path', 'Bubble sort of the routing table', 'RSA', 'CRC'], 0, 'Published in 1959.', 'Link-state routers build a topology map and run Dijkstra\'s algorithm locally.'),
      q('lab-networks.l07', 2, 1, 'Which protocol exchanges reachability between autonomous systems on the Internet?', ['BGP', 'RIP, a distance-vector protocol', 'ARP, for address resolution', 'DHCP, for host configuration'], 0, 'Border Gateway Protocol.', 'BGP is the path-vector protocol that connects the Internet\'s autonomous systems.'),
      q('lab-networks.l07', 3, 2, 'A router does not know the full path to a distant destination. How can packets still arrive?', ['Each router forwards to a suitable next hop, and the combined hops form the path', 'The packet carries the complete route to follow', 'A central computer controls every packet', 'Packets wait until the full path is learned'], 0, 'Routing is a hop-by-hop decision.', 'Each router only needs the next hop toward the destination, so the path emerges from many local decisions.'),
      q('lab-networks.l07', 4, 3, 'Why does BGP consider more than shortest distance when choosing routes?', ['Operators apply business and policy preferences between networks', 'Shortest-path calculations are impossible', 'Distances are always equal', 'It ignores loops'], 0, 'Autonomous systems are run by different organisations.', 'Between independently run networks, routes are chosen using policies, such as whom to carry traffic for, not only path length.'),
      // l08
      q('lab-networks.l08', 1, 1, 'What does Hamming distance count?', ['The positions at which two equal-length words differ', 'The length of a word', 'The total number of 1 bits found in one of the two words', 'The number of packets lost'], 0, 'Compare two words bit by bit.', 'Hamming distance is the number of bit positions at which two words differ.'),
      q('lab-networks.l08', 2, 1, 'Which check is standard for detecting frame errors in Ethernet and Wi-Fi?', ['Cyclic redundancy check', 'Public-key digital signature', 'Spanning tree', 'DNS lookup'], 0, 'It uses polynomial division.', 'A CRC is a polynomial-division checksum used to detect frame errors.'),
      q('lab-networks.l08', 3, 2, 'What is the Hamming distance between 10110 and 11100?', ['1', '2', '3', '4'], 1, 'Compare each position in turn.', 'The words differ in positions 2 and 4, so the distance is 2.'),
      q('lab-networks.l08', 4, 3, 'A code has minimum Hamming distance 5. How many bit errors per word can it correct?', ['1', '2', '4', '5'], 1, 't = floor((d_min - 1) / 2).', 't = floor((5 - 1) / 2) = 2.'),
      // l09
      q('lab-networks.l09', 1, 1, 'What does the bandwidth-delay product represent?', ['The amount of data that can be in flight on the path', 'The fraction of all packets that are lost along the path', 'The packet size', 'The number of routers'], 0, 'Bandwidth times round-trip time.', 'BDP = B x RTT is the amount of data needed in flight to keep the link fully used.'),
      q('lab-networks.l09', 2, 1, 'According to the Mathis model, how does TCP throughput change as the round-trip time doubles (other things equal)?', ['It halves', 'It doubles', 'It stays the same', 'It falls to a quarter'], 0, 'T is inversely proportional to RTT.', 'T is proportional to 1 / RTT, so doubling RTT halves the throughput.'),
      q('lab-networks.l09', 3, 2, 'A path has bandwidth 100 Mbit/s and RTT of 40 ms. What is the bandwidth-delay product in bytes?', ['50,000 bytes', '500,000 bytes', '4,000,000 bytes', '5,000,000 bytes'], 1, 'Compute bits first, then divide by 8.', '100,000,000 x 0.04 = 4,000,000 bits = 500,000 bytes.'),
      q('lab-networks.l09', 4, 3, 'The packet loss rate rises fourfold. By what factor does Mathis-model throughput change?', ['It falls to half', 'It falls to a quarter', 'It rises fourfold', 'It stays the same'], 0, 'Throughput depends on 1/sqrt(p).', 'T is proportional to 1 / sqrt(p), and sqrt(4) = 2, so throughput halves.'),
      // l10
      q('lab-networks.l10', 1, 1, 'What does AIMD stand for?', ['Additive increase, multiplicative decrease', 'Adaptive increase, minimal delay', 'Automatic IP management daemon', 'Acknowledged in multiple domains'], 0, 'It describes how the window grows and shrinks.', 'AIMD grows the window gently by additive increase and cuts it by a multiplicative factor on loss.'),
      q('lab-networks.l10', 2, 1, 'Who published the 1988 congestion-control paper that ended Internet congestion collapse?', ['Van Jacobson', 'Radia Perlman', 'Bob Metcalfe', 'Jon Postel, the RFC editor'], 0, 'He also wrote traceroute.', 'Van Jacobson\'s Congestion Avoidance and Control introduced slow start and congestion avoidance.'),
      q('lab-networks.l10', 3, 2, 'A TCP congestion window is 20 segments when a loss occurs. Using the AIMD rule, what is the window afterwards?', ['10', '19', '21', '5'], 0, 'Multiplicative decrease halves it.', 'On loss, w is halved: 20 / 2 = 10 segments.'),
      q('lab-networks.l10', 4, 3, 'Why does AIMD make competing flows converge toward equal shares of a bottleneck?', ['Halving takes more from larger windows while additive increase gives all the same gain', 'Larger flows are always blocked', 'Each flow gets a reserved lane', 'Routers split bandwidth equally by themselves'], 0, 'Compare absolute loss on a big window with the equal increase.', 'A larger window loses more in absolute terms when halved, while all flows add the same amount, so the gap shrinks over time (Chiu and Jain).'),
      // l11
      q('lab-networks.l11', 1, 1, 'What does DNS do?', ['Resolves names to IP addresses', 'Encrypts web traffic between browsers and servers', 'Corrects bit errors', 'Assigns Ethernet frames'], 0, 'It is the phone book.', 'DNS translates human-readable names to IP addresses.'),
      q('lab-networks.l11', 2, 1, 'What did DNS replace?', ['A single hand-edited HOSTS.TXT file', 'The Transmission Control Protocol for reliable delivery', 'Ethernet', 'The URL'], 0, 'It could not scale.', 'DNS replaced the flat HOSTS.TXT file with a hierarchical, delegated system.'),
      q('lab-networks.l11', 3, 2, 'A resolver has just looked up a name and the answer has a TTL of 300 seconds. What can it do for the next 300 seconds?', ['Answer from its cache without asking again', 'Ask the root server every time', 'Refuse all queries', 'Change the record itself'], 0, 'TTL means time to live.', 'The TTL tells resolvers how long they may reuse an answer, saving time and load on upstream servers.'),
      q('lab-networks.l11', 4, 3, 'Why does a hierarchical, delegated design scale better than one central list?', ['Each level manages only its own part, and caching reduces load on the top', 'Everyone can edit the root zone', 'It removes the need for names', 'It needs fewer servers than any alternative'], 0, 'Who holds the data at each level?', 'Delegation spreads responsibility and storage across many operators, and caching keeps queries away from the root.'),
      // l12
      q('lab-networks.l12', 1, 1, 'What does TLS provide for a connection?', ['Encryption and authentication', 'Only faster routing of packets across the core', 'Packet reordering', 'Bandwidth guarantees'], 0, 'It is what makes HTTPS secure.', 'TLS provides confidentiality via encryption and authentication of the server.'),
      q('lab-networks.l12', 2, 1, 'Whose 1976 work on public-key key exchange underpins the TLS handshake?', ['Diffie and Hellman', 'Cerf and Kahn, authors of TCP/IP', 'Hodgkin and Huxley, of nerve models', 'Nyquist and Shannon'], 0, 'New Directions in Cryptography.', 'Diffie and Hellman introduced public-key key exchange in 1976.'),
      q('lab-networks.l12', 3, 2, 'Why does TLS use public-key methods only to agree a session key and then switch to symmetric encryption for the data?', ['Symmetric encryption is much faster for bulk data', 'Public-key encryption cannot be used at all', 'Symmetric keys are never secret', 'It avoids certificates'], 0, 'Consider the cost of encrypting large amounts of data.', 'Public-key operations are slow, so they set up a shared symmetric key which is then used efficiently for the data.'),
      q('lab-networks.l12', 4, 3, 'A site shows a valid certificate and the padlock. What does this prove?', ['You reached the named server over an encrypted connection, but not that the site is honest', 'The site owner is trustworthy', 'The site has no malware', 'No one can ever see you visit it'], 0, 'Authentication is not the same as trust.', 'A valid certificate authenticates the server\'s identity and enables encryption; it does not vouch for the site\'s intentions.'),
      // l13
      q('lab-networks.l13', 1, 1, 'Who invented the World Wide Web in 1990?', ['Tim Berners-Lee', 'Robert Metcalfe of Xerox', 'Vint Cerf of Stanford', 'Radia Perlman of DEC'], 0, 'He defined HTTP, HTML and the URL.', 'Tim Berners-Lee built the Web as an application-layer system atop TCP/IP.'),
      q('lab-networks.l13', 2, 1, 'What problem does the Spanning Tree Protocol solve?', ['Loops in bridged local networks', 'Name resolution', 'Packet encryption', 'IP address exhaustion'], 0, 'It disables redundant links.', 'Radia Perlman\'s protocol makes bridged LANs loop-free by blocking redundant links.'),
      q('lab-networks.l13', 3, 2, 'Metcalfe\'s Law says network value is roughly proportional to n squared. If the number of users doubles, by roughly what factor does the value rise?', ['2', '4', '8', '16'], 1, 'Square the factor of 2.', 'Doubling n multiplies n squared by 4.'),
      q('lab-networks.l13', 4, 3, 'Why was the Web able to spread so quickly on the existing Internet?', ['It needed no changes to the network core, since it ran on top of TCP/IP at the edges', 'It replaced IP completely', 'It required new routers in every country', 'It only worked on one operating system'], 0, 'Think about the end-to-end principle.', 'Because the Web was just an application on TCP/IP, anyone could deploy servers and browsers without changing the network itself.'),
    ],
  },
};
