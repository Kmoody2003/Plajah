// FAB_MACHINE_* bridge messages from Plajah Build's Make tab (services/fab/sender.ts):
//   FAB_MACHINE_LIST  {requestId, scanLan}            -> FAB_MACHINE_LIST_RESULT {requestId, serial[], lan[]}
//   FAB_MACHINE_OPEN  {id, flavor, transport, port, baud | host, tcpPort} -> FAB_MACHINE_OPEN_RESULT {id, ok, error}
//   FAB_MACHINE_RUN   {id, gcode, safety}              -> FAB_MACHINE_PROGRESS*, FAB_MACHINE_DONE {id, ok, message, state, sent, total}
//   FAB_MACHINE_RT    {id, cmd: status|hold|resume|reset}
//   FAB_MACHINE_STOP  {id}     FAB_MACHINE_CLOSE {id}
// Pushed any time: FAB_MACHINE_STATUS {id, raw}, FAB_MACHINE_LINE {id, line}, FAB_MACHINE_DISCONNECTED {id, duringJob}.

using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace Plajah.WinUI;

internal sealed class FabMachineBridge
{
    private readonly Action<string, object> _post;
    private readonly ConcurrentDictionary<string, FabMachineStreamer> _open = new();

    public FabMachineBridge(Action<string, object> post) { _post = post; }

    private static string Str(JsonElement r, string k) => r.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
    private static int Int(JsonElement r, string k, int d) => r.TryGetProperty(k, out var v) && v.TryGetInt32(out var i) ? i : d;
    private static bool Bool(JsonElement r, string k) => r.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.True;

    public async Task HandleAsync(string type, JsonElement root)
    {
        var id = Str(root, "id");
        switch (type)
        {
            case "FAB_MACHINE_LIST":
            {
                var requestId = Str(root, "requestId");
                var serial = await Task.Run(FabSerialPort.List);
                var lan = Bool(root, "scanLan") ? await FabMdns.ScanAsync() : new();
                _post("FAB_MACHINE_LIST_RESULT", new { requestId, serial, lan });
                return;
            }
            case "FAB_MACHINE_OPEN":
            {
                try
                {
                    var flavor = Str(root, "flavor") is "grbl" or "klipper" ? Str(root, "flavor") : "marlin";
                    // One owner per port: a second open of the same COM port is refused by Windows anyway.
                    FabMachineStreamer s = Str(root, "transport") == "tcp"
                        ? await FabMachineStreamer.OpenTcpAsync(id, flavor, Str(root, "host"), Int(root, "tcpPort", 23), _post)
                        : await Task.Run(() => FabMachineStreamer.OpenSerial(id, flavor, Str(root, "port"), Int(root, "baud", 115200), _post));
                    _open[id] = s;
                    _post("FAB_MACHINE_OPEN_RESULT", new { id, ok = true });
                }
                catch (Exception e) { _post("FAB_MACHINE_OPEN_RESULT", new { id, ok = false, error = e.Message }); }
                return;
            }
            case "FAB_MACHINE_RUN":
            {
                if (!_open.TryGetValue(id, out var s)) { _post("FAB_MACHINE_DONE", new { id, ok = false, state = "disconnected", message = "The machine is not connected.", sent = 0, total = 0 }); return; }
                var safety = root.TryGetProperty("safety", out var sf) && sf.ValueKind == JsonValueKind.Object ? sf : default;
                bool energetic = safety.ValueKind == JsonValueKind.Object && Bool(safety, "energetic");
                bool acked = safety.ValueKind == JsonValueKind.Object && Bool(safety, "hazardsAcknowledged");
                bool homed = safety.ValueKind == JsonValueKind.Object && Bool(safety, "homingConfirmed");
                var gcode = Str(root, "gcode");
                var r = await Task.Run(() => s.RunAsync(gcode, energetic, acked, homed));
                _post("FAB_MACHINE_DONE", new { id, r.ok, r.message, r.state, r.sent, r.total, r.resends });
                // A dropped link leaves nothing behind to resume.
                if (r.state == "disconnected" && _open.TryRemove(id, out var gone)) gone.Dispose();
                return;
            }
            case "FAB_MACHINE_RT":
                if (_open.TryGetValue(id, out var rt)) await rt.RealtimeAsync(Str(root, "cmd"));
                return;
            case "FAB_MACHINE_STOP":
                if (_open.TryGetValue(id, out var st)) await st.StopAsync();
                return;
            case "FAB_MACHINE_CLOSE":
                if (_open.TryRemove(id, out var c)) { if (c.JobRunning) await c.StopAsync(); c.Dispose(); }
                return;
        }
    }

    /// <summary>Window closing: stop every running job and release the ports.</summary>
    public void CloseAll()
    {
        foreach (var k in _open.Keys.ToArray())
            if (_open.TryRemove(k, out var s)) { if (s.JobRunning) { try { s.StopAsync().Wait(1000); } catch { } } s.Dispose(); }
    }
}
