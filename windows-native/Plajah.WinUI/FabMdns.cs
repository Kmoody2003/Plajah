// mDNS / DNS-SD discovery of maker machines on the local network: OctoPrint (_octoprint._tcp),
// Moonraker/Klipper (_moonraker._tcp), and FluidNC / ESP3D boards (they advertise _http._tcp under
// their hostname). Our own small resolver: one-shot "legacy unicast" PTR queries (RFC 6762 s6.7) sent
// from an ephemeral port on every IPv4 interface, so we never fight Windows or Bonjour for port 5353.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

namespace Plajah.WinUI;

internal static class FabMdns
{
    public sealed record Device(string name, string host, int port, string service);

    private static readonly string[] Services = { "_octoprint._tcp.local", "_moonraker._tcp.local", "_http._tcp.local", "_esp3d._tcp.local" };
    private static readonly IPEndPoint Group = new(IPAddress.Parse("224.0.0.251"), 5353);

    public static async Task<List<Device>> ScanAsync(int milliseconds = 2000)
    {
        var ptr = new List<(string service, string instance)>();
        var srv = new Dictionary<string, (string target, int port)>(StringComparer.OrdinalIgnoreCase);
        var addr = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var query = BuildQuery(Services);
        var clients = new List<UdpClient>();
        foreach (var local in LocalIPv4())
        {
            try
            {
                var c = new UdpClient(new IPEndPoint(local, 0));
                c.Client.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.MulticastInterface, local.GetAddressBytes());
                c.Client.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.MulticastTimeToLive, 255);
                await c.SendAsync(query, query.Length, Group);
                clients.Add(c);
            }
            catch { /* interface without multicast */ }
        }
        var until = DateTime.UtcNow.AddMilliseconds(milliseconds);
        var receives = clients.Select(async c =>
        {
            while (DateTime.UtcNow < until)
            {
                var receive = c.ReceiveAsync();
                var done = await Task.WhenAny(receive, Task.Delay(until - DateTime.UtcNow));
                if (done != receive) break;
                try { Parse((await receive).Buffer, ptr, srv, addr); } catch { /* malformed packet */ }
            }
        }).ToArray();
        await Task.WhenAll(receives);
        foreach (var c in clients) c.Dispose();

        var found = new List<Device>();
        foreach (var (service, instance) in ptr.Distinct())
        {
            if (!srv.TryGetValue(instance, out var s)) continue;
            var host = addr.TryGetValue(s.target, out var ip) ? ip : s.target.TrimEnd('.');
            var label = instance.Split('.')[0];
            var kind = service.StartsWith("_octoprint") ? "octoprint" : service.StartsWith("_moonraker") ? "moonraker" : service.StartsWith("_esp3d") ? "esp3d" : null;
            if (kind is null)
            {
                // _http is everything with a web page; keep only the CNC/laser controllers we can stream to.
                var hay = (instance + " " + s.target).ToLowerInvariant();
                kind = hay.Contains("fluidnc") ? "fluidnc" : hay.Contains("esp3d") ? "esp3d" : hay.Contains("grblhal") ? "fluidnc" : null;
                if (kind is null) continue;
            }
            // Controllers stream raw G-code over telnet (port 23); printers keep their web API port.
            var port = kind is "fluidnc" or "esp3d" ? 23 : s.port;
            if (!found.Any(d => d.host == host && d.service == kind)) found.Add(new Device(label, host, port, kind));
        }
        return found;
    }

    private static IEnumerable<IPAddress> LocalIPv4()
    {
        foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback || !ni.SupportsMulticast) continue;
            foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                if (ua.Address.AddressFamily == AddressFamily.InterNetwork) yield return ua.Address;
        }
    }

    private static byte[] BuildQuery(string[] names)
    {
        var b = new List<byte> { 0, 0, 0, 0, 0, (byte)names.Length, 0, 0, 0, 0, 0, 0 };
        foreach (var n in names)
        {
            foreach (var label in n.Split('.')) { var l = Encoding.UTF8.GetBytes(label); b.Add((byte)l.Length); b.AddRange(l); }
            b.Add(0);
            b.AddRange(new byte[] { 0, 12, 0x80, 1 }); // PTR, class IN with the unicast-response bit
        }
        return b.ToArray();
    }

    private static void Parse(byte[] p, List<(string, string)> ptr, Dictionary<string, (string, int)> srv, Dictionary<string, string> addr)
    {
        if (p.Length < 12) return;
        int qd = U16(p, 4), an = U16(p, 6), ns = U16(p, 8), ar = U16(p, 10); int o = 12;
        for (int i = 0; i < qd; i++) { ReadName(p, ref o); o += 4; }
        for (int i = 0; i < an + ns + ar && o < p.Length; i++)
        {
            var name = ReadName(p, ref o); int type = U16(p, o), len = U16(p, o + 8); int rd = o + 10; o = rd + len;
            if (o > p.Length) return;
            if (type == 12) { int r = rd; var target = ReadName(p, ref r); ptr.Add((name.ToLowerInvariant(), target)); }
            else if (type == 33) { int r = rd + 6; var target = ReadName(p, ref r); srv[name] = (target, U16(p, rd + 4)); }
            else if (type == 1 && len == 4) addr[name] = $"{p[rd]}.{p[rd + 1]}.{p[rd + 2]}.{p[rd + 3]}";
        }
    }

    private static int U16(byte[] p, int o) => o + 1 < p.Length ? (p[o] << 8) | p[o + 1] : 0;

    private static string ReadName(byte[] p, ref int o)
    {
        var labels = new List<string>(); int jumps = 0; int pos = o; bool jumped = false;
        while (pos < p.Length)
        {
            int len = p[pos];
            if (len == 0) { pos++; break; }
            if ((len & 0xC0) == 0xC0)
            {
                if (pos + 1 >= p.Length || ++jumps > 20) break;
                int ptr = ((len & 0x3F) << 8) | p[pos + 1];
                if (!jumped) o = pos + 2; jumped = true; pos = ptr; continue;
            }
            pos++; if (pos + len > p.Length) break;
            labels.Add(Encoding.UTF8.GetString(p, pos, len)); pos += len;
        }
        if (!jumped) o = pos;
        return string.Join('.', labels);
    }
}
