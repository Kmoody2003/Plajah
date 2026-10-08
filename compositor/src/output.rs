use std::sync::Arc;
use winit::event_loop::ActiveEventLoop;
use winit::window::{Window, WindowAttributes};

use crate::ipc::Layer;
use crate::renderer::Renderer;

pub struct OutputWindow {
    pub window: Arc<Window>,
    pub layers: Vec<Layer>,
}

impl OutputWindow {
    pub fn new(event_loop: &ActiveEventLoop, _display_index: usize, _width: u32, _height: u32) -> Self {
        let attrs = WindowAttributes::default()
            .with_title("Plajah Output");
        
        let window = Arc::new(event_loop.create_window(attrs).unwrap());
        Self {
            window,
            layers: Vec::new(),
        }
    }

    pub fn update_layers(&mut self, layers: Vec<Layer>) {
        self.layers = layers;
    }

    pub fn render(&mut self, renderer: &mut Renderer) {
        renderer.render(self);
        self.window.request_redraw();
    }
}
