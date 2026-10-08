use serde::{Deserialize, Serialize};
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
use tokio::io::{AsyncReadExt};
use tokio::sync::mpsc;
use tracing::{error, info};

const PIPE_NAME: &str = r"\\.\pipe\plajah-compositor";

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type")]
pub enum IpcMessage {
    #[serde(rename = "UPDATE_STACK")]
    UpdateStack { outputId: String, layers: Vec<Layer> },
    #[serde(rename = "OPEN_OUTPUT")]
    OpenOutput { outputId: String, displayIndex: usize, width: u32, height: u32 },
    #[serde(rename = "CLOSE_OUTPUT")]
    CloseOutput { outputId: String },
    #[serde(rename = "IDENTIFY_DISPLAY")]
    IdentifyDisplay { outputId: String, name: String, duration: u32 },
    #[serde(rename = "SHUTDOWN")]
    Shutdown,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Layer {
    pub slot: String,
    pub content: LayerContent,
    pub opacity: f32,
    #[serde(rename = "blendMode")]
    pub blend_mode: String,
    pub visible: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "kind")]
pub enum LayerContent {
    TEXT { blocks: Vec<TextBlock>, style: TextStyle },
    IMAGE { src: String },
    COLOR { color: String },
    SCRIPTURE { text: String, reference: String, style: TextStyle },
    VIDEO { src: String },
    GENERATOR { name: String },
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TextBlock {
    pub text: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TextStyle {
    pub font: Option<String>,
    pub size: Option<f32>,
    pub color: Option<String>,
    pub align: Option<String>,
}

pub async fn run_ipc_server(tx: mpsc::UnboundedSender<IpcMessage>) {
    loop {
        let mut server = match ServerOptions::new().create(PIPE_NAME) {
            Ok(server) => server,
            Err(e) => {
                error!("Failed to create named pipe server: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                continue;
            }
        };

        info!("Waiting for IPC connection on {}...", PIPE_NAME);
        if let Err(e) = server.connect().await {
            error!("Failed to connect to named pipe: {}", e);
            continue;
        }
        
        info!("IPC Client connected!");
        handle_client(server, tx.clone()).await;
    }
}

async fn handle_client(mut pipe: NamedPipeServer, tx: mpsc::UnboundedSender<IpcMessage>) {
    let mut buf = vec![0; 65536];
    loop {
        match pipe.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                let msg_str = String::from_utf8_lossy(&buf[..n]);
                for line in msg_str.lines() {
                    if line.trim().is_empty() { continue; }
                    match serde_json::from_str::<IpcMessage>(line) {
                        Ok(msg) => {
                            if let IpcMessage::Shutdown = msg {
                                let _ = tx.send(msg);
                                return;
                            }
                            let _ = tx.send(msg);
                        }
                        Err(e) => error!("Failed to parse IPC message '{}': {}", line, e),
                    }
                }
            }
            Err(e) => {
                error!("IPC read error: {}", e);
                break;
            }
        }
    }
}
