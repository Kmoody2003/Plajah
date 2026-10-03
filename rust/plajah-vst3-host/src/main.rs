use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use vst3_host::{Vst3Host, midi::MidiChannel};

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Request {
    Scan { directories: Vec<String> },
    Load { path: String },
    Parameters,
    SetParameter { id: u32, value: f32 },
    SendNote { note: u8, velocity: u8 },
    SaveState,
    LoadState { state: Vec<u8> },
    Unload,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Response {
    Ready,
    Plugins { plugins: Vec<PluginInfo> },
    PluginLoaded { name: String },
    Parameters { parameters: Vec<ParameterInfo> },
    State { state: Vec<u8> },
    Ok,
    Error { message: String },
}

#[derive(Debug, Serialize)]
struct PluginInfo {
    name: String,
    vendor: String,
    version: String,
    path: String,
    audio_inputs: u16,
    audio_outputs: u16,
    has_midi_input: bool,
    has_gui: bool,
}

#[derive(Debug, Serialize)]
struct ParameterInfo {
    id: u32,
    name: String,
    value: f32,
    can_automate: bool,
}

fn write_response(response: Response) -> io::Result<()> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &response)?;
    stdout.write_all(b"\n")?;
    stdout.flush()
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    write_response(Response::Ready)?;
    let stdin = io::stdin();
    let mut _host: Option<Vst3Host> = None;
    let mut plugin: Option<vst3_host::Plugin> = None;

    for line in stdin.lock().lines() {
        let line = line?;
        let request = match serde_json::from_str::<Request>(&line) {
            Ok(request) => request,
            Err(error) => {
                write_response(Response::Error {
                    message: error.to_string(),
                })?;
                continue;
            }
        };

        let result = match request {
            Request::Scan { directories } => {
                let mut discovered = Vec::new();
                for directory in directories {
                    match vst3_host::simple::discover_plugins_in(&directory) {
                        Ok(plugins) => {
                            discovered.extend(plugins.into_iter().map(|plugin| PluginInfo {
                                name: plugin.name,
                                vendor: plugin.vendor,
                                version: plugin.version,
                                path: plugin.path.display().to_string(),
                                audio_inputs: plugin.audio_inputs.min(u16::MAX as u32) as u16,
                                audio_outputs: plugin.audio_outputs.min(u16::MAX as u32) as u16,
                                has_midi_input: plugin.has_midi_input,
                                has_gui: plugin.has_gui,
                            }))
                        }
                        Err(error) => {
                            discovered.clear();
                            discovered.push(PluginInfo {
                                name: format!("VST3 scan error: {error}"),
                                vendor: String::new(),
                                version: String::new(),
                                path: directory,
                                audio_inputs: 0,
                                audio_outputs: 0,
                                has_midi_input: false,
                                has_gui: false,
                            });
                            break;
                        }
                    }
                }
                Ok(Response::Plugins {
                    plugins: discovered,
                })
            }
            Request::Load { path } => {
                match Vst3Host::builder().with_process_isolation(true).build() {
                    Ok(mut next_host) => match next_host.load_plugin(&path) {
                        Ok(next_plugin) => {
                            let name = next_plugin.info().name.clone();
                            _host = Some(next_host);
                            plugin = Some(next_plugin);
                            Ok(Response::PluginLoaded { name })
                        }
                        Err(error) => Err(error.to_string()),
                    },
                    Err(error) => Err(error.to_string()),
                }
            }
            Request::Parameters => match plugin.as_mut() {
                Some(plugin) => match plugin.get_parameters() {
                    Ok(parameters) => Ok(Response::Parameters {
                        parameters: parameters
                            .into_iter()
                            .map(|parameter| ParameterInfo {
                                id: parameter.id,
                                name: parameter.name,
                                value: parameter.value as f32,
                                can_automate: parameter.can_automate,
                            })
                            .collect(),
                    }),
                    Err(error) => Err(error.to_string()),
                },
                None => Err("No VST3 plugin is loaded".into()),
            },
            Request::SetParameter { id, value } => match plugin.as_mut() {
                Some(plugin) => plugin
                    .set_parameter(id, value as f64)
                    .map(|_| Response::Ok)
                    .map_err(|error| error.to_string()),
                None => Err("No VST3 plugin is loaded".into()),
            },
            Request::SendNote { note, velocity } => match plugin.as_mut() {
                Some(plugin) => plugin
                    .send_midi_note(note, velocity, MidiChannel::Ch1)
                    .map(|_| Response::Ok)
                    .map_err(|error| error.to_string()),
                None => Err("No VST3 plugin is loaded".into()),
            },
            Request::SaveState => match plugin.as_mut() {
                Some(plugin) => plugin
                    .save_state()
                    .map(|state| Response::State { state })
                    .map_err(|error| error.to_string()),
                None => Err("No VST3 plugin is loaded".into()),
            },
            Request::LoadState { state } => match plugin.as_mut() {
                Some(plugin) => plugin
                    .load_state(&state)
                    .map(|_| Response::Ok)
                    .map_err(|error| error.to_string()),
                None => Err("No VST3 plugin is loaded".into()),
            },
            Request::Unload => {
                plugin = None;
                _host = None;
                Ok(Response::Ok)
            }
        };

        match result {
            Ok(response) => write_response(response)?,
            Err(message) => write_response(Response::Error { message })?,
        }
    }
    Ok(())
}
