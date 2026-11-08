// DWG -> DXF with ACadSharp (MIT). The web side reads DXF with its own reader
// (services/cad/dxf.ts), so DWG only needs this one translation step.
// Shared by the desktop app (CAD_DWG_TO_DXF bridge message) and the cad-dwg command-line
// tool (windows-native/tools/CadDwg) that tests and, later, the server use.

using System;
using System.Collections.Generic;
using System.IO;
using ACadSharp;
using ACadSharp.IO;

namespace Plajah.WinUI;

public static class CadDwgService
{
    public sealed record Result(bool Success, byte[]? Dxf, string Version, string[] Notes, string? Error);

    public static Result ConvertToDxf(byte[] dwg)
    {
        var notes = new List<string>();
        try
        {
            CadDocument doc;
            using (var input = new MemoryStream(dwg))
            using (var reader = new DwgReader(input, (_, e) => { if (e.NotificationType is NotificationType.Error or NotificationType.NotImplemented) Add(notes, e.Message); }))
            {
                doc = reader.Read();
            }
            using var output = new MemoryStream();
            using (var writer = new DxfWriter(output, doc, false))
            {
                writer.OnNotification += (_, e) => { if (e.NotificationType is NotificationType.Error) Add(notes, e.Message); };
                writer.Write();
            }
            return new Result(true, output.ToArray(), doc.Header.Version.ToString(), notes.ToArray(), null);
        }
        catch (Exception ex)
        {
            return new Result(false, null, "", notes.ToArray(), ex.Message);
        }
    }

    // Keep the note list short: a big drawing can raise thousands of identical messages.
    private static void Add(List<string> notes, string message)
    {
        if (notes.Count < 40 && !notes.Contains(message)) notes.Add(message);
    }
}
