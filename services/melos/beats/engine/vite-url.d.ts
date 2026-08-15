// The worklet is plain JS imported with ?url (see clockProcessor.worklet.js header for why).
declare module '*.worklet.js?url' {
  const url: string;
  export default url;
}

// The Rust DSP core, committed as a build artifact and fetched at runtime.
declare module '*.wasm?url' {
  const url: string;
  export default url;
}
