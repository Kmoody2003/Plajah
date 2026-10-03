mod compositor;
mod ipc;
mod output;
mod renderer;
mod text;

use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{info, Level};
use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::window::WindowId;

struct App {
    compositor: Option<compositor::Compositor>,
    ipc_rx: mpsc::UnboundedReceiver<ipc::IpcMessage>,
}

impl ApplicationHandler for App {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.compositor.is_none() {
            self.compositor = Some(compositor::Compositor::new(event_loop));
        }
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, window_id: WindowId, event: WindowEvent) {
        if let Some(comp) = &mut self.compositor {
            comp.handle_window_event(window_id, event, event_loop);
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        if let Some(comp) = &mut self.compositor {
            // Process all pending IPC messages
            while let Ok(msg) = self.ipc_rx.try_recv() {
                comp.handle_ipc_message(msg, event_loop);
            }
            comp.render_all();
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();
    info!("Starting Plajah Compositor");

    let rt = tokio::runtime::Runtime::new()?;
    let (ipc_tx, ipc_rx) = mpsc::unbounded_channel();
    
    rt.spawn(async move {
        ipc::run_ipc_server(ipc_tx).await;
    });

    let event_loop = EventLoop::new()?;
    event_loop.set_control_flow(ControlFlow::Poll);

    let mut app = App {
        compositor: None,
        ipc_rx,
    };

    event_loop.run_app(&mut app)?;
    Ok(())
}
