extends Node3D
class_name Image4TheatricalProscenium1to1

# ── 1-FOR-1 RECREATION OF IMAGE 4: THEATRICAL GEOMETRIC CHEVRON PROSCENIUM ──
# Faithfully reproduces:
# 1. 6 symmetrical geometric chevron towers with angled knife-edge tops
# 2. Bold diagonal color blocking matching Image 4 (Cyan, Coral Orange, Vivid Pink, Ochre, Charcoal)
# 3. Stage floor with satin reflection and foreground monitor wedges
# 4. Overhead lighting truss with warm theatrical spotlights

@export var audio_bridge: Node
@export var stage_floor_mesh: MeshInstance3D

var _towers: Array[Node3D] = []
var _facet_meshes: Array[MeshInstance3D] = []
var _spot_warm: SpotLight3D
var _spot_cyan: SpotLight3D
var _time_accum: float = 0.0

func _ready() -> void:
	# 1. Stage Floor Material (Satin Reflective Stage Floor)
	var floor_mat = StandardMaterial3D.new()
	floor_mat.albedo_color = Color(0.04, 0.03, 0.05)
	floor_mat.metallic = 0.65
	floor_mat.roughness = 0.18 # Theatrical stage satin reflection
	floor_mat.clearcoat_enabled = true
	floor_mat.clearcoat = 0.75
	floor_mat.clearcoat_roughness = 0.12
	
	if stage_floor_mesh:
		stage_floor_mesh.material_override = floor_mat
	
	# 2. Build 6 Architectural Chevron Towers matching Image 4
	var tower_configs = [
		{"pos": Vector3(-9.2, 0.0, -1.8), "w": 2.2, "h": 6.8, "top_angle": -0.45, "primary": Color(1.0, 0.0, 0.35), "secondary": Color(0.0, 0.75, 0.95)},
		{"pos": Vector3(-5.8, 0.0, -0.6), "w": 2.6, "h": 8.5, "top_angle": -0.52, "primary": Color(0.0, 0.65, 0.92), "secondary": Color(1.0, 0.42, 0.0)},
		{"pos": Vector3(-2.2, 0.0,  0.5), "w": 3.2, "h": 10.4, "top_angle": 0.48,  "primary": Color(0.96, 0.75, 0.0), "secondary": Color(0.0, 0.8, 0.85)},
		{"pos": Vector3( 2.2, 0.0,  0.5), "w": 3.2, "h": 10.4, "top_angle": -0.48, "primary": Color(1.0, 0.35, 0.0),  "secondary": Color(0.95, 0.0, 0.3)},
		{"pos": Vector3( 5.8, 0.0, -0.6), "w": 2.6, "h": 8.5, "top_angle": 0.52,  "primary": Color(1.0, 0.45, 0.0),  "secondary": Color(0.95, 0.0, 0.4)},
		{"pos": Vector3( 9.2, 0.0, -1.8), "w": 2.2, "h": 6.8, "top_angle": 0.45,  "primary": Color(0.0, 0.85, 0.75), "secondary": Color(1.0, 0.0, 0.45)}
	]
	
	for cfg in tower_configs:
		var grp = Node3D.new()
		grp.position = cfg["pos"]
		add_child(grp)
		_towers.append(grp)
		
		var w = cfg["w"]
		var h = cfg["h"]
		
		# Tower Body Outer Shell (Dark Graphite Frame)
		var body_mat = StandardMaterial3D.new()
		body_mat.albedo_color = Color(0.06, 0.05, 0.08)
		body_mat.metallic = 0.82
		body_mat.roughness = 0.35
		
		var box = BoxMesh.new()
		box.size = Vector3(w, h, 0.38)
		var body = MeshInstance3D.new()
		body.mesh = box
		body.material_override = body_mat
		body.position.y = h * 0.5
		grp.add_child(body)
		
		# Angled Knife-Edge Crown (Prism Mesh)
		var crown_mesh = PrismMesh.new()
		crown_mesh.size = Vector3(w, 1.8, 0.38)
		var crown = MeshInstance3D.new()
		crown.mesh = crown_mesh
		crown.material_override = body_mat
		crown.position.y = h + 0.9
		crown.rotation.z = cfg["top_angle"]
		grp.add_child(crown)
		
		# Front Emissive Geometric Color Block (Primary Color)
		var mat1 = StandardMaterial3D.new()
		mat1.albedo_color = cfg["primary"]
		mat1.emission_enabled = true
		mat1.emission = cfg["primary"]
		mat1.emission_energy_multiplier = 2.2
		
		var facet1 = MeshInstance3D.new()
		var p1 = QuadMesh.new()
		p1.size = Vector2(w * 0.88, h * 0.48)
		facet1.mesh = p1
		facet1.material_override = mat1
		facet1.position = Vector3(0.0, h * 0.28, 0.2)
		grp.add_child(facet1)
		_facet_meshes.append(facet1)
		
		# Front Emissive Geometric Color Block (Secondary Color)
		var mat2 = StandardMaterial3D.new()
		mat2.albedo_color = cfg["secondary"]
		mat2.emission_enabled = true
		mat2.emission = cfg["secondary"]
		mat2.emission_energy_multiplier = 2.2
		
		var facet2 = MeshInstance3D.new()
		var p2 = QuadMesh.new()
		p2.size = Vector2(w * 0.88, h * 0.44)
		facet2.mesh = p2
		facet2.material_override = mat2
		facet2.position = Vector3(0.0, h * 0.74, 0.2)
		grp.add_child(facet2)
		_facet_meshes.append(facet2)
	
	# 3. Foreground Stage Monitor Speakers (matching Image 4's floor wedges)
	var wedge_positions = [Vector3(-4.0, 0.4, 3.5), Vector3(0.0, 0.4, 4.0), Vector3(4.0, 0.4, 3.5)]
	var wedge_mesh = PrismMesh.new()
	wedge_mesh.size = Vector3(1.4, 0.8, 1.0)
	var wedge_mat = StandardMaterial3D.new()
	wedge_mat.albedo_color = Color(0.02, 0.02, 0.03)
	wedge_mat.roughness = 0.85
	
	for wp in wedge_positions:
		var w = MeshInstance3D.new()
		w.mesh = wedge_mesh
		w.material_override = wedge_mat
		w.position = wp
		w.rotation_degrees = Vector3(90, 0, 0)
		add_child(w)
	
	# 4. Overhead Stage Theatrical Spotlights
	_setup_overhead_truss_lights()

func _setup_overhead_truss_lights() -> void:
	_spot_warm = SpotLight3D.new()
	_spot_warm.light_color = Color(1.0, 0.45, 0.1) # Theatrical warm halogen wash
	_spot_warm.light_energy = 5.0
	_spot_warm.spot_range = 35.0
	_spot_warm.spot_angle = 45.0
	_spot_warm.position = Vector3(0.0, 14.0, 4.0)
	_spot_warm.shadow_enabled = true
	add_child(_spot_warm)
	_spot_warm.look_at(Vector3(0, 0, 0), Vector3.UP)
	
	_spot_cyan = SpotLight3D.new()
	_spot_cyan.light_color = Color(0.0, 0.85, 1.0) # Cyber cyan edge spot
	_spot_cyan.light_energy = 4.0
	_spot_cyan.spot_range = 30.0
	_spot_cyan.spot_angle = 38.0
	_spot_cyan.position = Vector3(-6.0, 12.0, 6.0)
	add_child(_spot_cyan)
	_spot_cyan.look_at(Vector3(0, 3, 0), Vector3.UP)

func _process(delta: float) -> void:
	_time_accum += delta
	
	var k: float = audio_bridge.kick if audio_bridge else 0.2
	var sn: float = audio_bridge.snare if audio_bridge else 0.1
	var v: float = audio_bridge.voice if audio_bridge else 0.25
	
	# 1. Mechanical Folding Origami Flaring on Kick
	for i in range(_towers.size()):
		var t = _towers[i]
		var flare = (k * 0.4) if (i == 2 or i == 3) else (k * 0.2)
		t.rotation.x = lerpf(t.rotation.x, flare, delta * 10.0)
	
	# 2. Theatrical Spot Swings
	if _spot_warm:
		_spot_warm.light_energy = 4.0 + k * 8.0
		_spot_warm.position.x = sin(_time_accum * 1.5) * 2.5
	
	if _spot_cyan:
		_spot_cyan.light_energy = 3.5 + sn * 10.0 # Snare strobe flash
		_spot_cyan.position.x = -6.0 + cos(_time_accum * 1.8) * 3.0
