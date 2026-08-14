// The worklet is plain JS imported with ?url (see clockProcessor.worklet.js header for why).
declare module '*.worklet.js?url' {
  const url: string;
  export default url;
}
