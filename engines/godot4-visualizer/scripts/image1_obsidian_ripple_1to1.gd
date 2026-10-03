extends Node3D
class_name Image1ObsidianRipple1to1

# ── 1-FOR-1 RECREATION OF IMAGE 1: HIGH-SPEED WATER DROP MACRO IMPACT ──
# Faithfully reproduces:
# 1. Off-center concentric trochoidal ripples
# 2. Central rising Worthington fluid jet column
# 3. Detached spherical liquid droplets suspended above the pinch
# 4. Asymmetrical dual-tone studio lighting: blazing crimson-amber right, obsidian-slate left

@export var audio_bridge: Node
@export var lake_mesh: MeshInstance3D

var _jet_column: MeshInstance3D
var _detached_droplet: MeshInstance3D
var _micro_droplet: MeshInstance3D
var _lake_mat: ShaderMaterial

var _time_accum: float = 0.0
var _jet_base_scale: Vector3 = Vector3(1.0, 1.0, 1.0)
var _impact_pos: Vector3 = Vector3(1.2, 0.0, 0.8)

func _ready() -> void:
	# 1. Setup Material on Lake Mesh
	if lake_mesh and lake_mesh.material_override is ShaderMaterial:
		_lake_mat = lake_mesh.material_override
	
	# 2. Material for Fluid Droplets & Worthington Column (Liquid Glass/Crimson PBR)
	var drop_mat = StandardMaterial3D.new()
	drop_mat.albedo_color = Color(0.85, 0.05, 0.12, 1.0)
	drop_mat.metallic = 0.35
	drop_mat.roughness = 0.03
	drop_mat.clearcoat_enabled = true
	drop_mat.clearcoat = 1.0
	drop_mat.clearcoat_roughness = 0.02
	drop_mat.subsurf_scatter_enabled = true
	drop_mat.subsurf_scatter_strength = 0.65
	drop_mat.subsurf_scatter_skin_mode = false
	drop_mat.subsurf_scatter_transmittance_color = Color(1.0, 0.2, 0.05)
	
	# 3. Build Worthington Fluid Column (Tapered Jet rising from water surface)
	var jet_mesh = CylinderMesh.new()
	jet_mesh.top_radius = 0.04
	jet_mesh.bottom_radius = 0.32
	jet_mesh.height = 1.6
	jet_mesh.radial_segments = 24
	
	_jet_column = MeshInstance3D.new()
	_jet_column.mesh = jet_mesh
	_jet_column.material_override = drop_mat
	_jet_column.position = _impact_pos + Vector3(0.0, 0.8, 0.0)
	add_child(_jet_column)
	
	# 4. Detached Spherical Drop pinching off at the column apex
	var drop_mesh = SphereMesh.new()
	drop_mesh.radius = 0.11
	drop_mesh.height = 0.22
	drop_mesh.radial_segments = 24
	drop_mesh.rings = 16
	
	_detached_droplet = MeshInstance3D.new()
	_detached_droplet.mesh = drop_mesh
	_detached_droplet.material_override = drop_mat
	_detached_droplet.position = _impact_pos + Vector3(0.0, 1.85, 0.0)
	add_child(_detached_droplet)
	
	# 5. Micro droplet suspended higher in air
	var micro_mesh = SphereMesh.new()
	micro_mesh.radius = 0.045
	micro_mesh.height = 0.09
	micro_mesh.radial_segments = 16
	micro_mesh.rings = 12
	
	_micro_droplet = MeshInstance3D.new()
	_micro_droplet.mesh = micro_mesh
	_micro_droplet.material_override = drop_mat
	_micro_droplet.position = _impact_pos + Vector3(0.0, 2.3, 0.0)
	add_child(_micro_droplet)
	
	# 6. Dual-Tone Theatrical Studio Lighting
	_setup_studio_lighting()

func _setup_studio_lighting() -> void:
	# Key Light (Right / Far): Intensely saturated Crimson/Orange Light Bar
	var key_warm = SpotLight3D.new()
	key_warm.light_color = Color(1.0, 0.25, 0.04) # Saturated warm red-orange
	key_warm.light_energy = 8.5
	key_warm.spot_range = 35.0
	key_warm.spot_angle = 50.0
	key_warm.position = Vector3(8.0, 6.0, 8.0)
	key_warm.shadow_enabled = true
	key_warm.shadow_bias = 0.002
	add_child(key_warm)
	key_warm.look_at(_impact_pos, Vector3.UP)
	
	# Rim Light (Far Right Edge): Amber Specular Glint
	var rim_amber = OmniLight3D.new()
	rim_amber.light_color = Color(1.0, 0.65, 0.1)
	rim_amber.light_energy = 4.0
	rim_amber.omni_range = 16.0
	rim_amber.position = Vector3(12.0, 2.5, 4.0)
	add_child(rim_amber)
	
	# Fill Light (Left / Near): Cool Slate / Gunmetal Void
	var fill_cool = DirectionalLight3D.new()
	fill_cool.light_color = Color(0.15, 0.22, 0.3)
	fill_cool.light_energy = 0.6
	fill_cool.rotation_degrees = Vector3(-45, -60, 0)
	add_child(fill_cool)

func _process(delta: float) -> void:
	_time_accum += delta
	
	var k: float = audio_bridge.kick if audio_bridge else 0.2
	var v: float = audio_bridge.voice if audio_bridge else 0.25
	var sn: float = audio_bridge.snare if audio_bridge else 0.1
	
	# 1. Update Lake Shader Uniforms
	if _lake_mat:
		_lake_mat.set_shader_parameter("kick_punch", k)
		_lake_mat.set_shader_parameter("voice_energy", v)
		_lake_mat.set_shader_parameter("ripple_speed", 3.0 + v * 1.5)
	
	# 2. Worthington Fluid Column Dynamics
	if _jet_column:
		var target_jet_height = 1.0 + k * 1.4 + sin(_time_accum * 4.0) * 0.15
		_jet_column.scale.y = lerpf(_jet_column.scale.y, target_jet_height, delta * 10.0)
		_jet_column.position.y = (1.6 * _jet_column.scale.y) * 0.5
	
	# 3. Detached Droplet Ballistic Suspension
	if _detached_droplet:
		var drop_float_y = 1.6 * _jet_column.scale.y + 0.35 + sin(_time_accum * 5.0) * 0.12
		_detached_droplet.position.y = lerpf(_detached_droplet.position.y, drop_float_y, delta * 12.0)
		_detached_droplet.scale = Vector3.ONE * (1.0 + sn * 0.4)
	
	if _micro_droplet:
		var micro_float_y = _detached_droplet.position.y + 0.45 + sin(_time_accum * 7.0 + 1.0) * 0.08
		_micro_droplet.position.y = lerpf(_micro_droplet.position.y, micro_float_y, delta * 14.0)
