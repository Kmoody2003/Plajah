extends Node3D
class_name ObsidianRippleSceneGD

# ── Scene Controller for Image 1: Concentric Obsidian Fluid Ripples & Coronet Impact ──
# Drives spatial PBR shader, coronet mesh scaling, and GPUParticles3D droplets.

@export var audio_bridge: Node
@export var lake_mesh: MeshInstance3D
@export var coronet_mesh: MeshInstance3D
@export var droplet_particles: GPUParticles3D
@export var crimson_spot_light: SpotLight3D
@export var amber_point_light: OmniLight3D
@export var main_camera: Camera3D

var _lake_mat: ShaderMaterial
var _time_accum: float = 0.0
var _last_kick_time: float = 0.0
var _cam_base_pos: Vector3

func _ready() -> void:
	if lake_mesh and lake_mesh.material_override is ShaderMaterial:
		_lake_mat = lake_mesh.material_override
	if main_camera:
		_cam_base_pos = main_camera.position

func _process(delta: float) -> void:
	_time_accum += delta

	var k: float = audio_bridge.kick if audio_bridge else 0.2
	var v: float = audio_bridge.voice if audio_bridge else 0.25
	var sn: float = audio_bridge.snare if audio_bridge else 0.1

	# 1. Update Spatial Shader parameters
	if _lake_mat:
		_lake_mat.set_shader_parameter("kick_punch", k)
		_lake_mat.set_shader_parameter("voice_energy", v)
		_lake_mat.set_shader_parameter("ripple_speed", 2.6 + v * 2.0)

	# 2. Coronet Crown Splash Scaling & Ballistic Droplets
	if coronet_mesh:
		if k > 0.45 and (_time_accum - _last_kick_time > 0.18):
			_last_kick_time = _time_accum
			coronet_mesh.scale = Vector3(1.3, 1.8 + k * 1.5, 1.3)
			if droplet_particles:
				droplet_particles.restart()
				droplet_particles.emitting = true

		var target_scale = Vector3(1.0, 0.75, 1.0)
		coronet_mesh.scale = coronet_mesh.scale.lerp(target_scale, delta * 8.0)
		coronet_mesh.rotate_y(delta * 0.4)

	# 3. Dynamic Raking Lights
	if crimson_spot_light:
		crimson_spot_light.light_energy = lerpf(crimson_spot_light.light_energy, 4.0 + k * 12.0, delta * 15.0)

	if amber_point_light:
		amber_point_light.light_energy = 2.0 + v * 3.5
		amber_point_light.position.y = 1.2 + sin(_time_accum * 2.0) * 0.2

	# 4. Camera Shake on kick
	if main_camera:
		var shake = (k * 0.07) if k > 0.5 else 0.0
		main_camera.position = _cam_base_pos + Vector3(
			randf_range(-shake, shake),
			randf_range(-shake, shake),
			0.0
		)
