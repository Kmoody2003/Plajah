//! The shell: manifest-driven describe / describe-in-context and a passthrough render.
//!
//! Step 1 (this file): every Forge effect and transition appears in the host with the right
//! identifier, grouping, contexts, clips and typed parameters, and renders by copying Source
//! (or Outgoing) to Output — so a host can load, browse and instantiate the whole suite.
//! Step 2 (next): execute `kernel_passes` through wgpu (GLSL ES → naga → native), reading the
//! ordered param values (`param_abi`) at the render time and writing into the output image.
//!
//! No dependencies, no allocation beyond CStrings for property names: the descriptors are
//! static data generated into manifest_gen.rs by `npm run ofx:manifest`.
use crate::ofx::*;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_int, c_void};
use std::ptr;
use std::sync::Mutex;

// ── static descriptor shapes (filled by manifest_gen.rs) ───────────────────────────────────
pub struct ClipDesc { pub name: &'static str, pub optional: bool }
pub struct ParamDesc {
    pub name: &'static str, pub label: &'static str, pub kind: &'static str,
    pub default: f64, pub min: f64, pub max: f64, pub display_min: f64, pub display_max: f64,
    pub increment: f64, pub hint: &'static str, pub options: &'static [&'static str],
}
pub struct PluginDesc {
    pub identifier: &'static str, pub label: &'static str, pub grouping: &'static str, pub description: &'static str,
    pub contexts: &'static [&'static str], pub clips: &'static [ClipDesc], pub params: &'static [ParamDesc],
    pub temporal: bool,
    /// (pass id, GLSL ES 3.00 source body defining `vec4 fx(vec2 uv)`), in order. Empty for transitions.
    pub kernel_passes: &'static [(&'static str, &'static str)],
    /// Param names in P0..P7 order.
    pub param_abi: &'static [&'static str],
    pub header_hash: &'static str,
}
unsafe impl Sync for PluginDesc {}

// ── host + suites ──────────────────────────────────────────────────────────────────────────
struct Suites { host: *mut OfxHost, prop: *const OfxPropertySuiteV1, effect: *const OfxImageEffectSuiteV1, param: *const OfxParameterSuiteV1 }
unsafe impl Send for Suites {}
static SUITES: Mutex<Option<Suites>> = Mutex::new(None);

pub unsafe extern "C" fn set_host(host: *mut OfxHost) {
    if let Ok(mut s) = SUITES.lock() { *s = Some(Suites { host, prop: ptr::null(), effect: ptr::null(), param: ptr::null() }); }
}

unsafe fn fetch_suites() -> bool {
    let Ok(mut guard) = SUITES.lock() else { return false };
    let Some(s) = guard.as_mut() else { return false };
    if s.host.is_null() { return false; }
    let host = &*s.host;
    let Some(fetch) = host.fetch_suite else { return false };
    s.prop = fetch(host.host, K_OFX_PROPERTY_SUITE.as_ptr() as *const c_char, 1) as *const OfxPropertySuiteV1;
    s.effect = fetch(host.host, K_OFX_IMAGE_EFFECT_SUITE.as_ptr() as *const c_char, 1) as *const OfxImageEffectSuiteV1;
    s.param = fetch(host.host, K_OFX_PARAMETER_SUITE.as_ptr() as *const c_char, 1) as *const OfxParameterSuiteV1;
    !s.prop.is_null() && !s.effect.is_null() && !s.param.is_null()
}

fn suites() -> Option<(*const OfxPropertySuiteV1, *const OfxImageEffectSuiteV1, *const OfxParameterSuiteV1)> {
    let guard = SUITES.lock().ok()?;
    let s = guard.as_ref()?;
    if s.prop.is_null() || s.effect.is_null() || s.param.is_null() { return None; }
    Some((s.prop, s.effect, s.param))
}

// ── property helpers ───────────────────────────────────────────────────────────────────────
fn cstr(s: &str) -> CString { CString::new(s.replace('\0', "")).unwrap_or_default() }
unsafe fn set_str(p: *const OfxPropertySuiteV1, h: OfxPropertySetHandle, name: &str, idx: c_int, value: &str) {
    if let Some(f) = (*p).prop_set_string { let n = cstr(name); let v = cstr(value); f(h, n.as_ptr(), idx, v.as_ptr()); }
}
unsafe fn set_int(p: *const OfxPropertySuiteV1, h: OfxPropertySetHandle, name: &str, idx: c_int, value: c_int) {
    if let Some(f) = (*p).prop_set_int { let n = cstr(name); f(h, n.as_ptr(), idx, value); }
}
unsafe fn set_double(p: *const OfxPropertySuiteV1, h: OfxPropertySetHandle, name: &str, idx: c_int, value: c_double) {
    if let Some(f) = (*p).prop_set_double { let n = cstr(name); f(h, n.as_ptr(), idx, value); }
}
unsafe fn get_double(p: *const OfxPropertySuiteV1, h: OfxPropertySetHandle, name: &str, idx: c_int) -> f64 {
    let mut v: c_double = 0.0;
    if let Some(f) = (*p).prop_get_double { let n = cstr(name); f(h, n.as_ptr(), idx, &mut v); }
    v
}
unsafe fn get_int(p: *const OfxPropertySuiteV1, h: OfxPropertySetHandle, name: &str, idx: c_int) -> c_int {
    let mut v: c_int = 0;
    if let Some(f) = (*p).prop_get_int { let n = cstr(name); f(h, n.as_ptr(), idx, &mut v); }
    v
}
unsafe fn get_ptr(p: *const OfxPropertySuiteV1, h: OfxPropertySetHandle, name: &str) -> *mut c_void {
    let mut v: *mut c_void = ptr::null_mut();
    if let Some(f) = (*p).prop_get_pointer { let n = cstr(name); f(h, n.as_ptr(), 0, &mut v); }
    v
}
unsafe fn get_string(p: *const OfxPropertySuiteV1, h: OfxPropertySetHandle, name: &str) -> String {
    let mut v: *mut c_char = ptr::null_mut();
    if let Some(f) = (*p).prop_get_string { let n = cstr(name); f(h, n.as_ptr(), 0, &mut v); }
    if v.is_null() { String::new() } else { CStr::from_ptr(v).to_string_lossy().into_owned() }
}

// ── actions ────────────────────────────────────────────────────────────────────────────────
pub unsafe fn dispatch(plugin: &'static PluginDesc, action: *const c_char, handle: *const c_void, in_args: OfxPropertySetHandle, out_args: OfxPropertySetHandle) -> OfxStatus {
    if action.is_null() { return K_OFX_STAT_ERR_VALUE; }
    let action = CStr::from_ptr(action).to_string_lossy();
    match action.as_ref() {
        ACTION_LOAD => if fetch_suites() { K_OFX_STAT_OK } else { K_OFX_STAT_ERR_MISSING_HOST_FEATURE },
        ACTION_UNLOAD => K_OFX_STAT_OK,
        ACTION_DESCRIBE => describe(plugin, handle as OfxImageEffectHandle),
        ACTION_DESCRIBE_IN_CONTEXT => describe_in_context(plugin, handle as OfxImageEffectHandle),
        ACTION_CREATE_INSTANCE | ACTION_DESTROY_INSTANCE => K_OFX_STAT_OK,
        ACTION_IS_IDENTITY | ACTION_GET_ROD => K_OFX_STAT_REPLY_DEFAULT,
        ACTION_RENDER => render(plugin, handle as OfxImageEffectHandle, in_args, out_args),
        _ => K_OFX_STAT_REPLY_DEFAULT,
    }
}

unsafe fn describe(plugin: &PluginDesc, effect: OfxImageEffectHandle) -> OfxStatus {
    let Some((prop, fx, _)) = suites() else { return K_OFX_STAT_ERR_MISSING_HOST_FEATURE };
    let mut props: OfxPropertySetHandle = ptr::null_mut();
    let Some(get_props) = (*fx).get_property_set else { return K_OFX_STAT_ERR_MISSING_HOST_FEATURE };
    if get_props(effect, &mut props) != K_OFX_STAT_OK || props.is_null() { return K_OFX_STAT_FAILED; }
    set_str(prop, props, P_LABEL, 0, plugin.label);
    set_str(prop, props, P_SHORT_LABEL, 0, plugin.label);
    set_str(prop, props, P_LONG_LABEL, 0, plugin.label);
    set_str(prop, props, P_PLUGIN_DESCRIPTION, 0, plugin.description);
    set_str(prop, props, P_GROUPING, 0, plugin.grouping);
    for (i, ctx) in plugin.contexts.iter().enumerate() { set_str(prop, props, P_SUPPORTED_CONTEXTS, i as c_int, ctx); }
    set_str(prop, props, P_SUPPORTED_PIXEL_DEPTHS, 0, BIT_DEPTH_BYTE);
    set_str(prop, props, P_SUPPORTED_PIXEL_DEPTHS, 1, BIT_DEPTH_FLOAT);
    set_int(prop, props, P_SUPPORTS_TILES, 0, 0);
    set_int(prop, props, P_SUPPORTS_MULTI_RESOLUTION, 0, 0);
    set_int(prop, props, P_TEMPORAL_CLIP_ACCESS, 0, if plugin.temporal { 1 } else { 0 });
    set_str(prop, props, P_RENDER_THREAD_SAFETY, 0, "OfxImageEffectRenderInstanceSafe");
    K_OFX_STAT_OK
}

unsafe fn describe_in_context(plugin: &PluginDesc, effect: OfxImageEffectHandle) -> OfxStatus {
    let Some((prop, fx, param)) = suites() else { return K_OFX_STAT_ERR_MISSING_HOST_FEATURE };
    if let Some(clip_define) = (*fx).clip_define {
        for clip in plugin.clips {
            let mut cprops: OfxPropertySetHandle = ptr::null_mut();
            let name = cstr(clip.name);
            if clip_define(effect, name.as_ptr(), &mut cprops) == K_OFX_STAT_OK && !cprops.is_null() {
                set_str(prop, cprops, P_SUPPORTED_COMPONENTS, 0, COMP_RGBA);
                set_str(prop, cprops, P_SUPPORTED_COMPONENTS, 1, COMP_RGB);
                set_str(prop, cprops, P_SUPPORTED_COMPONENTS, 2, COMP_ALPHA);
                set_int(prop, cprops, P_CLIP_OPTIONAL, 0, if clip.optional { 1 } else { 0 });
            }
        }
    }
    let mut pset: OfxParamSetHandle = ptr::null_mut();
    let Some(get_pset) = (*fx).get_param_set else { return K_OFX_STAT_ERR_MISSING_HOST_FEATURE };
    if get_pset(effect, &mut pset) != K_OFX_STAT_OK || pset.is_null() { return K_OFX_STAT_FAILED; }
    let Some(param_define) = (*param).param_define else { return K_OFX_STAT_ERR_MISSING_HOST_FEATURE };
    for p in plugin.params {
        let mut pprops: OfxPropertySetHandle = ptr::null_mut();
        let kind = cstr(p.kind); let name = cstr(p.name);
        if param_define(pset, kind.as_ptr(), name.as_ptr(), &mut pprops) != K_OFX_STAT_OK || pprops.is_null() { continue; }
        set_str(prop, pprops, P_LABEL, 0, p.label);
        set_int(prop, pprops, P_PARAM_ANIMATES, 0, 1);
        if !p.hint.is_empty() { set_str(prop, pprops, P_PARAM_HINT, 0, p.hint); }
        match p.kind {
            "OfxParamTypeDouble" => {
                set_double(prop, pprops, P_PARAM_DEFAULT, 0, p.default);
                set_double(prop, pprops, P_PARAM_MIN, 0, p.min); set_double(prop, pprops, P_PARAM_MAX, 0, p.max);
                set_double(prop, pprops, P_PARAM_DISPLAY_MIN, 0, p.display_min); set_double(prop, pprops, P_PARAM_DISPLAY_MAX, 0, p.display_max);
                if p.increment > 0.0 { set_double(prop, pprops, P_PARAM_INCREMENT, 0, p.increment); }
            }
            "OfxParamTypeInteger" => {
                set_int(prop, pprops, P_PARAM_DEFAULT, 0, p.default.round() as c_int);
                set_int(prop, pprops, P_PARAM_MIN, 0, p.min.round() as c_int); set_int(prop, pprops, P_PARAM_MAX, 0, p.max.round() as c_int);
                set_int(prop, pprops, P_PARAM_DISPLAY_MIN, 0, p.display_min.round() as c_int); set_int(prop, pprops, P_PARAM_DISPLAY_MAX, 0, p.display_max.round() as c_int);
            }
            "OfxParamTypeBoolean" => { set_int(prop, pprops, P_PARAM_DEFAULT, 0, if p.default >= 0.5 { 1 } else { 0 }); }
            "OfxParamTypeChoice" => {
                set_int(prop, pprops, P_PARAM_DEFAULT, 0, p.default.round() as c_int);
                for (i, o) in p.options.iter().enumerate() { set_str(prop, pprops, P_PARAM_CHOICE_OPTION, i as c_int, o); }
            }
            _ => {}
        }
    }
    K_OFX_STAT_OK
}

/// Passthrough render: copy the first input clip's pixels into Output over the render window.
/// Step 2 replaces the copy with kernel execution.
unsafe fn render(plugin: &PluginDesc, effect: OfxImageEffectHandle, in_args: OfxPropertySetHandle, _out_args: OfxPropertySetHandle) -> OfxStatus {
    let Some((prop, fx, _)) = suites() else { return K_OFX_STAT_ERR_MISSING_HOST_FEATURE };
    let (Some(clip_get_handle), Some(clip_get_image), Some(clip_release_image)) = ((*fx).clip_get_handle, (*fx).clip_get_image, (*fx).clip_release_image) else { return K_OFX_STAT_ERR_MISSING_HOST_FEATURE };
    let time = get_double(prop, in_args, P_TIME, 0);
    let mut win = OfxRectI { x1: 0, y1: 0, x2: 0, y2: 0 };
    if let Some(get_int_n) = (*prop).prop_get_int_n { let n = cstr(P_RENDER_WINDOW); get_int_n(in_args, n.as_ptr(), 4, &mut win.x1 as *mut c_int); }

    let input_name = plugin.clips.iter().map(|c| c.name).find(|n| *n == "Source" || *n == "Outgoing").unwrap_or("Source");
    let mut src_clip: OfxImageClipHandle = ptr::null_mut(); let mut out_clip: OfxImageClipHandle = ptr::null_mut();
    let sname = cstr(input_name); let oname = cstr("Output");
    if clip_get_handle(effect, sname.as_ptr(), &mut src_clip, ptr::null_mut()) != K_OFX_STAT_OK { return K_OFX_STAT_FAILED; }
    if clip_get_handle(effect, oname.as_ptr(), &mut out_clip, ptr::null_mut()) != K_OFX_STAT_OK { return K_OFX_STAT_FAILED; }
    let mut src_img: OfxPropertySetHandle = ptr::null_mut(); let mut out_img: OfxPropertySetHandle = ptr::null_mut();
    if clip_get_image(src_clip, time, ptr::null(), &mut src_img) != K_OFX_STAT_OK || src_img.is_null() { return K_OFX_STAT_FAILED; }
    if clip_get_image(out_clip, time, ptr::null(), &mut out_img) != K_OFX_STAT_OK || out_img.is_null() { clip_release_image(src_img); return K_OFX_STAT_FAILED; }

    let status = copy_image(prop, src_img, out_img, &win);
    clip_release_image(src_img); clip_release_image(out_img);
    status
}

unsafe fn image_bounds(prop: *const OfxPropertySuiteV1, img: OfxPropertySetHandle) -> OfxRectI {
    let mut b = OfxRectI { x1: 0, y1: 0, x2: 0, y2: 0 };
    if let Some(get_int_n) = (*prop).prop_get_int_n { let n = cstr(P_IMAGE_BOUNDS); get_int_n(img, n.as_ptr(), 4, &mut b.x1 as *mut c_int); }
    b
}

unsafe fn copy_image(prop: *const OfxPropertySuiteV1, src: OfxPropertySetHandle, dst: OfxPropertySetHandle, win: &OfxRectI) -> OfxStatus {
    let sdata = get_ptr(prop, src, P_IMAGE_DATA) as *const u8; let ddata = get_ptr(prop, dst, P_IMAGE_DATA) as *mut u8;
    if sdata.is_null() || ddata.is_null() { return K_OFX_STAT_FAILED; }
    let sb = image_bounds(prop, src); let db = image_bounds(prop, dst);
    let srow = get_int(prop, src, P_IMAGE_ROW_BYTES, 0) as isize; let drow = get_int(prop, dst, P_IMAGE_ROW_BYTES, 0) as isize;
    let depth = get_string(prop, dst, P_PIXEL_DEPTH); let comps = get_string(prop, dst, P_COMPONENTS);
    if depth != get_string(prop, src, P_PIXEL_DEPTH) || comps != get_string(prop, src, P_COMPONENTS) { return K_OFX_STAT_ERR_UNSUPPORTED; }
    let bytes_per_comp: isize = match depth.as_str() { BIT_DEPTH_BYTE => 1, BIT_DEPTH_SHORT => 2, BIT_DEPTH_FLOAT => 4, _ => return K_OFX_STAT_ERR_UNSUPPORTED };
    let ncomp: isize = match comps.as_str() { COMP_RGBA => 4, COMP_RGB => 3, COMP_ALPHA => 1, _ => return K_OFX_STAT_ERR_UNSUPPORTED };
    let px = bytes_per_comp * ncomp;
    let x1 = win.x1.max(sb.x1).max(db.x1); let x2 = win.x2.min(sb.x2).min(db.x2);
    let y1 = win.y1.max(sb.y1).max(db.y1); let y2 = win.y2.min(sb.y2).min(db.y2);
    if x2 <= x1 || y2 <= y1 { return K_OFX_STAT_OK; }
    let width_bytes = ((x2 - x1) as isize) * px;
    for y in y1..y2 {
        let s = sdata.offset(((y - sb.y1) as isize) * srow + ((x1 - sb.x1) as isize) * px);
        let d = ddata.offset(((y - db.y1) as isize) * drow + ((x1 - db.x1) as isize) * px);
        ptr::copy_nonoverlapping(s, d, width_bytes as usize);
    }
    K_OFX_STAT_OK
}

#[cfg(test)]
mod tests {
    use crate::manifest_gen::{DESCRIPTORS, PLUGIN_COUNT};
    #[test]
    fn descriptors_are_consistent() {
        assert_eq!(DESCRIPTORS.len(), PLUGIN_COUNT);
        assert!(PLUGIN_COUNT > 100);
        assert!(DESCRIPTORS.iter().all(|p| p.identifier.starts_with("com.plajah.fabula.")));
        let trails = DESCRIPTORS.iter().find(|p| p.identifier.ends_with(".trails")).expect("trails");
        assert!(trails.temporal);
        assert_eq!(trails.clips[0].name, "Source");
        assert_eq!(trails.param_abi.len(), trails.params.len());
        assert!(trails.params.iter().any(|p| p.kind == "OfxParamTypeChoice" && p.options.len() == 3));
    }
}
