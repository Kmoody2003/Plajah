import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { BskyAgent } from '@atproto/api';
import fs from 'fs/promises';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple REST fetch for Firebase DB without needing admin SDK initialized
const fetchFirebaseDoc = async (collection: string, id: string) => {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'ai-studio-5564c944-b75c-4461-bcd3-afa92800323b';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collection}/${id}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch(e) { return null; }
};

const injectMetaTags = async (html: string, query: any, host: string) => {
   const { type, id, track } = query;
   if (!type || !id) return html;
   
   let collection = '';
   if (type === 'video') collection = 'videos';
   if (type === 'album') collection = 'albums';
   if (type === 'feed') collection = 'global_posts';
   if (!collection) return html;

   const dbData = await fetchFirebaseDoc(collection, id);
   if (!dbData || !dbData.fields) return html;

   let title = '';
   let image = '';
   let desc = '';
   let playerUrl = `https://${host}/embed?type=${type}&id=${id}${track ? `&track=${track}` : ''}`;
   
   if (type === 'video') {
      title = dbData.fields?.title?.stringValue || 'Video';
      image = dbData.fields?.thumbnailUrl?.stringValue || dbData.fields?.coverImageUrl?.stringValue || '';
      desc = dbData.fields?.description?.stringValue || 'Watch this video on Plajah';
   } else if (type === 'album') {
      title = dbData.fields?.title?.stringValue || 'Album';
      const tracksArray = dbData.fields?.tracks?.arrayValue?.values || [];
      const trackObj = tracksArray.find((t: any) => t.mapValue?.fields?.id?.stringValue === track);
      if (trackObj) {
        title = trackObj.mapValue?.fields?.title?.stringValue + ' - ' + title;
      }
      image = dbData.fields?.coverImageUrl?.stringValue || '';
      desc = dbData.fields?.description?.stringValue || 'Listen on Plajah';
   } else if (type === 'feed') {
      title = `${dbData.fields?.authorName?.stringValue || 'User'} on Plajah`;
      desc = dbData.fields?.content?.stringValue || 'Check out this post';
      image = dbData.fields?.imageUrl?.stringValue || dbData.fields?.videoThumbnail?.stringValue || '';
      // If it's a feed with a video, we can still use player card
      if (!dbData.fields?.videoUrl?.stringValue) {
          playerUrl = ''; // Turn off player card if no video
      }
   }

   let metaTags = `
    <meta name="twitter:site" content="@plajah" />
    <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta name="twitter:description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta name="twitter:image" content="${image.replace(/"/g, '&quot;')}" />
    <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta property="og:image" content="${image.replace(/"/g, '&quot;')}" />
    <meta property="og:url" content="https://${host}/?type=${type}&id=${id}" />
   `;

   if (playerUrl) {
     metaTags += `
    <meta name="twitter:card" content="player" />
    <meta name="twitter:player" content="${playerUrl}" />
    <meta name="twitter:player:width" content="1280" />
    <meta name="twitter:player:height" content="720" />
    <meta property="og:type" content="video.other" />
    <meta property="og:video:url" content="${playerUrl}" />
     `;
   } else {
     metaTags += `<meta name="twitter:card" content="summary_large_image" />`;
   }

   return html.replace('</head>', `${metaTags}\n</head>`);
};


async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());
  app.use(cookieParser());
  app.use(cors());

  // --- Mux Integration ---
  app.post('/api/mux/upload', async (req, res) => {
    try {
      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured (missing API keys).' });
      }
      
      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({
        tokenId: MUX_TOKEN_ID,
        tokenSecret: MUX_TOKEN_SECRET,
      });

      const upload = await mux.video.uploads.create({
        new_asset_settings: {
          playback_policy: ['public'],
        },
        cors_origin: '*', // Set to actual domain in production
      });

      res.json({ id: upload.id, url: upload.url });
    } catch (error: any) {
      console.error('Mux upload error:', error);
      res.status(500).json({ error: error.message || 'Failed to create Mux upload URL' });
    }
  });

  app.get('/api/mux/asset', async (req, res) => {
    try {
      const { uploadId } = req.query;
      if (!uploadId) return res.status(400).json({ error: 'Missing uploadId' });
      
      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured.' });
      }

      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({
        tokenId: MUX_TOKEN_ID,
        tokenSecret: MUX_TOKEN_SECRET,
      });

      const upload = await mux.video.uploads.retrieve(uploadId as string);
      res.json({ status: upload.status, assetId: upload.asset_id });
    } catch (error: any) {
      console.error('Mux retrieve error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/mux/create-asset-from-url', express.json(), async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'Missing url' });

      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured.' });
      }

      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({
        tokenId: MUX_TOKEN_ID,
        tokenSecret: MUX_TOKEN_SECRET,
      });

      const asset = await mux.video.assets.create({
        inputs: [{ url }],
        playback_policy: ['public'],
      });

      res.json({ assetId: asset.id, playbackId: asset.playback_ids?.[0]?.id });
    } catch (error: any) {
      console.error('Mux create asset from URL error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/mux/playback', async (req, res) => {
    try {
      const { assetId } = req.query;
      if (!assetId) return res.status(400).json({ error: 'Missing assetId' });
      
      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured.' });
      }

      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({
        tokenId: MUX_TOKEN_ID,
        tokenSecret: MUX_TOKEN_SECRET,
      });

      const asset = await mux.video.assets.retrieve(assetId as string);
      const playbackId = asset.playback_ids?.[0]?.id;
      res.json({ status: asset.status, playbackId, asset });
    } catch (error: any) {
      console.error('Mux playback error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Mastodon OAuth Helpers ---
  // In a real app, these would be in a DB. For this demo, we'll use a memory map.
  const mastodonApps: Record<string, { clientId: string; clientSecret: string }> = {};

  // Register App on Instance
  app.post('/api/auth/mastodon/register', async (req, res) => {
    const { instance } = req.body;
    if (!instance) return res.status(400).json({ error: 'Instance required' });

    try {
      if (mastodonApps[instance]) {
        return res.json(mastodonApps[instance]);
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/auth/mastodon/callback`;
      
      const response = await fetch(`https://${instance}/api/v1/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Plajah Social Mesh',
          redirect_uris: redirectUri,
          scopes: 'read write follow',
          website: 'https://ais-dev-ecgniar62eix4hqydxbime-137921939411.us-east5.run.app'
        }),
      });

      if (!response.ok) throw new Error('Failed to register app');
      const data = await response.json();
      
      mastodonApps[instance] = {
        clientId: data.client_id,
        clientSecret: data.client_secret,
      };

      res.json(mastodonApps[instance]);
    } catch (error) {
      console.error('Mastodon Register Error:', error);
      res.status(500).json({ error: 'Failed to register with instance' });
    }
  });

  // Mastodon Callback
  app.get('/auth/mastodon/callback', (req, res) => {
    // This is just the landing page for the popup
    res.send(`
      <html>
        <body>
          <script>
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            if (window.opener) {
              window.opener.postMessage({ type: 'MASTODON_AUTH_SUCCESS', code }, '*');
              window.close();
            }
          </script>
          <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h2>Intercepting Signal...</h2>
            <p>Authentication synchronized. This window will close.</p>
          </div>
        </body>
      </html>
    `);
  });

  // Token Exchange
  app.post('/api/auth/mastodon/token', async (req, res) => {
    const { instance, code, clientId, clientSecret } = req.body;
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/mastodon/callback`;

    try {
      const response = await fetch(`https://${instance}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code,
        }),
      });

      if (!response.ok) throw new Error('Token exchange failed');
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Token exchange failed' });
    }
  });

  // --- Bluesky Auth ---
  app.post('/api/auth/bluesky/login', async (req, res) => {
    const { identifier, password } = req.body;
    const agent = new BskyAgent({ service: 'https://bsky.social' });

    try {
      const loginRes = await agent.login({ identifier, password });
      res.json({ session: loginRes.data });
    } catch (error) {
      res.status(401).json({ error: 'Bluesky login failed' });
    }
  });

  // --- Proxy Helpers ---
  
  // Generic Proxy for external assets (CORS bypass and streaming support)
  app.get('/api/proxy', async (req: any, res: any) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const controller = new AbortController();
    req.on('close', () => {
      controller.abort();
    });

    try {
      const decodedUrl = decodeURIComponent(url as string);
      const range = req.headers.range;

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      };

      if (range) {
        headers['Range'] = range;
      }

      console.log(`[Proxy] ${range ? 'Streaming' : 'Fetching'} (${range || 'full'}): ${decodedUrl}`);
      
      const response = await fetch(decodedUrl, { 
        headers,
        redirect: 'follow',
        signal: controller.signal
      });
      
      if (!response.ok && response.status !== 206) {
        console.error(`[Proxy] Upstream Error: ${response.status} ${response.statusText} for ${decodedUrl}`);
        return res.status(response.status).send(response.statusText);
      }

      // Forward headers
      const contentRange = response.headers.get('content-range');
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      const acceptRanges = response.headers.get('accept-ranges');

      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (contentType) res.setHeader('Content-Type', contentType);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges || 'bytes');
      
      // If the upstream responded with Partial Content (206)
      if (response.status === 206) {
        res.status(206);
      }

      // Robust streaming using Readable.fromWeb
      if (response.body) {
        try {
          // @ts-ignore - Web readable stream to Node stream conversion
          const nodeReadable = Readable.fromWeb(response.body);
          nodeReadable.pipe(res);
          
          res.on('close', () => {
             nodeReadable.destroy();
          });
        } catch (streamError) {
          console.error('[Proxy] Stream construction failed, falling back to manual push:', streamError);
          // Manual fallback if fromWeb is not available or fails
          const reader = response.body.getReader();
          const push = async () => {
            try {
              const { done, value } = await reader.read();
              if (done) {
                if (!res.writableEnded) res.end();
                return;
              }
              if (!res.writableEnded) {
                res.write(Buffer.from(value));
                push();
              }
            } catch (readError) {
              console.error('[Proxy] Read error:', readError);
              if (!res.writableEnded) res.end();
            }
          };
          push();
        }
      } else {
        res.end();
      }
    } catch (error: any) {
      console.error('Proxy Total Failure:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to proxy request: ' + error.message });
      }
    }
  });

  // Fediverse Proxy (to avoid CORS and handle remote lookups)
  app.get('/api/social/fediverse/proxy', async (req: any, res: any) => {
    const { instance, path: apiPath, token } = req.query;
    if (!instance || !apiPath) return res.status(400).json({ error: 'Instance and Path required' });

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const url = `https://${instance}${apiPath}`;
      console.log(`[MeshProxy] Intercepting: ${url}`);
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        console.error(`[MeshProxy] Remote Error: ${response.status} ${response.statusText}`);
        return res.status(response.status).json({ 
          error: `Fediverse API error: ${response.statusText}`,
          status: response.status 
        });
      }

      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        console.error(`[MeshProxy] Non-JSON Response: ${contentType}`);
        const text = await response.text();
        console.error(`[MeshProxy] Raw Content Sample: ${text.substring(0, 100)}`);
        return res.status(502).json({ error: 'Remote instance returned non-JSON data' });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error('Fediverse Proxy Error:', error);
      res.status(500).json({ error: 'Failed to proxy Fediverse request: ' + error.message });
    }
  });

  // Mastodon Post/Reply
  app.post('/api/social/mastodon/post', async (req, res) => {
    const { instance, token, status, inReplyToId } = req.body;
    try {
      const response = await fetch(`https://${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status,
          in_reply_to_id: inReplyToId,
          visibility: 'public'
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Post failed' });
    }
  });

  // Bluesky Post/Reply
  app.post('/api/social/bluesky/post', async (req, res) => {
    const { session, text, reply } = req.body;
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    
    try {
      await agent.resumeSession(session);
      const post = await agent.post({
        text,
        reply,
        createdAt: new Date().toISOString()
      });
      res.json(post);
    } catch (error) {
      res.status(500).json({ error: 'Post failed' });
    }
  });

  // --- Embed & Meta tag Middleware ---

  app.get('/embed', async (req, res) => {
    const { type, id, track } = req.query;
    if (!type || !id) return res.status(404).send('Not Found');

    let collection = '';
    if (type === 'video') collection = 'videos';
    if (type === 'album') collection = 'albums';
    if (type === 'feed') collection = 'global_posts';
    
    if (!collection) return res.status(404).send('Not Found');

    const dbData = await fetchFirebaseDoc(collection, id as string);
    if (!dbData || !dbData.fields) return res.status(404).send('Not Found');

    let mediaUrl = '';
    let title = '';
    let cover = '';
    let isYoutube = false;

    if (type === 'video') {
      mediaUrl = dbData.fields?.url?.stringValue || dbData.fields?.embedUrl?.stringValue || '';
      title = dbData.fields?.title?.stringValue || 'Video';
      cover = dbData.fields?.coverImageUrl?.stringValue || dbData.fields?.thumbnailUrl?.stringValue || '';
      if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) isYoutube = true;
    } else if (type === 'album') {
      const tracksArray = dbData.fields?.tracks?.arrayValue?.values || [];
      const trackObj = tracksArray.find((t: any) => t.mapValue?.fields?.id?.stringValue === track);
      if (trackObj) {
        mediaUrl = trackObj.mapValue?.fields?.url?.stringValue || '';
        title = trackObj.mapValue?.fields?.title?.stringValue || 'Track';
      }
      cover = dbData.fields?.coverImageUrl?.stringValue || '';
    } else if (type === 'feed') {
      mediaUrl = dbData.fields?.videoUrl?.stringValue || '';
      title = 'Video Post';
      cover = dbData.fields?.videoThumbnail?.stringValue || dbData.fields?.imageUrl?.stringValue || '';
      if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) isYoutube = true;
    }

    if (!mediaUrl) return res.status(404).send('No Media Found');

    let playerHtml = '';
    if (isYoutube) {
        let embedLink = mediaUrl;
        const vMatch = mediaUrl.match(/[?&]v=([^&#]*)/);
        if (vMatch && vMatch[1]) {
            embedLink = `https://www.youtube.com/embed/${vMatch[1]}`;
        } else if (mediaUrl.includes('youtu.be/')) {
            const shortId = mediaUrl.split('youtu.be/')[1].split('?')[0];
            embedLink = `https://www.youtube.com/embed/${shortId}`;
        }
        playerHtml = `<iframe src="${embedLink}" width="100%" height="100%" style="border:none" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    } else if (mediaUrl.endsWith('.mp4') || mediaUrl.includes('/videos%2F') || type === 'video' || type === 'feed') {
        playerHtml = `<video src="${mediaUrl}" controls width="100%" height="100%" style="background:black" poster="${cover}"></video>`;
    } else {
        playerHtml = `
        <div style="background: black; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:white; font-family:sans-serif;">
           <img src="${cover}" style="max-height:50%; max-width:80%; margin-bottom:20px; border-radius:10px; object-fit: cover; box-shadow: 0 10px 20px rgba(0,0,0,0.5);"/>
           <h3 style="margin-bottom:20px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">${title}</h3>
           <audio src="${mediaUrl}" controls style="width: 80%"></audio>
        </div>`;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>
        <style>body,html{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:black;}</style>
      </head>
      <body>
        ${playerHtml}
      </body>
      </html>
    `);
  });

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(async (req, res, next) => {
      // Just intercept root and add meta tags if type is present
      if (req.path === '/' && req.query.type) {
        try {
          const rawHtml = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');
          const finalHtml = await injectMetaTags(rawHtml, req.query, req.get('host') || 'localhost');
          const viteTransformed = await vite.transformIndexHtml(req.originalUrl, finalHtml);
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(viteTransformed);
        } catch(e) {
          return next();
        }
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    // In production, we don't want to serve index.html via express.static by default
    // so we configure it to not serve 'index' to let the fallback handle it
    app.use(express.static(path.join(__dirname, 'dist'), { index: false }));
    app.get('*all', async (req, res) => {
      try {
        let html = await fs.readFile(path.join(__dirname, 'dist', 'index.html'), 'utf-8');
        if (req.query.type) {
           html = await injectMetaTags(html, req.query, req.get('host') || 'localhost');
        }
        res.send(html);
      } catch (e) {
        res.status(500).send('Server Error');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mesh Server running on http://localhost:${PORT}`);
  });
}

startServer();
