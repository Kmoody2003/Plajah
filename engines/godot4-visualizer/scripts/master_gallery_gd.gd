extends Node3D
class_name MasterGalleryGD

# ── MASTER 1-FOR-1 VISUALIZER CONTROLLER (GODOT 4) ──
# Houses the 4 photorealistic visualizers reconstructed from the user's images:
# Key [1]: Image 1 - High-Speed Fluid Macro Impact (Trochoidal Ripples + Worthington Column)
# Key [2]: Image 2 - Architectural Vertical Neon Colonnade (SDFGI Dynamic Crevice Bounce)
# Key [3]: Image 3 - Monolith Exhibition Gallery (Wet Mirror Lacquer SSR)
# Key [4]: Image 4 - Theatrical Geometric Chevron Proscenium (Acoustic Shell & Theatrical Truss)

@export var scene_image1: Node3D
@export var scene_image2: Node3D
@export var scene_image3: Node3D
@export var scene_image4: Node3D

var _active_index: int = 1

func _ready() -> void:
	select_scene(1)

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_1:
			select_scene(1)
		elif event.keycode == KEY_2:
			select_scene(2)
		elif event.keycode == KEY_3:
			select_scene(3)
		elif event.keycode == KEY_4:
			select_scene(4)

func select_scene(idx: int) -> void:
	_active_index = idx
	print("[MasterGalleryGD] Switched to 1-for-1 Visualizer Scene: ", idx)
	
	if scene_image1:
		scene_image1.visible = (idx == 1)
		scene_image1.process_mode = Node.PROCESS_MODE_INHERIT if (idx == 1) else Node.PROCESS_MODE_DISABLED
	if scene_image2:
		scene_image2.visible = (idx == 2)
		scene_image2.process_mode = Node.PROCESS_MODE_INHERIT if (idx == 2) else Node.PROCESS_MODE_DISABLED
	if scene_image3:
		scene_image3.visible = (idx == 3)
		scene_image3.process_mode = Node.PROCESS_MODE_INHERIT if (idx == 3) else Node.PROCESS_MODE_DISABLED
	if scene_image4:
		scene_image4.visible = (idx == 4)
		scene_image4.process_mode = Node.PROCESS_MODE_INHERIT if (idx == 4) else Node.PROCESS_MODE_DISABLED
