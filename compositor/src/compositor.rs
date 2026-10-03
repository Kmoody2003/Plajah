use std::collections::HashMap;
use winit::event::WindowEvent;
use winit::event_loop::ActiveEventLoop;
use winit::window::WindowId;
use tracing::info;

use crate::ipc::IpcMessage;
use crate::output::OutputWindow;
use crate::renderer::Renderer;

pub struct Compositor {
    outputs: HashMap<String, OutputWindow>,
    renderer: Renderer,
}

impl Compositor {
    pub fn new(_event_loop: &ActiveEventLoop) -> Self {
        Self {
            outputs: HashMap::new(),
            renderer: Renderer::new(),
        }
    }

    pub fn handle_ipc_message(&mut self, msg: IpcMessage, event_loop: &ActiveEventLoop) {
        match msg {
            IpcMessage::OpenOutput { outputId, displayIndex, width, height } => {
                info!("Opening output: {}", outputId);
                let window = OutputWindow::new(event_loop, displayIndex, width, height);
                self.outputs.insert(outputId, window);
            }
            IpcMessage::CloseOutput { outputId } => {
                info!("Closing output: {}", outputId);
                self.outputs.remove(&outputId);
            }
            IpcMessage::UpdateStack { outputId, layers } => {
                if let Some(out) = self.outputs.get_mut(&outputId) {
                    out.update_layers(layers);
                }
            }
            IpcMessage::IdentifyDisplay { outputId, name, duration } => {
                info!("Identify display {} -> {} for {}ms", outputId, name, duration);
            }
            IpcMessage::Shutdown => {
                event_loop.exit();
            }
        }
    }

    pub fn handle_window_event(&mut self, window_id: WindowId, _event: WindowEvent, _event_loop: &ActiveEventLoop) {
        for out in self.outputs.values_mut() {
            if out.window.id() == window_id {
                // Handle resize or other events
            }
        }
    }

    pub fn render_all(&mut self) {
        for out in self.outputs.values_mut() {
            out.render(&mut self.renderer);
        }
    }
}
