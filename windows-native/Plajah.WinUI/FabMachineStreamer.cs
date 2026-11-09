// One open machine for Plajah Build: a serial port or a raw TCP socket (ESP3D / FluidNC telnet) with a
// reader that splits replies into lines, GRBL status polling, and the streaming loops. The algorithms
// mirror services/fab/protocol.ts (unit-tested in tests/bridge.test.ts); keep the two in step.
//
// Safety rules enforced here as well as in the page:
//  - a laser / plasma job needs the hazard acknowledgements, and an unhomed program needs the person to
//    confirm homing/limits/zero, or it is refused;
//  - if the link drops the job ends as "disconnected" and the connection is gone; nothing resumes on
//    its own, the person must reopen and start again;
//  - stop is hold-then-soft-reset on GRBL (keeps position), quick stop plus heaters/laser off on Marlin.

using System;
using System.IO;
using System.Linq;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace Plajah.WinUI;

internal sealed class FabMachineStreamer : IDisposable
{
    public string Id { get; }
    public string Flavor { get; }
    public bool JobRunning => _job is not null;

    private readonly Stream _stream;
    private readonly IDisposable? _owner;
    private readonly Action<string, object> _post;
    private readonly SemaphoreSlim _write = new(1, 1);
    private Channel<string> _lines = Channel.CreateUnbounded<string>();
    private readonly CancellationTokenSource _life = new();
    private CancellationTokenSource? _job;
    private volatile bool _paused;
    private volatile bool _closed;

    private FabMachineStreamer(string id, string flavor, Stream stream, IDisposable? owner, Action<string, object> post)
    {
        Id = id; Flavor = flavor; _stream = stream; _owner = owner; _post = post;
        _ = Task.Run(ReadLoop);
        if (Flavor == "grbl") _ = Task.Run(PollLoop);
    }

    public static FabMachineStreamer OpenSerial(string id, string flavor, string port, int baud, Action<string, object> post)
        => new(id, flavor, FabSerialPort.Open(port, baud), null, post);

    public static async Task<FabMachineStreamer> OpenTcpAsync(string id, string flavor, string host, int port, Action<string, object> post)
    {
        var client = new TcpClient { NoDelay = true };
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try { await client.ConnectAsync(host, port, cts.Token); }
        catch (Exception e) { client.Dispose(); throw new IOException($"Could not reach {host}:{port} ({e.Message}). Check the address and that the controller's telnet/TCP server is on."); }
        return new FabMachineStreamer(id, flavor, client.GetStream(), client, post);
    }

    // ---------- reading ----------
    private async Task ReadLoop()
    {
        var buf = new byte[4096]; var sb = new StringBuilder();
        try
        {
            while (!_life.IsCancellationRequested)
            {
                int n = await _stream.ReadAsync(buf.AsMemory(0, buf.Length), _life.Token);
                if (n == 0) { if (_owner is TcpClient) throw new IOException("closed"); continue; } // serial: read timeout with no data
                for (int i = 0; i < n; i++)
                {
                    char c = (char)buf[i];
                    if (c == '\n') { OnLine(sb.ToString().TrimEnd('\r')); sb.Clear(); }
                    else if (c != '\r' || sb.Length > 0) sb.Append(c);
                    if (sb.Length > 1024) { OnLine(sb.ToString()); sb.Clear(); }
                }
            }
        }
        catch (Exception) when (_life.IsCancellationRequested) { }
        catch (Exception)
        {
            // Unplugged, powered off or the socket dropped. End any job; never resume it.
            var during = _job is not null;
            _closed = true; _lines.Writer.TryComplete(new IOException("disconnected"));
            _post("FAB_MACHINE_DISCONNECTED", new { id = Id, duringJob = during });
        }
    }

    private void OnLine(string line)
    {
        var t = line.Trim(); if (t.Length == 0) return;
        if (t.StartsWith('<') && t.EndsWith('>')) { _post("FAB_MACHINE_STATUS", new { id = Id, raw = t }); return; }
        if (!t.StartsWith("ok", StringComparison.OrdinalIgnoreCase)) _post("FAB_MACHINE_LINE", new { id = Id, line = t });
        _lines.Writer.TryWrite(t);
    }

    private async Task PollLoop()
    {
        while (!_life.IsCancellationRequested && !_closed)
        {
            try { await Task.Delay(_job is null ? 1000 : 250, _life.Token); await WriteRawAsync(0x3F); }
            catch { return; }
        }
    }

    // ---------- writing ----------
    private async Task WriteLineAsync(string line)
    {
        var bytes = Encoding.ASCII.GetBytes(line + "\n");
        await _write.WaitAsync();
        try { await _stream.WriteAsync(bytes); await _stream.FlushAsync(); } finally { _write.Release(); }
    }

    private async Task WriteRawAsync(byte b)
    {
        await _write.WaitAsync();
        try { await _stream.WriteAsync(new[] { b }); await _stream.FlushAsync(); } finally { _write.Release(); }
    }

    // ---------- control ----------
    public async Task RealtimeAsync(string cmd)
    {
        if (Flavor == "grbl")
        {
            byte? b = cmd switch { "status" => 0x3F, "hold" => 0x21, "resume" => 0x7E, "reset" => 0x18, _ => null };
            if (b is byte v) await WriteRawAsync(v);
            return;
        }
        if (cmd == "hold") _paused = true;
        else if (cmd == "resume") _paused = false;
        else if (cmd == "reset") await StopAsync();
    }

    public async Task StopAsync()
    {
        _job?.Cancel(); _paused = false;
        if (_closed) return;
        try
        {
            if (Flavor == "grbl") { await WriteRawAsync(0x21); await Task.Delay(300); await WriteRawAsync(0x18); }
            else foreach (var l in new[] { "M410", "M5", "M104 S0", "M140 S0", "M107" }) await WriteLineAsync(l);
        }
        catch { /* link already gone */ }
    }

    // ---------- streaming ----------
    public static string[] CleanLines(string gcode) => gcode.Split('\n')
        .Select(l => Regex.Replace(Regex.Replace(l, ";.*$", ""), @"\(.*?\)", "").Trim())
        .Where(l => l.Length > 0 && l != "%").ToArray();

    public static int Checksum(string s) { int c = 0; foreach (var ch in s) c ^= ch & 0xFF; return c; }
    public static string NumberLine(int n, string line) { var body = $"N{n} {line}"; return $"{body}*{Checksum(body)}"; }
    public static bool ProgramHomes(string gcode) => Regex.IsMatch(gcode, @"^\s*(?:N\d+\s+)?(G28\b|\$H\b)", RegexOptions.Multiline | RegexOptions.IgnoreCase);

    public sealed record Result(bool ok, string message, int sent, int total, int resends, string state);

    public async Task<Result> RunAsync(string gcode, bool energetic, bool hazardsAcknowledged, bool homingConfirmed)
    {
        if (_closed) return new(false, "The machine is not connected. Reconnect, check it, then start again.", 0, 0, 0, "disconnected");
        if (_job is not null) return new(false, "A job is already running on this machine.", 0, 0, 0, "error");
        if (!hazardsAcknowledged) return new(false, energetic ? "Refused: acknowledge the laser / plasma safety items first." : "Refused: acknowledge the safety items first.", 0, 0, 0, "error");
        if (!homingConfirmed && !ProgramHomes(gcode)) return new(false, "Refused: confirm the machine is homed, limits are on and work zero is set.", 0, 0, 0, "error");

        // Fresh reply queue: stale "ok"s from before the job must not advance it.
        _lines = Channel.CreateUnbounded<string>(); _paused = false;
        var cts = CancellationTokenSource.CreateLinkedTokenSource(_life.Token); _job = cts;
        var lines = CleanLines(gcode);
        try
        {
            return Flavor == "grbl" ? await StreamGrbl(lines, cts.Token) : await StreamMarlin(lines, Flavor == "marlin", cts.Token);
        }
        catch (OperationCanceledException) { return new(false, "Stopped. Check the machine before starting again.", 0, lines.Length, 0, "stopped"); }
        catch (Exception) when (_closed) { return new(false, "The connection to the machine dropped. The job was not resumed; check the machine and start again deliberately.", 0, lines.Length, 0, "disconnected"); }
        finally { _job = null; cts.Dispose(); }
    }

    private DateTime _lastProgress;
    private void Progress(int done, int total)
    {
        var now = DateTime.UtcNow; if (done != total && (now - _lastProgress).TotalMilliseconds < 100) return; _lastProgress = now;
        _post("FAB_MACHINE_PROGRESS", new { id = Id, done, total });
    }

    private static readonly Regex ResendRx = new(@"^(?:resend:?|rs)\s*N?(\d+)", RegexOptions.IgnoreCase);

    private async Task<Result> StreamMarlin(string[] lines, bool numbered, CancellationToken ct)
    {
        int total = lines.Length, i = 0, resends = 0, same = 0, last = -1;
        if (numbered)
        {
            await WriteLineAsync(NumberLine(0, "M110 N0"));
            for (;;) { var r = await _lines.Reader.ReadAsync(ct); if (r.StartsWith("ok", StringComparison.OrdinalIgnoreCase)) break; if (IsFatal(r)) return new(false, $"The machine reported \"{r}\" before the job started.", 0, total, 0, "error"); }
        }
        while (i < total)
        {
            while (_paused) await Task.Delay(50, ct);
            ct.ThrowIfCancellationRequested();
            await WriteLineAsync(numbered ? NumberLine(i + 1, lines[i]) : lines[i]);
            int? resendTo = null;
            for (;;)
            {
                var r = await _lines.Reader.ReadAsync(ct);
                var m = ResendRx.Match(r);
                if (m.Success) { resendTo = int.Parse(m.Groups[1].Value); continue; }
                if (r.StartsWith("ok", StringComparison.OrdinalIgnoreCase)) break;
                if (r.StartsWith("error", StringComparison.OrdinalIgnoreCase) && Regex.IsMatch(r, "checksum|line ?number", RegexOptions.IgnoreCase)) continue;
                if (r.StartsWith("alarm", StringComparison.OrdinalIgnoreCase)) return new(false, $"The machine raised \"{r}\" at line {i + 1}.", i, total, resends, "alarm");
                if (IsFatal(r)) return new(false, $"The machine reported \"{r}\" at line {i + 1}: {lines[i]}", i, total, resends, "error");
            }
            if (resendTo is int rt && numbered)
            {
                int target = Math.Max(0, rt - 1); resends++;
                same = target == last ? same + 1 : 1; last = target;
                if (same > 10) return new(false, $"Line {rt} kept arriving garbled. Check the USB cable and baud rate.", i, total, resends, "error");
                i = target; continue;
            }
            i++; Progress(i, total);
        }
        return new(true, $"Sent {total} lines{(resends > 0 ? $" ({resends} resent)" : "")}.", total, total, resends, "done");
    }

    private static bool IsFatal(string r) => r.StartsWith("error", StringComparison.OrdinalIgnoreCase) || r.StartsWith("!!");

    private async Task<Result> StreamGrbl(string[] lines, CancellationToken ct)
    {
        const int Cap = 127; int total = lines.Length, next = 0, acked = 0, used = 0;
        var inflight = new System.Collections.Generic.Queue<int>();
        foreach (var l in lines) if (l.Length + 1 > Cap) return new(false, $"A line is longer than GRBL's {Cap}-byte buffer: {l[..Math.Min(40, l.Length)]}", 0, total, 0, "error");
        while (acked < total)
        {
            while (next < total && used + lines[next].Length + 1 <= Cap)
            {
                ct.ThrowIfCancellationRequested();
                await WriteLineAsync(lines[next]); inflight.Enqueue(lines[next].Length + 1); used += lines[next].Length + 1; next++;
            }
            var r = await _lines.Reader.ReadAsync(ct);
            bool ok = r.StartsWith("ok", StringComparison.OrdinalIgnoreCase), err = r.StartsWith("error", StringComparison.OrdinalIgnoreCase);
            if (ok || err)
            {
                if (inflight.Count > 0) used -= inflight.Dequeue(); acked++;
                if (err) return new(false, $"GRBL rejected line {acked} ({lines[acked - 1]}): {r}. Stopped; check the program before running again.", acked, total, 0, "error");
                Progress(acked, total);
            }
            else if (r.StartsWith("alarm", StringComparison.OrdinalIgnoreCase))
                return new(false, $"GRBL raised {r} after {acked} lines. Clear the cause, home ($H) and unlock ($X) before running again.", acked, total, 0, "alarm");
        }
        return new(true, $"Sent {total} lines.", total, total, 0, "done");
    }

    public void Dispose()
    {
        _closed = true; _life.Cancel(); _job?.Cancel();
        try { _stream.Dispose(); } catch { }
        try { _owner?.Dispose(); } catch { }
    }
}
