// Tiny dev server for the /api/museum routes, so labs (which don't boot server.ts) can exercise the
// server-first museum path:   npx tsx museum-dev-server.mts   (port 3199; labs proxy /api/museum to it)
// Keys come from the environment (SMITHSONIAN_API_KEY, EUROPEANA_API_KEY, DPLA_API_KEY).
import express from 'express';
import { createMuseumRouter } from './routes/museum.ts';

const app = express();
app.use(createMuseumRouter());
app.listen(3199, '127.0.0.1', () => console.log('museum dev server on http://127.0.0.1:3199'));
