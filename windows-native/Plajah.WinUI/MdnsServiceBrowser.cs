using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Plajah.WinUI;

/// <summary>
/// A small DNS-SD browser (RFC 6763 over multicast DNS, RFC 6762) — "what is advertising
/// _omt._tcp on this network, at which host and port?". Used for OMT discovery and as the
/// NDI fallback when the NDI runtime is not installed. No WinUI dependencies.
///
/// It listens on 5353 the way every mDNS stack does (shared with Bonjour), sends ordinary
/// multicast queries on every usable IPv4 interface, and parses PTR / SRV / TXT / A records,
/// including DNS name compression, so every answer carries a real host and port rather than
/// an assumed one.
/// </summary>
internal static class MdnsServiceBrowser
{
    public sealed record Instance(string Name, string Host, int Port, IReadOnlyList<IPAddress> Addresses, IReadOnlyDictionary<string, string> Txt);

    private static readonly IPAddress Group = IPAddress.Parse("224.0.0.251");
    private const int MdnsPort = 5353;

    // ── public API ───────────────────────────────────────────────────────────
    /// <param name="serviceType">e.g. "_omt._tcp.local"</param>
    public static async Task<List<Instance>> BrowseAsync(string serviceType, int timeoutMs = 1500, CancellationToken ct = default)
    {
        serviceType = serviceType.Trim('.').ToLowerInvariant();
        var state = new State(serviceType);
        var sockets = OpenSockets();
        if (sockets.Count == 0) return new List<Instance>();

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeoutMs);
        var receivers = sockets.Select(s => Task.Run(() => ReceiveLoop(s, state, cts.Token))).ToList();
        try
        {
            // Query now, again at 250 ms and 750 ms (mDNS asks for repeats; packets get lost on Wi-Fi).
            var started = Environment.TickCount64;
            await SendAll(sockets, BuildQuery(serviceType, 12));
            await Delay(250, cts.Token);
            await SendAll(sockets, BuildQuery(serviceType, 12));
            await Delay(500, cts.Token);
            await SendAll(sockets, BuildQuery(serviceType, 12));

            // Anything that answered with a name but no address yet: ask for its SRV/TXT and its host's A record.
            var lastNew = Environment.TickCount64;
            int lastCount = state.InstanceCount;
            while (!cts.IsCancellationRequested)
            {
                foreach (var q in state.FollowUps()) await SendAll(sockets, q);
                await Delay(200, cts.Token);
                if (state.InstanceCount != lastCount) { lastCount = state.InstanceCount; lastNew = Environment.TickCount64; }
                // Done early: everything resolved and nothing new for 500 ms (after the first 800 ms).
                if (Environment.TickCount64 - started > 800 && Environment.TickCount64 - lastNew > 500 && state.AllResolved) break;
            }
        }
        catch (OperationCanceledException) { }
        finally
        {
            cts.Cancel();
            foreach (var s in sockets) { try { s.Close(); } catch { } }
            try { await Task.WhenAll(receivers).WaitAsync(TimeSpan.FromMilliseconds(300)); } catch { }
        }
        return state.Results();
    }

    private static async Task Delay(int ms, CancellationToken ct) { try { await Task.Delay(ms, ct); } catch (OperationCanceledException) { } }

    // ── sockets: one per usable IPv4 interface, all sharing 5353 ─────────────
    private static List<UdpClient> OpenSockets()
    {
        var list = new List<UdpClient>();
        foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
        {
            try
            {
                if (ni.OperationalStatus != OperationalStatus.Up || !ni.SupportsMulticast) continue;
                if (ni.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel) continue;
                var addr = ni.GetIPProperties().UnicastAddresses
                    .FirstOrDefault(a => a.Address.AddressFamily == AddressFamily.InterNetwork && !a.Address.ToString().StartsWith("169.254."))?.Address;
                if (addr == null) continue;

                var udp = new UdpClient(AddressFamily.InterNetwork);
                udp.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                try { udp.Client.Bind(new IPEndPoint(IPAddress.Any, MdnsPort)); }
                catch { udp.Client.Bind(new IPEndPoint(IPAddress.Any, 0)); }   // 5353 exclusively held: replies still come back to us
                udp.JoinMulticastGroup(Group, addr);
                udp.Client.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.MulticastInterface, addr.GetAddressBytes());
                udp.MulticastLoopback = true;
                udp.Client.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.MulticastTimeToLive, 255);
                list.Add(udp);
            }
            catch { /* an interface we can't use — skip it */ }
        }
        return list;
    }

    private static async Task SendAll(List<UdpClient> sockets, byte[] packet)
    {
        var ep = new IPEndPoint(Group, MdnsPort);
        foreach (var s in sockets) { try { await s.SendAsync(packet, packet.Length, ep); } catch { } }
    }

    private static async Task ReceiveLoop(UdpClient s, State state, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var r = await s.ReceiveAsync(ct);
                state.Ingest(r.Buffer);
            }
            catch (OperationCanceledException) { break; }
            catch (ObjectDisposedException) { break; }
            catch (SocketException) { if (ct.IsCancellationRequested) break; }
            catch { /* malformed packet — ignore */ }
        }
    }

    // ── per-browse state ─────────────────────────────────────────────────────
    private sealed class State
    {
        private readonly object _gate = new();
        private readonly string _service;
        private readonly Dictionary<string, string> _instances = new(StringComparer.OrdinalIgnoreCase);              // fqdn -> display name
        private readonly Dictionary<string, (int port, string target)> _srv = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, Dictionary<string, string>> _txt = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, List<IPAddress>> _a = new(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> _asked = new(StringComparer.OrdinalIgnoreCase);

        public State(string service) { _service = service; }

        public int InstanceCount { get { lock (_gate) return _instances.Count; } }
        public bool AllResolved { get { lock (_gate) return _instances.Keys.All(f => _srv.TryGetValue(f, out var s) && _a.ContainsKey(s.target)); } }

        public void Ingest(byte[] b)
        {
            if (b.Length < 12) return;
            int qd = U16(b, 4), an = U16(b, 6), ns = U16(b, 8), ar = U16(b, 10);
            int p = 12;
            for (int i = 0; i < qd; i++) { ReadName(b, ref p); p += 4; }
            lock (_gate)
            {
                for (int i = 0; i < an + ns + ar && p < b.Length; i++)
                {
                    string name = ReadName(b, ref p);
                    if (p + 10 > b.Length) break;
                    int type = U16(b, p), ttl = (int)U32(b, p + 4), rdlen = U16(b, p + 8);
                    p += 10;
                    int rd = p; p += rdlen;
                    if (p > b.Length) break;
                    if (ttl == 0) continue;                                   // goodbye record
                    switch (type)
                    {
                        case 12 when name.Equals(_service, StringComparison.OrdinalIgnoreCase):
                        {
                            int q = rd; var fqdn = ReadName(b, ref q);
                            var suffix = "." + _service;
                            var display = fqdn.EndsWith(suffix, StringComparison.OrdinalIgnoreCase) ? fqdn[..^suffix.Length] : fqdn;
                            _instances[fqdn] = display;
                            break;
                        }
                        case 33 when rdlen >= 7:
                        {
                            int port = U16(b, rd + 4); int q = rd + 6; var target = ReadName(b, ref q);
                            _srv[name] = (port, target);
                            break;
                        }
                        case 16:
                        {
                            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                            int q = rd;
                            while (q < rd + rdlen) { int l = b[q++]; if (l == 0 || q + l > rd + rdlen) break; var kv = Encoding.UTF8.GetString(b, q, l); q += l; int eq = kv.IndexOf('='); if (eq > 0) d[kv[..eq]] = kv[(eq + 1)..]; }
                            _txt[name] = d;
                            break;
                        }
                        case 1 when rdlen == 4:
                        {
                            var ip = new IPAddress(new ReadOnlySpan<byte>(b, rd, 4));
                            if (!_a.TryGetValue(name, out var l)) _a[name] = l = new List<IPAddress>();
                            if (!l.Contains(ip)) l.Add(ip);
                            break;
                        }
                    }
                }
            }
        }

        /// <summary>Queries for pieces an instance answered without: its SRV/TXT, then its host's address.</summary>
        public List<byte[]> FollowUps()
        {
            var qs = new List<byte[]>();
            lock (_gate)
            {
                foreach (var fqdn in _instances.Keys)
                {
                    if (!_srv.ContainsKey(fqdn) && _asked.Add("srv:" + fqdn)) { qs.Add(BuildQuery(fqdn, 33)); qs.Add(BuildQuery(fqdn, 16)); }
                    if (_srv.TryGetValue(fqdn, out var s) && !_a.ContainsKey(s.target) && _asked.Add("a:" + s.target)) qs.Add(BuildQuery(s.target, 1));
                }
            }
            return qs;
        }

        public List<Instance> Results()
        {
            lock (_gate)
            {
                var res = new List<Instance>();
                foreach (var (fqdn, display) in _instances)
                {
                    _srv.TryGetValue(fqdn, out var s);
                    var addrs = s.target != null && _a.TryGetValue(s.target, out var l) ? l.ToList() : new List<IPAddress>();
                    _txt.TryGetValue(fqdn, out var txt);
                    var host = (s.target ?? "").TrimEnd('.');
                    res.Add(new Instance(display, host, s.port, addrs, txt ?? new Dictionary<string, string>()));
                }
                return res.OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase).ToList();
            }
        }
    }

    // ── DNS wire format ──────────────────────────────────────────────────────
    private static int U16(byte[] b, int o) => (b[o] << 8) | b[o + 1];
    private static uint U32(byte[] b, int o) => (uint)((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);

    /// <summary>Reads a (possibly compressed) DNS name; advances <paramref name="p"/> past it in the original position.</summary>
    internal static string ReadName(byte[] b, ref int p)
    {
        var sb = new StringBuilder();
        int pos = p; bool jumped = false; int hops = 0;
        while (pos < b.Length)
        {
            int len = b[pos];
            if (len == 0) { pos++; break; }
            if ((len & 0xC0) == 0xC0)
            {
                if (pos + 1 >= b.Length || ++hops > 20) break;
                int ptr = ((len & 0x3F) << 8) | b[pos + 1];
                if (!jumped) { p = pos + 2; jumped = true; }
                pos = ptr;
                continue;
            }
            pos++;
            if (pos + len > b.Length) break;
            if (sb.Length > 0) sb.Append('.');
            sb.Append(Encoding.UTF8.GetString(b, pos, len));
            pos += len;
        }
        if (!jumped) p = pos;
        return sb.ToString();
    }

    internal static byte[] BuildQuery(string name, ushort type)
    {
        var ms = new System.IO.MemoryStream();
        void W16(int v) { ms.WriteByte((byte)(v >> 8)); ms.WriteByte((byte)v); }
        W16(0); W16(0); W16(1); W16(0); W16(0); W16(0);                  // id, flags, 1 question
        foreach (var label in name.Split('.'))
        {
            var bytes = Encoding.UTF8.GetBytes(label);
            ms.WriteByte((byte)Math.Min(63, bytes.Length)); ms.Write(bytes, 0, Math.Min(63, bytes.Length));
        }
        ms.WriteByte(0);
        W16(type); W16(1);                                               // QTYPE, QCLASS IN (multicast reply)
        return ms.ToArray();
    }
}
