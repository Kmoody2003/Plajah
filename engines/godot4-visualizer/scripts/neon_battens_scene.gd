extends Node3D
class_name NeonBattensSceneGD

# ── Scene Controller for Image 2: 42 Architectural Louvers & SDFGI Bounce Light ──
# Demonstrates Vulkan Forward+ SDFGI in Godot 4.

@export var audio_bridge: Node
@export var slat_count: int = 42
@export var spacing: float = 0.33
@export var snare_strobe: SpotLight3D

var _battens: Array[MeshInstance3D] = []
var _neon_materials: Array[StandardMaterial3D] = []

var _palette: Array[Color] = [
	Color(0.0, 0.855, 0.953), # Cyan
	Color(0.420, 0.0, 0.600), # Violet
	Color(0.831, 0.0, 0.333), # Magenta
	Color(1.0, 0.549, 0.0)    # Amber
]

func _ready() -> void:
	var total_w = slat_count * spacing
	var metal_mat = StandardMaterial3D.new()
	metal_mat.albedo_color = Color(0.06, 0.055, 0.08)
	metal_mat.metallic = 0.88
	metal_mat.roughness = 0.32

	var box_mesh = BoxMesh.new()
	box_mesh.size = Vector3(0.24, 9.5, 1.0)

	var rod_mesh = CylinderMesh.new()
	rod_mesh.top_radius = 0.024
	rod_mesh.bottom_radius = 0.024
	rod_mesh.height = 9.0
	rod_mesh.radial_segments = 8

	for i in range(slat_count):
		var x = -total_w / 2.0 + i * spacing
		var z_arc = -pow((float(i) - slat_count / 2.0) / (slat_count / 2.0), 2.0) * 0.7

		var batten = MeshInstance3D.new()
		batten.mesh = box_mesh
		batten.material_override = metal_mat
		batten.position = Vector3(x, 0.0, z_arc)
		add_child(batten)
		_battens.append(batten)

		if i < slat_count - 1:
			var col = _palette[i % _palette.size()]
			var neon_mat = StandardMaterial3D.new()
			neon_mat.albedo_color = col
			neon_mat.emission_enabled = true
			neon_mat.emission = col
			neon_mat.emission_energy_multiplier = 2.0 # Real-time bounce into SDFGI

			var rod = MeshInstance3D.new()
			rod.mesh = rod_mesh
			rod.material_override = neon_mat
			rod.position = Vector3(x + spacing / 2.0, 0.0, z_arc + 0.18)
			add_child(rod)
			_neon_materials.append(neon_mat)

func _process(delta: float) -> void:
	var k: float = audio_bridge.kick if audio_bridge else 0.2
	var sn: float = audio_bridge.snare if audio_bridge else 0.1
	var v: float = audio_bridge.voice if audio_bridge else 0.25

	var time_sec = Time.get_ticks_msec() * 0.001

	# 1. Physical Z-depth extrusion (equalizer)
	for i in range(_battens.size()):
		var batten = _battens[i]
		var wave = sin(float(i) * 0.25 - time_sec * 3.0) * 0.5 + 0.5
		var target_z = wave * (k * 2.2 + 0.2)
		batten.position.z = lerpf(batten.position.z, target_z, delta * 12.0)

		# Snare rotation twist
		var target_rot_y = (1.0 if (i % 2 == 0) else -1.0) * (sn * 0.35)
		batten.rotation.y = lerpf(batten.rotation.y, target_rot_y, delta * 15.0)

	# 2. Neon Rod Emission Pulse
	for i in range(_neon_materials.size()):
		var chase = sin(float(i) * 0.4 - time_sec * 5.0) * 0.5 + 0.5
		var energy = 1.5 + chase * 2.0 + k * 4.0 + v * 2.5
		_neon_materials[i].emission_energy_multiplier = energy

	# 3. Snare Strobe
	if snare_strobe:
		snare_strobe.light_energy = (sn * 14.0) if (sn > 0.35) else 0.0
