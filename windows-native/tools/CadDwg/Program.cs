// cad-dwg <in.dwg> [out.dxf]   (out omitted: DXF to stdout). Notes go to stderr as JSON.
using System;
using System.IO;
using System.Text.Json;
using Plajah.WinUI;

if (args.Length < 1) { Console.Error.WriteLine("usage: cad-dwg <in.dwg> [out.dxf]"); return 2; }
var result = CadDwgService.ConvertToDxf(File.ReadAllBytes(args[0]));
Console.Error.WriteLine(JsonSerializer.Serialize(new { result.Success, result.Version, result.Notes, result.Error }));
if (!result.Success || result.Dxf is null) return 1;
if (args.Length > 1) File.WriteAllBytes(args[1], result.Dxf);
else { using var stdout = Console.OpenStandardOutput(); stdout.Write(result.Dxf); }
return 0;
