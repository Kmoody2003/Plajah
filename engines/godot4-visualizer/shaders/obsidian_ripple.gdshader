shader_type spatial;
render_mode blend_mix, depth_draw_always, cull_back, diffuse_burley, specular_schlick_ggx;

// ── Plajah Obsidian Ripple PBR Spatial Shader (Godot 4) ──
uniform vec3 deep_obsidian_color : source_color = vec3(0.024, 0.016, 0.035);
uniform vec3 crest_crimson_color : source_color = vec3(0.831, 0.0, 0.333);
uniform vec3 rim_amber_color : source_color = vec3(1.0, 0.549, 0.0);

uniform float ripple_speed : hint_range(0.5, 8.0) = 2.8;
uniform float ripple_frequency : hint_range(0.5, 10.0) = 2.6;
uniform float ripple_amplitude : hint_range(0.0, 1.5) = 0.25;

uniform float kick_punch : hint_range(0.0, 2.0) = 0.0;
uniform float voice_energy : hint_range(0.0, 2.0) = 0.0;

uniform float clearcoat_strength : hint_range(0.0, 1.0) = 1.0;
uniform float roughness_val : hint_range(0.0, 1.0) = 0.06;
uniform float metallic_val : hint_range(0.0, 1.0) = 0.18;

varying vec3 v_world_pos;
varying float v_wave_height;

float calc_wave(vec2 xz, float time) {
    float dist = length(xz);
    float base_wave = sin(dist * ripple_frequency - time * ripple_speed) / (1.0 + dist * 0.32);
    base_wave *= (ripple_amplitude + voice_energy * 0.35);

    // Shockwave ring on kick
    float shock_radius = mod(time * 7.0, 18.0);
    float shock = exp(-pow(dist - shock_radius, 2.0) * 1.4) * (kick_punch * 0.75);

    return base_wave + shock;
}

void vertex() {
    v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
    float time = TIME;

    float h = calc_wave(v_world_pos.xz, time);
    v_wave_height = h;
    VERTEX.y += h;

    // Normal reconstruction via finite difference
    vec2 eps = vec2(0.04, 0.0);
    float hx = calc_wave(v_world_pos.xz + eps.xy, time) - h;
    float hz = calc_wave(v_world_pos.xz + eps.yx, time) - h;
    vec3 local_n = normalize(vec3(-hx / eps.x, 1.0, -hz / eps.x));
    NORMAL = local_n;
}

void fragment() {
    // Obsidian deep base blending with crest iridescence
    float crest_factor = smoothstep(0.05, 0.35, v_wave_height);
    vec3 albedo = mix(deep_obsidian_color, crest_crimson_color, crest_factor * 0.85);

    // Subtle golden amber rim reflection along grazing angles
    float fresnel = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
    vec3 final_albedo = mix(albedo, rim_amber_color, fresnel * 0.35 * (1.0 + kick_punch * 0.5));

    ALBEDO = final_albedo;
    ROUGHNESS = roughness_val;
    METALLIC = metallic_val;
    SPECULAR = 0.85;

    // Clearcoat for wet liquid / obsidian lacquer sheen
    CLEARCOAT = clearcoat_strength;
    CLEARCOAT_ROUGHNESS = 0.03;

    // Subsurface scattering proxy for deep water illumination
    SSS_STRENGTH = 0.45 * crest_factor;
}
