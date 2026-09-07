//! Minimal hand-declared OpenFX 1.4 C ABI: the plugin struct, the host, and the three suites
//! the shell uses (property, image effect, parameter). Layouts follow ofxCore.h /
//! ofxProperty.h / ofxImageEffect.h / ofxParam.h field order exactly — the host reads these
//! as C structs, so ordering is the contract.
#![allow(non_camel_case_types, dead_code)]
use std::os::raw::{c_char, c_double, c_int, c_uint, c_void};

pub type OfxStatus = c_int;
pub type OfxPropertySetHandle = *mut c_void;
pub type OfxImageEffectHandle = *mut c_void;
pub type OfxImageClipHandle = *mut c_void;
pub type OfxParamSetHandle = *mut c_void;
pub type OfxParamHandle = *mut c_void;
pub type OfxImageMemoryHandle = *mut c_void;
pub type OfxTime = c_double;

pub const K_OFX_STAT_OK: OfxStatus = 0;
pub const K_OFX_STAT_FAILED: OfxStatus = 1;
pub const K_OFX_STAT_ERR_FATAL: OfxStatus = 2;
pub const K_OFX_STAT_ERR_UNKNOWN: OfxStatus = 3;
pub const K_OFX_STAT_ERR_MISSING_HOST_FEATURE: OfxStatus = 4;
pub const K_OFX_STAT_ERR_UNSUPPORTED: OfxStatus = 5;
pub const K_OFX_STAT_ERR_VALUE: OfxStatus = 9;
pub const K_OFX_STAT_REPLY_DEFAULT: OfxStatus = 14;

pub const OFX_IMAGE_EFFECT_PLUGIN_API: &[u8] = b"OfxImageEffectPluginAPI\0";
pub const K_OFX_PROPERTY_SUITE: &[u8] = b"OfxPropertySuite\0";
pub const K_OFX_IMAGE_EFFECT_SUITE: &[u8] = b"OfxImageEffectSuite\0";
pub const K_OFX_PARAMETER_SUITE: &[u8] = b"OfxParameterSuite\0";

// Actions
pub const ACTION_LOAD: &str = "OfxActionLoad";
pub const ACTION_UNLOAD: &str = "OfxActionUnload";
pub const ACTION_DESCRIBE: &str = "OfxActionDescribe";
pub const ACTION_DESCRIBE_IN_CONTEXT: &str = "OfxImageEffectActionDescribeInContext";
pub const ACTION_CREATE_INSTANCE: &str = "OfxActionCreateInstance";
pub const ACTION_DESTROY_INSTANCE: &str = "OfxActionDestroyInstance";
pub const ACTION_RENDER: &str = "OfxImageEffectActionRender";
pub const ACTION_IS_IDENTITY: &str = "OfxImageEffectActionIsIdentity";
pub const ACTION_GET_ROD: &str = "OfxImageEffectActionGetRegionOfDefinition";

// Properties
pub const P_LABEL: &str = "OfxPropLabel";
pub const P_SHORT_LABEL: &str = "OfxPropShortLabel";
pub const P_LONG_LABEL: &str = "OfxPropLongLabel";
pub const P_PLUGIN_DESCRIPTION: &str = "OfxPropPluginDescription";
pub const P_GROUPING: &str = "OfxImageEffectPluginPropGrouping";
pub const P_SUPPORTED_CONTEXTS: &str = "OfxImageEffectPropSupportedContexts";
pub const P_SUPPORTED_PIXEL_DEPTHS: &str = "OfxImageEffectPropSupportedPixelDepths";
pub const P_SUPPORTS_TILES: &str = "OfxImageEffectPropSupportsTiles";
pub const P_SUPPORTS_MULTI_RESOLUTION: &str = "OfxImageEffectPropSupportsMultiResolution";
pub const P_TEMPORAL_CLIP_ACCESS: &str = "OfxImageEffectPropTemporalClipAccess";
pub const P_RENDER_THREAD_SAFETY: &str = "OfxImageEffectPluginRenderThreadSafety";
pub const P_SUPPORTED_COMPONENTS: &str = "OfxImageEffectPropSupportedComponents";
pub const P_CLIP_OPTIONAL: &str = "OfxImageClipPropOptional";
pub const P_PARAM_DEFAULT: &str = "OfxParamPropDefault";
pub const P_PARAM_MIN: &str = "OfxParamPropMin";
pub const P_PARAM_MAX: &str = "OfxParamPropMax";
pub const P_PARAM_DISPLAY_MIN: &str = "OfxParamPropDisplayMin";
pub const P_PARAM_DISPLAY_MAX: &str = "OfxParamPropDisplayMax";
pub const P_PARAM_HINT: &str = "OfxParamPropHint";
pub const P_PARAM_CHOICE_OPTION: &str = "OfxParamPropChoiceOption";
pub const P_PARAM_ANIMATES: &str = "OfxParamPropAnimates";
pub const P_PARAM_INCREMENT: &str = "OfxParamPropIncrement";
pub const P_TIME: &str = "OfxPropTime";
pub const P_RENDER_WINDOW: &str = "OfxImageEffectPropRenderWindow";
pub const P_IMAGE_DATA: &str = "OfxImagePropData";
pub const P_IMAGE_BOUNDS: &str = "OfxImagePropBounds";
pub const P_IMAGE_ROW_BYTES: &str = "OfxImagePropRowBytes";
pub const P_PIXEL_DEPTH: &str = "OfxImageEffectPropPixelDepth";
pub const P_COMPONENTS: &str = "OfxImageEffectPropComponents";

pub const BIT_DEPTH_BYTE: &str = "OfxBitDepthByte";
pub const BIT_DEPTH_SHORT: &str = "OfxBitDepthShort";
pub const BIT_DEPTH_FLOAT: &str = "OfxBitDepthFloat";
pub const COMP_RGBA: &str = "OfxImageComponentRGBA";
pub const COMP_RGB: &str = "OfxImageComponentRGB";
pub const COMP_ALPHA: &str = "OfxImageComponentAlpha";

#[repr(C)]
pub struct OfxPlugin {
    pub plugin_api: *const c_char,
    pub api_version: c_int,
    pub plugin_identifier: *const c_char,
    pub plugin_version_major: c_uint,
    pub plugin_version_minor: c_uint,
    pub set_host: Option<unsafe extern "C" fn(host: *mut OfxHost)>,
    pub main_entry: Option<unsafe extern "C" fn(action: *const c_char, handle: *const c_void, in_args: OfxPropertySetHandle, out_args: OfxPropertySetHandle) -> OfxStatus>,
}
unsafe impl Sync for OfxPlugin {}

#[repr(C)]
pub struct OfxHost {
    pub host: OfxPropertySetHandle,
    pub fetch_suite: Option<unsafe extern "C" fn(host: OfxPropertySetHandle, suite_name: *const c_char, suite_version: c_int) -> *const c_void>,
}

#[repr(C)]
pub struct OfxPropertySuiteV1 {
    pub prop_set_pointer: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *mut c_void) -> OfxStatus>,
    pub prop_set_string: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *const c_char) -> OfxStatus>,
    pub prop_set_double: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, c_double) -> OfxStatus>,
    pub prop_set_int: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, c_int) -> OfxStatus>,
    pub prop_set_pointer_n: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *const *mut c_void) -> OfxStatus>,
    pub prop_set_string_n: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *const *const c_char) -> OfxStatus>,
    pub prop_set_double_n: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *const c_double) -> OfxStatus>,
    pub prop_set_int_n: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *const c_int) -> OfxStatus>,
    pub prop_get_pointer: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *mut *mut c_void) -> OfxStatus>,
    pub prop_get_string: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *mut *mut c_char) -> OfxStatus>,
    pub prop_get_double: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *mut c_double) -> OfxStatus>,
    pub prop_get_int: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *mut c_int) -> OfxStatus>,
    pub prop_get_pointer_n: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *mut *mut c_void) -> OfxStatus>,
    pub prop_get_string_n: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *mut *mut c_char) -> OfxStatus>,
    pub prop_get_double_n: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *mut c_double) -> OfxStatus>,
    pub prop_get_int_n: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, c_int, *mut c_int) -> OfxStatus>,
    pub prop_reset: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char) -> OfxStatus>,
    pub prop_get_dimension: Option<unsafe extern "C" fn(OfxPropertySetHandle, *const c_char, *mut c_int) -> OfxStatus>,
}

#[repr(C)]
pub struct OfxRectI { pub x1: c_int, pub y1: c_int, pub x2: c_int, pub y2: c_int }
#[repr(C)]
pub struct OfxRectD { pub x1: c_double, pub y1: c_double, pub x2: c_double, pub y2: c_double }

#[repr(C)]
pub struct OfxImageEffectSuiteV1 {
    pub get_property_set: Option<unsafe extern "C" fn(OfxImageEffectHandle, *mut OfxPropertySetHandle) -> OfxStatus>,
    pub get_param_set: Option<unsafe extern "C" fn(OfxImageEffectHandle, *mut OfxParamSetHandle) -> OfxStatus>,
    pub clip_define: Option<unsafe extern "C" fn(OfxImageEffectHandle, *const c_char, *mut OfxPropertySetHandle) -> OfxStatus>,
    pub clip_get_handle: Option<unsafe extern "C" fn(OfxImageEffectHandle, *const c_char, *mut OfxImageClipHandle, *mut OfxPropertySetHandle) -> OfxStatus>,
    pub clip_get_property_set: Option<unsafe extern "C" fn(OfxImageClipHandle, *mut OfxPropertySetHandle) -> OfxStatus>,
    pub clip_get_image: Option<unsafe extern "C" fn(OfxImageClipHandle, OfxTime, *const OfxRectD, *mut OfxPropertySetHandle) -> OfxStatus>,
    pub clip_release_image: Option<unsafe extern "C" fn(OfxPropertySetHandle) -> OfxStatus>,
    pub clip_get_region_of_definition: Option<unsafe extern "C" fn(OfxImageClipHandle, OfxTime, *mut OfxRectD) -> OfxStatus>,
    pub abort: Option<unsafe extern "C" fn(OfxImageEffectHandle) -> c_int>,
    pub image_memory_alloc: Option<unsafe extern "C" fn(OfxImageEffectHandle, usize, *mut OfxImageMemoryHandle) -> OfxStatus>,
    pub image_memory_free: Option<unsafe extern "C" fn(OfxImageMemoryHandle) -> OfxStatus>,
    pub image_memory_lock: Option<unsafe extern "C" fn(OfxImageMemoryHandle, *mut *mut c_void) -> OfxStatus>,
    pub image_memory_unlock: Option<unsafe extern "C" fn(OfxImageMemoryHandle) -> OfxStatus>,
}

#[repr(C)]
pub struct OfxParameterSuiteV1 {
    pub param_define: Option<unsafe extern "C" fn(OfxParamSetHandle, *const c_char, *const c_char, *mut OfxPropertySetHandle) -> OfxStatus>,
    pub param_get_handle: Option<unsafe extern "C" fn(OfxParamSetHandle, *const c_char, *mut OfxParamHandle, *mut OfxPropertySetHandle) -> OfxStatus>,
    pub param_set_get_property_set: Option<unsafe extern "C" fn(OfxParamSetHandle, *mut OfxPropertySetHandle) -> OfxStatus>,
    pub param_get_property_set: Option<unsafe extern "C" fn(OfxParamHandle, *mut OfxPropertySetHandle) -> OfxStatus>,
    pub param_get_value: Option<unsafe extern "C" fn(OfxParamHandle, ...) -> OfxStatus>,
    pub param_get_value_at_time: Option<unsafe extern "C" fn(OfxParamHandle, OfxTime, ...) -> OfxStatus>,
    pub param_get_derivative: Option<unsafe extern "C" fn(OfxParamHandle, OfxTime, ...) -> OfxStatus>,
    pub param_get_integral: Option<unsafe extern "C" fn(OfxParamHandle, OfxTime, OfxTime, ...) -> OfxStatus>,
    pub param_set_value: Option<unsafe extern "C" fn(OfxParamHandle, ...) -> OfxStatus>,
    pub param_set_value_at_time: Option<unsafe extern "C" fn(OfxParamHandle, OfxTime, ...) -> OfxStatus>,
    pub param_get_num_keys: Option<unsafe extern "C" fn(OfxParamHandle, *mut c_uint) -> OfxStatus>,
    pub param_get_key_time: Option<unsafe extern "C" fn(OfxParamHandle, c_uint, *mut OfxTime) -> OfxStatus>,
    pub param_get_key_index: Option<unsafe extern "C" fn(OfxParamHandle, OfxTime, c_int, *mut c_int) -> OfxStatus>,
    pub param_delete_key: Option<unsafe extern "C" fn(OfxParamHandle, OfxTime) -> OfxStatus>,
    pub param_delete_all_keys: Option<unsafe extern "C" fn(OfxParamHandle) -> OfxStatus>,
    pub param_copy: Option<unsafe extern "C" fn(OfxParamHandle, OfxParamHandle, OfxTime, *const c_double) -> OfxStatus>,
    pub param_edit_begin: Option<unsafe extern "C" fn(OfxParamSetHandle, *const c_char) -> OfxStatus>,
    pub param_edit_end: Option<unsafe extern "C" fn(OfxParamSetHandle) -> OfxStatus>,
}
