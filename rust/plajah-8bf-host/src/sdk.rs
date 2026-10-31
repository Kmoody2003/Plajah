//! Photoshop Filter plug-in ABI, written from the public SDK documentation
//! (PIFilter.h, PIGeneral.h, SPBasic.h). FilterRecord alone is packed to 4 bytes, so its
//! pointers can sit on 4-byte boundaries on x64. The suites are naturally aligned: their
//! first function pointer is at offset 8, confirmed against Adobe's PLUGIN.dll.
#![allow(non_snake_case, dead_code)]
use std::ffi::{c_char, c_void};

pub type Handle = *mut *mut u8;
pub type OsErr = i16;

pub const SEL_ABOUT: i16 = 0;
pub const SEL_PARAMETERS: i16 = 1;
pub const SEL_PREPARE: i16 = 2;
pub const SEL_START: i16 = 3;
pub const SEL_CONTINUE: i16 = 4;
pub const SEL_FINISH: i16 = 5;

pub const NO_ERR: OsErr = 0;
pub const USER_CANCELED: OsErr = -128;
pub const MEM_FULL: OsErr = -108;
pub const FILTER_BAD_PARAMETERS: OsErr = -30100;
pub const FILTER_BAD_MODE: OsErr = -30101;
pub const ERR_HOST_INSUFFICIENT: OsErr = -30900;
pub const ERR_PROPERTY_UNDEFINED: OsErr = -30901;
pub const ERR_REPORT_STRING: OsErr = -30904;

pub const MODE_GRAY: i16 = 1;
pub const MODE_RGB: i16 = 3;

pub const CASE_FLAT: i16 = 1;
pub const CASE_EDITABLE_TRANSPARENCY: i16 = 4;
pub const CASE_PROTECTED_TRANSPARENCY: i16 = 6;

pub const PADDING_EDGE: i16 = -1;
pub const PADDING_NONE: i16 = -2;
pub const PADDING_ERROR: i16 = -3;

/// `'!Sui'`, kSPSuiteNotFoundError.
pub const SP_SUITE_NOT_FOUND: i32 = 0x2153_7569;

#[repr(C)]
#[derive(Clone, Copy, Default, PartialEq, Debug)]
pub struct Rect16 { pub top: i16, pub left: i16, pub bottom: i16, pub right: i16 }
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct Point16 { pub v: i16, pub h: i16 }
#[repr(C)]
#[derive(Clone, Copy, Default, PartialEq, Debug)]
pub struct VRect { pub top: i32, pub left: i32, pub bottom: i32, pub right: i32 }
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct VPoint { pub v: i32, pub h: i32 }
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct RgbColor { pub r: u16, pub g: u16, pub b: u16 }
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct PlugInMonitor {
    pub gamma: i32, pub redX: i32, pub redY: i32, pub greenX: i32, pub greenY: i32,
    pub blueX: i32, pub blueY: i32, pub whiteX: i32, pub whiteY: i32, pub ambient: i32,
}

#[repr(C)]
pub struct BigDocument {
    pub PluginUsing32BitCoordinates: i32,
    pub imageSize32: VPoint,
    pub filterRect32: VRect,
    pub inRect32: VRect,
    pub outRect32: VRect,
    pub maskRect32: VRect,
    pub floatCoord32: VPoint,
    pub wholeSize32: VPoint,
}

#[repr(C, packed(4))]
pub struct FilterRecord {
    pub serial: i32,
    pub abortProc: usize,
    pub progressProc: usize,
    pub parameters: Handle,
    pub imageSize: Point16,
    pub planes: i16,
    pub filterRect: Rect16,
    pub background: RgbColor,
    pub foreground: RgbColor,
    pub maxSpace: i32,
    pub bufferSpace: i32,
    pub inRect: Rect16,
    pub inLoPlane: i16,
    pub inHiPlane: i16,
    pub outRect: Rect16,
    pub outLoPlane: i16,
    pub outHiPlane: i16,
    pub inData: *mut u8,
    pub inRowBytes: i32,
    pub outData: *mut u8,
    pub outRowBytes: i32,
    pub isFloating: u8,
    pub haveMask: u8,
    pub autoMask: u8,
    pub maskRect: Rect16,
    pub maskData: *mut u8,
    pub maskRowBytes: i32,
    pub backColor: [u8; 4],
    pub foreColor: [u8; 4],
    pub hostSig: u32,
    pub hostProc: usize,
    pub imageMode: i16,
    pub imageHRes: i32,
    pub imageVRes: i32,
    pub floatCoord: Point16,
    pub wholeSize: Point16,
    pub monitor: PlugInMonitor,
    pub platformData: *mut c_void,
    pub bufferProcs: *const BufferProcs,
    pub resourceProcs: *const ResourceProcs,
    pub processEvent: usize,
    pub displayPixels: usize,
    pub handleProcs: *const HandleProcs,
    pub supportsDummyChannels: u8,
    pub supportsAlternateLayouts: u8,
    pub wantLayout: i16,
    pub filterCase: i16,
    pub dummyPlaneValue: i16,
    pub premiereHook: usize,
    pub advanceState: usize,
    pub supportsAbsolute: u8,
    pub wantsAbsolute: u8,
    pub getPropertyObsolete: usize,
    pub cannotUndo: u8,
    pub supportsPadding: u8,
    pub inputPadding: i16,
    pub outputPadding: i16,
    pub maskPadding: i16,
    pub samplingSupport: u8,
    pub reservedByte: u8,
    pub inputRate: i32,
    pub maskRate: i32,
    pub colorServices: usize,
    pub inLayerPlanes: i16,
    pub inTransparencyMask: i16,
    pub inLayerMasks: i16,
    pub inInvertedLayerMasks: i16,
    pub inNonLayerPlanes: i16,
    pub outLayerPlanes: i16,
    pub outTransparencyMask: i16,
    pub outLayerMasks: i16,
    pub outInvertedLayerMasks: i16,
    pub outNonLayerPlanes: i16,
    pub absLayerPlanes: i16,
    pub absTransparencyMask: i16,
    pub absLayerMasks: i16,
    pub absInvertedLayerMasks: i16,
    pub absNonLayerPlanes: i16,
    pub inPreDummyPlanes: i16,
    pub inPostDummyPlanes: i16,
    pub outPreDummyPlanes: i16,
    pub outPostDummyPlanes: i16,
    pub inColumnBytes: i32,
    pub inPlaneBytes: i32,
    pub outColumnBytes: i32,
    pub outPlaneBytes: i32,
    pub imageServicesProcs: usize,
    pub propertyProcs: *const PropertyProcs,
    pub inTileHeight: i16,
    pub inTileWidth: i16,
    pub inTileOrigin: Point16,
    pub absTileHeight: i16,
    pub absTileWidth: i16,
    pub absTileOrigin: Point16,
    pub outTileHeight: i16,
    pub outTileWidth: i16,
    pub outTileOrigin: Point16,
    pub maskTileHeight: i16,
    pub maskTileWidth: i16,
    pub maskTileOrigin: Point16,
    pub descriptorParameters: usize,
    pub errorString: *mut u8,
    pub channelPortProcs: *const ChannelPortProcs,
    pub documentInfo: usize,
    pub sSPBasic: *const SpBasicSuite,
    pub plugInRef: usize,
    pub depth: i32,
    pub iCCprofileData: Handle,
    pub iCCprofileSize: i32,
    pub canUseICCProfiles: i32,
    pub hasImageScrap: i32,
    pub bigDocumentData: *mut BigDocument,
    pub input3DScene: usize,
    pub output3DScene: usize,
    pub createNewLayer: u8,
    pub iCCWorkingProfileData: Handle,
    pub iCCWorkingProfileSize: i32,
    pub bufferSpace64: i64,
    pub maxSpace64: i64,
    pub reserved: [u8; 46],
}

#[repr(C)]
pub struct AboutRecord {
    pub platformData: *mut c_void,
    pub sSPBasic: *const SpBasicSuite,
    pub plugInRef: usize,
    pub reserved: [u8; 244],
}

#[repr(C)]
pub struct PlatformData { pub hwnd: isize }

#[repr(C)]
pub struct BufferProcs {
    pub version: i16,
    pub count: i16,
    pub allocate: unsafe extern "system" fn(i32, *mut *mut u8) -> OsErr,
    pub lock: unsafe extern "system" fn(*mut u8, u8) -> *mut u8,
    pub unlock: unsafe extern "system" fn(*mut u8),
    pub free: unsafe extern "system" fn(*mut u8),
    pub space: unsafe extern "system" fn() -> i32,
    pub reserve: unsafe extern "system" fn(i32),
    pub allocate64: unsafe extern "system" fn(i64, *mut *mut u8) -> OsErr,
    pub space64: unsafe extern "system" fn() -> i64,
}

#[repr(C)]
pub struct HandleProcs {
    pub version: i16,
    pub count: i16,
    pub new: unsafe extern "system" fn(i32) -> Handle,
    pub dispose: unsafe extern "system" fn(Handle),
    pub get_size: unsafe extern "system" fn(Handle) -> i32,
    pub set_size: unsafe extern "system" fn(Handle, i32) -> OsErr,
    pub lock: unsafe extern "system" fn(Handle, u8) -> *mut u8,
    pub unlock: unsafe extern "system" fn(Handle),
    pub recover_space: unsafe extern "system" fn(i32),
    pub dispose_regular: unsafe extern "system" fn(Handle),
}

#[repr(C)]
pub struct ResourceProcs {
    pub version: i16,
    pub count: i16,
    pub count_proc: unsafe extern "system" fn(u32) -> i16,
    pub get: unsafe extern "system" fn(u32, i16) -> Handle,
    pub delete: unsafe extern "system" fn(u32, i16),
    pub add: unsafe extern "system" fn(u32, Handle) -> OsErr,
}

#[repr(C)]
pub struct PropertyProcs {
    pub version: i16,
    pub count: i16,
    pub get: unsafe extern "system" fn(u32, u32, i32, *mut isize, *mut Handle) -> OsErr,
    pub set: unsafe extern "system" fn(u32, u32, i32, isize, Handle) -> OsErr,
}

#[repr(C)]
pub struct ChannelPortProcs {
    pub version: i16,
    pub count: i16,
    pub read_pixels: unsafe extern "system" fn() -> OsErr,
    pub write_base_pixels: unsafe extern "system" fn() -> OsErr,
    pub read_port_for_write_port: unsafe extern "system" fn() -> OsErr,
}

#[repr(C)]
pub struct SpBasicSuite {
    pub acquire: unsafe extern "system" fn(*const c_char, i32, *mut *const c_void) -> i32,
    pub release: unsafe extern "system" fn(*const c_char, i32) -> i32,
    pub is_equal: unsafe extern "system" fn(*const c_char, *const c_char) -> i32,
    pub allocate: unsafe extern "system" fn(usize, *mut *mut c_void) -> i32,
    pub free: unsafe extern "system" fn(*mut c_void) -> i32,
    pub reallocate: unsafe extern "system" fn(*mut c_void, usize, *mut *mut c_void) -> i32,
    pub undefined: unsafe extern "system" fn() -> i32,
}

/// Leading fields of PSPixelMap, up to the ones a host needs to blit a preview.
#[repr(C)]
pub struct PsPixelMap {
    pub version: i32,
    pub bounds: VRect,
    pub imageMode: i32,
    pub rowBytes: i32,
    pub colBytes: i32,
    pub planeBytes: i32,
    pub baseAddr: *const u8,
}

pub const PLAY_DISPLAY: i16 = 1;
pub const PLAY_SILENT: i16 = 2;

/// Scripting parameters. The host offers an empty descriptor: every read proc reports
/// nothing, so a filter falls back to its own defaults.
#[repr(C)]
pub struct PiDescriptorParameters {
    pub version: i16,
    pub playInfo: i16,
    pub recordInfo: i16,
    pub descriptor: usize,
    pub writeDescriptorProcs: *const DescriptorProcs,
    pub readDescriptorProcs: *const DescriptorProcs,
}

/// Read and write suites share this shape: an int32 version and int16 count, unlike the
/// other suites, which puts the first function pointer at offset 8.
#[repr(C)]
pub struct DescriptorProcs {
    pub version: i32,
    pub count: i16,
    pub procs: [unsafe extern "system" fn() -> usize; 24],
}

pub type PluginEntry = unsafe extern "system" fn(i16, *mut c_void, *mut isize, *mut i16);

// Hand-computed anchors from the SDK field order under pack(4).
const _: () = assert!(std::mem::offset_of!(FilterRecord, parameters) == 20);
const _: () = assert!(std::mem::offset_of!(FilterRecord, inData) == 88);
