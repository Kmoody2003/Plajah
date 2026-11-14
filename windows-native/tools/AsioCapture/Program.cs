using System;
using System.IO;
using System.Linq;
using System.Threading;
using NAudio.Wave;
using Plajah.WinUI;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.FirstOrDefault() == "rec")
        {
            string driver = args[1];
            int[] inputs = args[2].Split(',').Select(int.Parse).ToArray();
            int secs = args.Length > 3 ? int.Parse(args[3]) : 3;
            int rate = args.Length > 4 ? int.Parse(args[4]) : 48000;
            string dir = Path.Combine(Path.GetTempPath(), "chora-asio-check", Guid.NewGuid().ToString("N")[..8]);
            using var rec = new AsioMultitrackRecorder();
            rec.Start(driver, inputs, rate, "check", dir, write: true);
            for (int i = 0; i < secs * 4; i++)
            {
                Thread.Sleep(250);
                Console.WriteLine("peaks " + string.Join(" ", rec.TakePeaks().Select(p => p.ToString("0.000"))));
            }
            var r = rec.Stop();
            Console.WriteLine($"take {r.TakeId}: {r.DurationSec:0.000}s @ {r.SampleRate} dropped={r.DroppedFrames} clipped=[{string.Join(",", r.ClippedInputs)}] err={r.Error} firstBufferMs={r.FirstBufferUnixMs} bufferFrames={r.BufferFrames} inputLatencyFrames={r.InputLatencyFrames}");
            int bad = 0;
            foreach (var f in r.Files)
            {
                using var rd = new WaveFileReader(f.Path);
                var buf = new float[rd.SampleCount];
                var sp = rd.ToSampleProvider(); int n = sp.Read(buf, 0, buf.Length);
                float peak = buf.Take(n).Select(Math.Abs).DefaultIfEmpty(0).Max();
                int nonzero = buf.Take(n).Count(s => s != 0);
                bool ok = rd.WaveFormat.Encoding == WaveFormatEncoding.IeeeFloat && rd.WaveFormat.SampleRate == rate && rd.WaveFormat.Channels == 1
                          && n == f.Frames && Math.Abs(n / (double)rate - secs) < 0.5;
                if (!ok) bad++;
                Console.WriteLine($"  in {f.Input + 1}: {f.Path} frames={n} fmt={rd.WaveFormat} peak={peak:0.0000} nonzero={nonzero} {(ok ? "OK" : "FAIL")}");
            }
            return bad == 0 && r.Files.Length == inputs.Length ? 0 : 1;
        }

        foreach (var d in AsioMultitrackRecorder.DriverNames())
        {
            var p = AsioMultitrackRecorder.Probe(d);
            Console.WriteLine(p.Ok
                ? $"{d}: {p.Inputs} in / {p.Outputs} out, rates [{string.Join(",", p.SampleRates)}], inputs [{string.Join(" | ", p.InputNames.Take(8))}{(p.Inputs > 8 ? " …" : "")}]"
                : $"{d}: unavailable — {p.Error}");
        }
        return 0;
    }
}
