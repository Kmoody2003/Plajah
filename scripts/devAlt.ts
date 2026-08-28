// A SECOND dev server for this repo, on its own ports.
//
// Vite's HMR websocket binds a fixed port (24678) in middleware mode, so two dev
// servers on the same checkout collide: the second one starts, serves nothing,
// and reports only "Port 24678 is already in use". That blocks the common case
// of two agent sessions — or two branches — running side by side.
//
// server.ts now reads VITE_HMR_PORT (defaulting to 24678, so nothing changes for
// the primary server). This just sets both ports before handing over.
//
//   npx tsx scripts/devAlt.ts
//
// Override either with PORT= / VITE_HMR_PORT= if these are taken too.
process.env.PORT = process.env.PORT || '3100';
process.env.VITE_HMR_PORT = process.env.VITE_HMR_PORT || '24699';

await import('../server');
