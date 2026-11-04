using System;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;

namespace Plajah.WinUI;

/// <summary>
/// Sends the lighting board's Art-Net and sACN packets, which a web page cannot do itself. The page
/// builds the bytes; this only checks they can go nowhere but a lighting port on the local network.
/// </summary>
internal static class LightingUdpSender
{
    private const int ArtNetPort = 6454;
    private const int SacnPort = 5568;
    private const int MaxPacket = 638;

    private static readonly Lazy<UdpClient> Socket = new(() =>
    {
        var udp = new UdpClient(AddressFamily.InterNetwork) { EnableBroadcast = true };
        udp.Client.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.MulticastTimeToLive, 8);
        return udp;
    });

    public static void Send(JsonElement message)
    {
        if (!message.TryGetProperty("host", out var hostValue) || !IPAddress.TryParse(hostValue.GetString(), out var address)) return;
        if (!message.TryGetProperty("port", out var portValue) || !portValue.TryGetInt32(out var port)) return;
        if (port is not (ArtNetPort or SacnPort) || !IsLocalTarget(address)) return;
        if (!message.TryGetProperty("data", out var dataValue) || !dataValue.TryGetBytesFromBase64(out var data)) return;
        if (data is null || data.Length == 0 || data.Length > MaxPacket) return;
        try
        {
            Socket.Value.Send(data, data.Length, new IPEndPoint(address, port));
        }
        catch (SocketException)
        {
            // No route (cable out, Wi-Fi down). The next frame tries again; a show must not stop for it.
        }
    }

    private static bool IsLocalTarget(IPAddress address)
    {
        if (address.AddressFamily != AddressFamily.InterNetwork) return false;
        var b = address.GetAddressBytes();
        return b[0] == 10
            || b[0] == 2                                            // Art-Net's own 2.x.x.x range
            || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
            || (b[0] == 192 && b[1] == 168)
            || (b[0] == 169 && b[1] == 254)
            || (b[0] == 239 && b[1] == 255)                         // sACN multicast
            || address.Equals(IPAddress.Broadcast);
    }
}
