extends Node3D
class_name Image2NeonColonnade1to1

# ── 1-FOR-1 RECREATION OF IMAGE 2: ARCHITECTURAL NEON COLONNADE ──
# Faithfully reproduces:
# 1. 48 high-density vertical slats with staggered heights, widths, and depths
# 2. Brushed dark gunmetal / obsidian acrylic casing with beveled specular rims
# 3. Embedded neon phosphor light rods in Image 2's exact saturated color sequence
# 4. Godot 4 Forward+ SDFGI dynamic crevice bounce lighting

@export var audio_bridge: Node
@export var slat_count: int = 48
@export var spacing: float = 0.26

var _battens: Array[MeshInstance3D] = []
var _neon_rods: Array[MeshInstance3D] = []
var _neon_mats: Array[StandardMaterial3D] = []
var _base_positions: Array[Vector3] = []

# Exact Color Palette from Image 2
var _palette: Array[Color] = [
	Color(0.0, 0.9, 1.0),      # Electric Cyan
	Color(1.0, 0.92, 0.0),     # Acid Neon Yellow
	Color(1.0, 0.38, 0.0),     # Hot Orange
	Color(1.0, 0.0, 0.22),     # Vivid Crimson
	Color(1.0, 0.0, 0.55),     # Neon Pink/Magenta
	Color(0.48, 0.0, 0.95),    # Deep Violet
	Color(0.0, 0.55, 1.0),     # Sky Blue
	Color(1.0, 0.75, 0.0)      # Golden Amber
]

func _ready() -> void:
	var total_w = slat_count * spacing
	
	# Slat Body Material: Dark brushed gunmetal / black lacquer with bevel sheen
	var metal_mat = StandardMaterial3D.new()
	metal_mat.albedo_color = Color(0.05, 0.045, 0.065)
	metal_mat.metallic = 0.88
	metal_mat.roughness = 0.28
	metal_mat.clearcoat_enabled = true
	metal_mat.clearcoat = 0.8
	metal_mat.clearcoat_roughness = 0.08
	
	for i in range(slat_count):
		var x = -total_w / 2.0 + i * spacing
		
		# Varied staggered heights and depths matching Image 2's organic architectural rhythm
		var hash_val = fmod(sin(float(i) * 12.9898) * 43758.5453, 1.0)
		var slat_h = 7.0 + hash_val * 4.5
		var slat_d = 0.45 + hash_val * 0.35
		var y_offset = (hash_val - 0.5) * 1.8
		var z_step = (hash_val - 0.5) * 0.25
		
		# 1. Dark Slat Mesh
		var box_mesh = BoxMesh.new()
		box_mesh.size = Vector3(0.20, slat_h, slat_d)
		
		var batten = MeshInstance3D.new()
		batten.mesh = box_mesh
		batten.material_override = metal_mat
		batten.position = Vector3(x, y_offset, z_step)
		add_child(batten)
		_battens.append(batten)
		_base_positions.append(batten.position)
		
		# 2. Embedded Neon Rod inside Crevice
		var col = _palette[i % _palette.size()]
		var neon_mat = StandardMaterial3D.new()
		neon_mat.albedo_color = col
		neon_mat.emission_enabled = true
		neon_mat.emission = col
		neon_mat.emission_energy_multiplier = 4.0 # Radiates indirect light into SDFGI
		
		var rod_mesh = BoxMesh.new()
		var rod_h = slat_h * (0.65 + hash_val * 0.3)
		rod_mesh.size = Vector3(0.05, rod_h, 0.08)
		
		var rod = MeshInstance3D.new()
		rod.mesh = rod_mesh
		rod.material_override = neon_mat
		rod.position = Vector3(x + spacing * 0.45, y_offset, z_step + slat_d * 0.48)
		add_child(rod)
		_neon_rods.append(rod)
		_neon_mats.append(neon_mat)

func _process(delta: float) -> void:
	var k: float = audio_bridge.kick if audio_bridge else 0.2
	var sn: float = audio_bridge.snare if audio_bridge else 0.1
	var v: float = audio_bridge.voice if audio_bridge else 0.25
	var time_sec = Time.get_ticks_msec() * 0.001
	
	# 1. Motorized Z-depth extrusion equalizer wave
	for i in range(_battens.size()):
		var b = _battens[i]
		var base_p = _base_positions[i]
		var wave = sin(float(i) * 0.28 - time_sec * 3.5) * 0.5 + 0.5
		var target_z = base_p.z + wave * (0.2 + k * 2.2)
		b.position.z = lerpf(b.position.z, target_z, delta * 12.0)
		
		# Slat rotation flip on snare
		var rot_sign = 1.0 if (i % 2 == 0) else -1.0
		var target_rot_y = rot_sign * (sn * 0.32)
		b.rotation.y = lerpf(b.rotation.y, target_rot_y, delta * 14.0)
	
	# 2. Neon Rod Emission Glow
	for i in range(_neon_mats.size()):
		var chase = sin(float(i) * 0.35 - time_sec * 4.5) * 0.5 + 0.5
		var energy = 2.5 + chase * 3.0 + k * 4.5 + v * 3.0
		_neon_mats[i].emission_energy_multiplier = energy
