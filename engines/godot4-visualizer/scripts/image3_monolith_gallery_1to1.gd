extends Node3D
class_name Image3MonolithGallery1to1

# ── 1-FOR-1 RECREATION OF IMAGE 3: MONOLITH EXHIBITION GALLERY ──
# Faithfully reproduces:
# 1. 7 vertical monolith slabs + center backdrop screen in Image 3's exact architecture
# 2. Black structural metal bezels and frames
# 3. High-gloss mirror-wet black lacquer floor reflecting with Godot 4 Vulkan SSR
# 4. Vertical laser light stripes and rich generative screen graphics

@export var audio_bridge: Node
@export var floor_mesh: MeshInstance3D

var _screens: Array[MeshInstance3D] = []
var _screen_mats: Array[StandardMaterial3D] = []
var _floor_mat: StandardMaterial3D
var _time_accum: float = 0.0

func _ready() -> void:
	# 1. Setup Mirror-Wet Black Lacquer Floor with Vulkan SSR
	_floor_mat = StandardMaterial3D.new()
	_floor_mat.albedo_color = Color(0.015, 0.01, 0.02)
	_floor_mat.metallic = 0.95
	_floor_mat.roughness = 0.035 # Mirror reflectivity for SSR
	_floor_mat.clearcoat_enabled = true
	_floor_mat.clearcoat = 1.0
	_floor_mat.clearcoat_roughness = 0.02
	
	if floor_mesh:
		floor_mesh.material_override = _floor_mat
	
	# 2. Black Bezel / Frame Material for Monolith Casings
	var frame_mat = StandardMaterial3D.new()
	frame_mat.albedo_color = Color(0.03, 0.025, 0.04)
	frame_mat.metallic = 0.85
	frame_mat.roughness = 0.22
	
	# 3. Screen Specifications matching Image 3's exact layout:
	var screen_configs = [
		{"pos": Vector3(-8.8, 4.2, -1.8), "size": Vector2(1.5, 8.4), "col": Color(0.85, 0.15, 0.4), "type": "diagonal"},
		{"pos": Vector3(-6.8, 4.2, -0.6), "size": Vector2(1.5, 8.4), "col": Color(1.0, 0.25, 0.0),  "type": "stripes"},
		{"pos": Vector3(-4.8, 4.4,  0.4), "size": Vector2(1.7, 8.8), "col": Color(0.9, 0.1, 0.1),   "type": "blast"},
		{"pos": Vector3(-2.8, 4.2,  0.8), "size": Vector2(1.5, 8.4), "col": Color(1.0, 0.15, 0.0),  "type": "beam"},
		# Center Backdrop (Set back in Z)
		{"pos": Vector3( 0.0, 3.8, -2.4), "size": Vector2(4.8, 6.2), "col": Color(1.0, 0.0, 0.6),   "type": "backdrop"},
		{"pos": Vector3( 2.8, 4.2,  0.8), "size": Vector2(1.5, 8.4), "col": Color(1.0, 0.15, 0.0),  "type": "beam"},
		{"pos": Vector3( 4.8, 4.4,  0.4), "size": Vector2(1.7, 8.8), "col": Color(0.9, 0.1, 0.1),   "type": "blast"},
		{"pos": Vector3( 6.8, 4.2, -0.6), "size": Vector2(1.5, 8.4), "col": Color(1.0, 0.25, 0.0),  "type": "stripes"},
		{"pos": Vector3( 8.8, 4.2, -1.8), "size": Vector2(1.5, 8.4), "col": Color(0.0, 0.8, 1.0),   "type": "diagonal"}
	]
	
	for cfg in screen_configs:
		var grp = Node3D.new()
		grp.position = cfg["pos"]
		add_child(grp)
		
		var w = cfg["size"].x
		var h = cfg["size"].y
		var d = 0.42
		
		# Outer Casing Box
		var box = BoxMesh.new()
		box.size = Vector3(w + 0.1, h + 0.1, d)
		var body = MeshInstance3D.new()
		body.mesh = box
		body.material_override = frame_mat
		grp.add_child(body)
		
		# Emissive Front Display Face
		var face_mesh = QuadMesh.new()
		face_mesh.size = Vector2(w, h)
		
		var face_mat = StandardMaterial3D.new()
		face_mat.albedo_color = cfg["col"]
		face_mat.emission_enabled = true
		face_mat.emission = cfg["col"]
		face_mat.emission_energy_multiplier = 3.5 # Radiates deep wet reflections into SSR
		
		var face = MeshInstance3D.new()
		face.mesh = face_mesh
		face.material_override = face_mat
		face.position = Vector3(0.0, 0.0, d * 0.5 + 0.01)
		grp.add_child(face)
		
		_screens.append(face)
		_screen_mats.append(face_mat)
		
		# If stripes, add thin vertical bright core tubes
		if cfg["type"] == "stripes" or cfg["type"] == "beam":
			var tube_mat = StandardMaterial3D.new()
			tube_mat.albedo_color = Color(1.0, 0.95, 0.9)
			tube_mat.emission_enabled = true
			tube_mat.emission = Color(1.0, 0.95, 0.8)
			tube_mat.emission_energy_multiplier = 8.0 # Ultra-bright laser core
			
			var tube_box = BoxMesh.new()
			tube_box.size = Vector3(0.05, h * 0.95, 0.06)
			var tube = MeshInstance3D.new()
			tube.mesh = tube_box
			tube.material_override = tube_mat
			tube.position = Vector3(0.0, 0.0, d * 0.5 + 0.02)
			grp.add_child(tube)

func _process(delta: float) -> void:
	_time_accum += delta
	
	var k: float = audio_bridge.kick if audio_bridge else 0.2
	var v: float = audio_bridge.voice if audio_bridge else 0.25
	var sub: float = audio_bridge.sub if audio_bridge else 0.2
	
	# 1. Screen Pulse and Emission Swell on Kicks
	for i in range(_screen_mats.size()):
		var pulse = sin(_time_accum * 2.0 + float(i) * 0.5) * 0.4 + 0.6
		var energy = (2.5 + pulse * 2.0 + k * 5.0 + v * 2.0)
		_screen_mats[i].emission_energy_multiplier = energy
	
	# 2. Floor Lacquer Micro-Wobble on Sub-Bass (fractures SSR reflection slightly)
	if _floor_mat:
		_floor_mat.roughness = 0.035 + sub * 0.04
