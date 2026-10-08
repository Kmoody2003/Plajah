# Windows Design Artifact 02: Fabula / Melos Studio Parity

Status: parity reference, not a redesign.

Fabula and Melos keep their current web workspaces and panel proportions. WinUI 3 adds
native device, file, audio, capture, and plugin capabilities behind the same controls.
The web layout remains the source of truth for route structure and visual hierarchy.

## Shared professional workspace

```text
+--------------------------------------------------------------------------------+
| Existing studio header: project | transport | save | share | account           |
+------+-----------------------------------------------------------------+-------+
|      |                                                                 |       |
| web  |                         Existing monitor / canvas                | web   |
| rail |                                                                 | insp. |
|      +-----------------------------------------------------------------+       |
|      | Existing timeline / piano roll / mixer / node graph / FX lanes   |       |
+------+-----------------------------------------------------------------+-------+
| Existing status / meters / device state / render queue                         |
+--------------------------------------------------------------------------------+
```

## Fabula mapping

| Existing web surface | Native Windows enhancement | Layout change |
| --- | --- | --- |
| Edit timeline | WebGPU/WebCodecs preview; native render queue; DeckLink/NDI sources | None |
| Color monitor | RTX/Arc WebGPU compositor; scopes and grade UI remain web | None |
| FX/node graph | Pixels effect registry remains the graph ABI | None |
| Audio page | WASAPI/ASIO device bridge, low-latency monitor, VST3 inserts | Existing mixer/inspector positions |
| Deliver | Media Foundation/NVENC/QSV provider selection | Existing render controls |
| Media pool | WinUI folders, file watchers, BRAW/native source enumeration | Existing bin/tree |

## Melos mapping

| Existing web surface | Native Windows enhancement | Layout change |
| --- | --- | --- |
| Machine / pads | Native low-latency audio session and MIDI timestamps | None |
| Instrument picker | Built-ins plus Windows VST3 browser | Existing picker gains a Windows section |
| Mixer | WASAPI shared/exclusive, ASIO, VST3 insert chain | Existing strips remain |
| Timeline / piano roll | Native audio clock and render worker | None |
| Browser / Muse | Native sample folders and file picker | Existing browser rail remains |
| Export | Background native bounce with hardware encode where relevant | Existing export action |

## WinUI-native controls, kept in the same positions

- Device selection uses WinUI `ComboBox` or `ContentDialog` only when the web control
  needs a native device list.
- Folder selection uses `FolderPicker`; selected paths return through the existing
  bridge and appear in the existing web browser/settings surface.
- VST3 editor windows are child/native windows owned by the studio route; the web
  plugin slot remains in the existing mixer or instrument position.
- Native meters and diagnostics return values to the existing status strips.
- Native render progress returns to the existing Fabula render queue.

## Native insert slot contract

```text
web mixer slot
  -> plugin id / state / automation contract
  -> WinUI bridge
  -> isolated VST3 worker
  -> WASAPI or ASIO session clock
  -> web meter + native output
```

The worker is isolated so a third-party plugin cannot crash WebView2 or the WinUI shell.
The plugin state is serialized into the existing project data model; no Windows-only
project format is required.

## Fidelity rule

Do not move Fabula controls into a new WinUI layout. Do not create a separate Melos
Windows skin. Use WinUI for capabilities the browser cannot provide, then return the
result to the same web panels, rails, sheets, meters, and timelines.
