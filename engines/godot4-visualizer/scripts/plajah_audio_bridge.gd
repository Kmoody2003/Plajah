extends Node
class_name PlajahAudioBridgeGD

# ── Plajah Multi-Stem Audio Analyzer Bridge (GDScript) ──
# Analyzes real-time audio spectrum from Godot AudioServer,
# isolating sub-bass, kick drum, vocal formants, snare snap, and air shimmer.

@export var bus_name: String = "Master"

var kick: float = 0.0
var snare: float = 0.0
var voice: float = 0.0
var air: float = 0.0
var sub_bass: float = 0.0
var sub: float = 0.0
var level: float = 0.0

var _spectrum: AudioEffectSpectrumAnalyzerInstance

func _ready() -> void:
	var bus_idx = AudioServer.get_bus_index(bus_name)
	if bus_idx >= 0:
		for i in range(AudioServer.get_bus_effect_count(bus_idx)):
			var eff = AudioServer.get_bus_effect_instance(bus_idx, i)
			if eff is AudioEffectSpectrumAnalyzerInstance:
				_spectrum = eff
				print("[PlajahAudioBridgeGD] Spectrum Analyzer bound successfully on bus: ", bus_name)
				break

func _process(delta: float) -> void:
	if not _spectrum:
		return

	# Sample linear magnitudes across isolated stem bands
	var sub_mag: Vector2 = _spectrum.get_magnitude_for_frequency_range(20.0, 60.0)
	var kick_mag: Vector2 = _spectrum.get_magnitude_for_frequency_range(40.0, 110.0)
	var voice_mag: Vector2 = _spectrum.get_magnitude_for_frequency_range(1000.0, 3200.0)
	var snare_mag: Vector2 = _spectrum.get_magnitude_for_frequency_range(1800.0, 5000.0)
	var air_mag: Vector2 = _spectrum.get_magnitude_for_frequency_range(9000.0, 16000.0)

	# Exponential smoothing with responsive attack and natural release
	sub_bass = lerpf(sub_bass, sub_mag.length() * 15.0, delta * 18.0)
	sub = sub_bass
	kick = lerpf(kick, kick_mag.length() * 18.0, delta * 22.0)
	voice = lerpf(voice, voice_mag.length() * 14.0, delta * 14.0)
	snare = lerpf(snare, snare_mag.length() * 18.0, delta * 24.0)
	air = lerpf(air, air_mag.length() * 22.0, delta * 16.0)

	level = (kick + voice + snare + air) * 0.25
