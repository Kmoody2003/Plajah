shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;

// ── 1-FOR-1 RECREATION OF IMAGE 1: HIGH-SPEED FLUID MACRO IMPACT ──
// Off-center impact, sharp trochoidal concentric ripples, dual-tone red/obsidian reflection,
// physical water clearcoat, and translucent subsurface scattering crests.

uniform vec2 impact_origin = vec2(1.2, 0.8);
uniform vec4 deep_obsidian_color : source_color = vec4(0.012, 0.008, 0.016, 1.0);
uniform vec4 crest_crimson_color : source_color = vec4(0.85, 0.02, 0.08, 1.0);
uniform vec4 crest_amber_color   : source_color = vec4(1.0, 0.42, 0.05, 1.0);
uniform vec4 sky_slate_color     : source_color = vec4(0.08, 0.12, 0.16, 1.0);

uniform float ripple_speed = 3.2;
uniform float ripple_freq = 3.4;
uniform float ripple_amp = 0.28;
uniform float kick_punch = 0.0;
uniform float voice_energy = 0.0;

// Trochoidal circular wave function
float get_wave_height(vec2 pos, float time, float amp, float freq, float spd) {
	vec2 delta = pos - impact_origin;
	float r = length(delta);
	if (r < 0.001) return 0.0;
	
	// Multi-frequency harmonic ripple train
	float phase = r * freq - time * spd;
	float h = sin(phase) * amp / (1.0 + r * 0.35);
	
	// Trochoidal crest sharpening: sharper peaks, wider troughs
	h += pow(max(0.0, sin(phase * 1.8)), 3.0) * (amp * 0.45) / (1.0 + r * 0.5);
	
	// High frequency capillary micro-ripples
	h += sin(r * freq * 3.2 - time * spd * 1.6) * (amp * 0.12) / (1.0 + r * 0.7);
	
	// Central impact crater depression
	float crater = -exp(-r * r * 1.8) * 0.5 * (1.0 + kick_punch * 0.8);
	return h + crater;
}

void vertex() {
	float t = TIME * (1.0 + voice_energy * 0.4);
	float cur_amp = ripple_amp * (1.0 + kick_punch * 0.9);
	
	float h = get_wave_height(VERTEX.xz, t, cur_amp, ripple_freq, ripple_speed);
	VERTEX.y += h;
	
	// Finite difference normal calculation
	float eps = 0.02;
	float hx = get_wave_height(VERTEX.xz + vec2(eps, 0.0), t, cur_amp, ripple_freq, ripple_speed);
	float hz = get_wave_height(VERTEX.xz + vec2(0.0, eps), t, cur_amp, ripple_freq, ripple_speed);
	
	vec3 n = normalize(vec3(-(hx - h) / eps, 1.0, -(hz - h) / eps));
	NORMAL = n;
}

void fragment() {
	// Screen coordinates and view vector
	vec3 v = normalize(VIEW);
	vec3 n = normalize(NORMAL);
	
	float fresnel = pow(1.0 - clamp(dot(v, n), 0.0, 1.0), 3.5);
	
	// Directional color split matching Image 1:
	// Right side (positive X) receives warm crimson/amber studio light
	// Left side (negative X) reflects cool dark slate void
	vec2 delta = UV * 2.0 - 1.0;
	float right_side_warmth = smoothstep(-0.4, 0.8, delta.x + delta.y * 0.3);
	
	// Crest height mask for subsurface scattering
	float crest_mask = smoothstep(0.02, 0.18, NORMAL.y < 0.95 ? (1.0 - NORMAL.y) * 2.0 : 0.0);
	
	vec3 warm_tint = mix(crest_crimson_color.rgb, crest_amber_color.rgb, fresnel);
	vec3 cool_tint = mix(deep_obsidian_color.rgb, sky_slate_color.rgb, fresnel * 0.6);
	
	vec3 albedo_col = mix(cool_tint, warm_tint, right_side_warmth);
	
	// Subsurface scattering translucency on sharp ripple edges
	albedo_col += crest_crimson_color.rgb * crest_mask * right_side_warmth * 1.4;
	
	ALBEDO = albedo_col;
	ROUGHNESS = 0.035; // Pristine water surface
	METALLIC = 0.22;   // High refractive index mirror reflection
	SPECULAR = 0.85;
	
	// Clearcoat water layer
	CLEARCOAT = 1.0;
	CLEARCOAT_ROUGHNESS = 0.02;
}
