using System;
using System.Buffers.Binary;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Plajah.WinUI;

/// <summary>
/// Chora's native audio engine (rust/plajah-audio-host) on a loopback WebSocket. The page's worker
/// connects straight here, so audio chunks never cross the UI thread or the WebView2 message bridge.
/// One socket is one engine session, sized by the sample rate in its URL; closing it frees the session.
/// </summary>
internal static class NativeAudioBridge
{
    private const string Dll = "plajah_audio_host.dll";
    private const uint Abi = 1;
    private const int RowDoubles = 7;
    private const int MaxChunkBytes = 16 + 2048 * 4;

    [DllImport(Dll)] private static extern uint pah_abi_version();
    [DllImport(Dll)] private static extern IntPtr pah_session_new(float sampleRate, uint threads);
    [DllImport(Dll)] private static extern void pah_session_free(IntPtr s);
    [DllImport(Dll)] private static extern uint pah_track_add(IntPtr s);
    [DllImport(Dll)] private static extern void pah_track_remove(IntPtr s, uint track);
    [DllImport(Dll)] private static extern void pah_clock(IntPtr s, double frame);
    [DllImport(Dll)] private static extern void pah_param(IntPtr s, uint track, uint id, float value);
    [DllImport(Dll)] private static extern void pah_note_on(IntPtr s, uint track, float note, float velocity, uint voice, double frame);
    [DllImport(Dll)] private static extern void pah_note_off(IntPtr s, uint track, uint voice, double frame);
    [DllImport(Dll)] private static extern void pah_all_off(IntPtr s, uint track, uint hard);
    [DllImport(Dll)] private static extern void pah_macro(IntPtr s, uint track, uint index, float value);
    [DllImport(Dll)] private static extern void pah_route(IntPtr s, uint track, uint index, uint source, uint dest, float depth, uint via);
    [DllImport(Dll)] private static extern void pah_mod_wheel(IntPtr s, uint track, float value);
    [DllImport(Dll)] private static extern void pah_pitch_bend(IntPtr s, uint track, float value);
    [DllImport(Dll)] private static extern void pah_tempo(IntPtr s, uint track, float value);
    [DllImport(Dll)] private static extern void pah_expression(IntPtr s, uint track, uint voice, float bend, float pressure, float timbre);
    [DllImport(Dll)] private static extern unsafe uint pah_next_chunk(IntPtr s, byte* output, uint capacity, uint timeoutMs);

    private static readonly object Gate = new();
    private static TcpListener? _listener;
    private static string _token = "";

    /// <summary>Starts the listener once. The page falls back to its worklets when this says no.</summary>
    public static object Open()
    {
        lock (Gate)
        {
            try
            {
                if (pah_abi_version() != Abi) return new { available = false, error = "stale plajah_audio_host.dll" };
                if (_listener is null)
                {
                    _token = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
                    _listener = new TcpListener(IPAddress.Loopback, 0);
                    _listener.Start();
                    _ = Task.Run(AcceptLoop);
                }
                return new { available = true, port = ((IPEndPoint)_listener.LocalEndpoint).Port, token = _token };
            }
            catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException or BadImageFormatException or SocketException)
            {
                return new { available = false, error = ex.Message };
            }
        }
    }

    private static async Task AcceptLoop()
    {
        while (true)
        {
            var client = await _listener!.AcceptTcpClientAsync();
            _ = Task.Run(() => Serve(client));
        }
    }

    private static async Task Serve(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.NoDelay = true;
                var stream = client.GetStream();
                var (query, key) = await ReadRequest(stream);
                if (key is null || GetQuery(query, "t") != _token || !float.TryParse(GetQuery(query, "sr"), System.Globalization.CultureInfo.InvariantCulture, out var sampleRate) || sampleRate < 8000)
                {
                    await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"));
                    return;
                }
                var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
                await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"));

                using var socket = WebSocket.CreateFromStream(stream, isServer: true, subProtocol: null, keepAliveInterval: Timeout.InfiniteTimeSpan);
                var session = pah_session_new(sampleRate, (uint)Math.Max(1, Environment.ProcessorCount - 2));
                using var done = new CancellationTokenSource();
                var send = Task.Run(() => SendLoop(socket, session, done.Token));
                try { await ReceiveLoop(socket, session); }
                finally
                {
                    done.Cancel();
                    try { await send; } catch { /* the socket is already gone */ }
                    pah_session_free(session);
                }
            }
            catch (Exception ex) when (ex is IOException or WebSocketException or SocketException)
            {
                System.Diagnostics.Debug.WriteLine($"[NativeAudioBridge] {ex.Message}");
            }
        }
    }

    private static async Task SendLoop(WebSocket socket, IntPtr session, CancellationToken stop)
    {
        var buffer = new byte[MaxChunkBytes];
        while (!stop.IsCancellationRequested && socket.State == WebSocketState.Open)
        {
            int size = NextChunk(session, buffer);
            if (size > 0) await socket.SendAsync(buffer.AsMemory(0, size), WebSocketMessageType.Binary, true, stop);
        }
    }

    private static unsafe int NextChunk(IntPtr session, byte[] buffer)
    {
        fixed (byte* p = buffer) return (int)pah_next_chunk(session, p, (uint)buffer.Length, 20);
    }

    private static async Task ReceiveLoop(WebSocket socket, IntPtr session)
    {
        var buffer = new byte[1 << 20];
        while (socket.State == WebSocketState.Open)
        {
            int size = 0;
            ValueWebSocketReceiveResult r;
            do
            {
                r = await socket.ReceiveAsync(buffer.AsMemory(size), CancellationToken.None);
                if (r.MessageType == WebSocketMessageType.Close) return;
                size += r.Count;
            } while (!r.EndOfMessage && size < buffer.Length);
            Apply(session, buffer, size);
        }
    }

    /// <summary>Rows of seven doubles: op, track, then up to five arguments (nativeStream.ts).</summary>
    private static void Apply(IntPtr s, byte[] data, int size)
    {
        Span<double> a = stackalloc double[RowDoubles];
        for (int at = 0; at + RowDoubles * 8 <= size; at += RowDoubles * 8)
        {
            for (int i = 0; i < RowDoubles; i++) a[i] = BinaryPrimitives.ReadDoubleLittleEndian(data.AsSpan(at + i * 8));
            uint t = (uint)a[1];
            switch ((int)a[0])
            {
                case 0: pah_clock(s, a[2]); break;
                case 1: pah_track_add(s); break;
                case 2: pah_track_remove(s, t); break;
                case 3: pah_param(s, t, (uint)a[2], (float)a[3]); break;
                case 4: pah_note_on(s, t, (float)a[2], (float)a[3], (uint)a[4], a[5]); break;
                case 5: pah_note_off(s, t, (uint)a[2], a[3]); break;
                case 6: pah_all_off(s, t, (uint)a[2]); break;
                case 7: pah_macro(s, t, (uint)a[2], (float)a[3]); break;
                case 8: pah_route(s, t, (uint)a[2], (uint)a[3], (uint)a[4], (float)a[5], (uint)a[6]); break;
                case 9: pah_mod_wheel(s, t, (float)a[2]); break;
                case 10: pah_pitch_bend(s, t, (float)a[2]); break;
                case 11: pah_tempo(s, t, (float)a[2]); break;
                case 12: pah_expression(s, t, (uint)a[2], (float)a[3], (float)a[4], (float)a[5]); break;
            }
        }
    }

    private static async Task<(string Query, string? Key)> ReadRequest(NetworkStream stream)
    {
        var bytes = new byte[8192];
        int size = 0;
        while (size < bytes.Length)
        {
            int n = await stream.ReadAsync(bytes.AsMemory(size));
            if (n == 0) break;
            size += n;
            if (Encoding.ASCII.GetString(bytes, 0, size).Contains("\r\n\r\n")) break;
        }
        var lines = Encoding.ASCII.GetString(bytes, 0, size).Split("\r\n");
        var target = lines[0].Split(' ') is { Length: >= 2 } parts ? parts[1] : "";
        var q = target.IndexOf('?');
        string? key = null;
        foreach (var line in lines)
            if (line.StartsWith("Sec-WebSocket-Key:", StringComparison.OrdinalIgnoreCase)) key = line[18..].Trim();
        return (q < 0 ? "" : target[(q + 1)..], key);
    }

    private static string? GetQuery(string query, string name)
    {
        foreach (var pair in query.Split('&'))
            if (pair.StartsWith(name + "=")) return Uri.UnescapeDataString(pair[(name.Length + 1)..]);
        return null;
    }
}
