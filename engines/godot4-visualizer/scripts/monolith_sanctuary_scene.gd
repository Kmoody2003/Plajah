extends Node3D
class_name MonolithSanctuarySceneGD

# ── Scene Controller for Image 3: Monolith Exhibition Sanctuary (Godot 4) ──
# Showcases Godot 4's Vulkan Forward+ Screen Space Reflections (SSR) and Volumetric Fog.
# 5 monumental obsidian slabs reflect onto a mirror-wet black lacquer floor plane.

@export var audio_bridge: Node
@export var key_spot_light: SpotLight3D
@export var amber_rim_light: OmniLight3D
@export var floor_mesh: MeshInstance3D

var _monoliths: Array[Node3D] = []
var _light_beams: Array[MeshInstance3D] = []
var _beam_materials: Array[StandardMaterial3D] = []

var _palette: Array[Color] = [
	Color(0.831, 0.0, 0.333), # Magenta
	Color(0.0, 0.855, 0.953), # Cyan
	Color(1.0, 0.549, 0.0),   # Amber
	Color(0.0, 0.855, 0.953), # Cyan
	Color(0.831, 0.0, 0.333)  # Magenta
]

func _ready() -> void:
	# 1. Mirror-Wet Black Lacquer Floor Material with SSR
	var floor_mat = StandardMaterial3D.new()
	floor_mat.albedo_color = Color(0.02, 0.015, 0.03)
	floor_mat.metallic = 0.95
	floor_mat.roughness = 0.04 # Pristine mirror sheen for SSR
	floor_mat.clearcoat_enabled = true
	floor_mat.clearcoat = 1.0
	floor_mat.clearcoat_roughness = 0.02

	if floor_mesh:
		floor_mesh.material_override = floor_mat

	# 2. Build 5 Monumental Obsidian Monolith Slabs
	var slab_w = 1.8
	var slab_h = 8.2
	var slab_d = 0.42

	var slab_box = BoxMesh.new()
	slab_box.size = Vector3(slab_w, slab_h, slab_d)

	var slab_mat = StandardMaterial3D.new()
	slab_mat.albedo_color = Color(0.04, 0.035, 0.055)
	slab_mat.metallic = 0.85
	slab_mat.roughness = 0.18

	var beam_cyl = CylinderMesh.new()
	beam_cyl.top_radius = 1.4
	beam_cyl.bottom_radius = 0.85
	beam_cyl.height = 24.0
	beam_cyl.radial_segments = 24

	var coords = [
		{"pos": Vector3(-5.2, slab_h / 2.0, -1.8), "rot_y": 0.25},
		{"pos": Vector3(-2.6, slab_h / 2.0, 0.2),  "rot_y": 0.12},
		{"pos": Vector3(0.0,  slab_h / 2.0, 1.4),  "rot_y": 0.0},
		{"pos": Vector3(2.6,  slab_h / 2.0, 0.2),  "rot_y": -0.12},
		{"pos": Vector3(5.2,  slab_h / 2.0, -1.8), "rot_y": -0.25}
	]

	for i in range(coords.size()):
		var c = coords[i]
		var col = _palette[i]

		var slab_group = Node3D.new()
		slab_group.position = c["pos"]
		slab_group.rotation.y = c["rot_y"]

		# Monolith Outer Body
		var body = MeshInstance3D.new()
		body.mesh = slab_box
		body.material_override = slab_mat
		slab_group.add_child(body)

		# Illuminated Display Face
		var face_mesh = QuadMesh.new()
		face_mesh.size = Vector2(slab_w * 0.9, slab_h * 0.94)

		var face_mat = StandardMaterial3D.new()
		face_mat.albedo_color = col
		face_mat.emission_enabled = true
		face_mat.emission = col
		face_mat.emission_energy_multiplier = 1.8

		var face = MeshInstance3D.new()
		face.mesh = face_mesh
		face.material_override = face_mat
		face.position = Vector3(0.0, 0.0, slab_d / 2.0 + 0.01)
		slab_group.add_child(face)

		# Volumetric Light Beam Shooting Upward
		var beam_mat = StandardMaterial3D.new()
		beam_mat.albedo_color = col
		beam_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		beam_mat.albedo_color.a = 0.15
		beam_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		beam_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		beam_mat.emission_enabled = true
		beam_mat.emission = col
		beam_mat.emission_energy_multiplier = 1.2

		var beam = MeshInstance3D.new()
		beam.mesh = beam_cyl
		beam.material_override = beam_mat
		beam.position = Vector3(0.0, slab_h / 2.0 + 12.0, 0.0)
		slab_group.add_child(beam)

		add_child(slab_group)
		_monoliths.append(slab_group)
		_light_beams.append(beam)
		_beam_materials.append(beam_mat)

func _process(delta: float) -> void:
	var k: float = audio_bridge.kick if audio_bridge else 0.2
	var v: float = audio_bridge.voice if audio_bridge else 0.25
	var sn: float = audio_bridge.snare if audio_bridge else 0.1

	# Volumetric Light Column Pulsing on Kicks
	for i in range(_beam_materials.size()):
		var target_alpha = 0.15 + k * 0.65 + (sn * 0.4 if i == 2 else 0.0)
		_beam_materials[i].albedo_color.a = lerpf(_beam_materials[i].albedo_color.a, target_alpha, delta * 12.0)
		_beam_materials[i].emission_energy_multiplier = 1.0 + k * 4.0

	# Key Overhead Spotlight
	if key_spot_light:
		key_spot_light.light_energy = lerpf(key_spot_light.light_energy, 3.5 + k * 8.0, delta * 15.0)

	if amber_rim_light:
		amber_rim_light.light_energy = 2.0 + v * 3.0
