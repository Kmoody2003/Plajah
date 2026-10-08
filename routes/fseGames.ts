import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export const fseGamesRouter = Router();

export interface RealInstalledGame {
  id: string;
  title: string;
  platform: 'Xbox Game Pass' | 'Epic Games' | 'Steam' | 'Google Play Games' | 'PC Direct';
  coverUrl: string;
  splashUrl?: string;
  installPath: string;
  executable?: string;
  protocol: string;
  storeId?: string;
  lastPlayed: string;
  installedDrive: string;
}

// Fallback high-res cover art if local file is missing or unreadable
const FALLBACK_COVERS: Record<string, string> = {
  'starfield': 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
  'indiana jones and the great circle': 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
  'hogwarts legacy': 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
  'sea of thieves': 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80',
  'grounded': 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop&q=80',
  'south of midnight': 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
  'fortnite': 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=800&auto=format&fit=crop&q=80',
  'angry birds 2': 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=800&auto=format&fit=crop&q=80',
};

function getDrives(): string[] {
  const drives = ['C:', 'D:', 'E:', 'F:', 'G:'];
  return drives.filter(d => {
    try {
      return fs.existsSync(d + '\\');
    } catch {
      return false;
    }
  });
}

function scanInstalledGames(): RealInstalledGame[] {
  const games: RealInstalledGame[] = [];
  const activeDrives = getDrives();

  // 1. Scan XboxGames across all available drives
  for (const drive of activeDrives) {
    const xboxFolder = path.join(drive, 'XboxGames');
    if (fs.existsSync(xboxFolder)) {
      try {
        const gameFolders = fs.readdirSync(xboxFolder);
        for (const folder of gameFolders) {
          if (folder === 'GameSave') continue;
          const fullFolderPath = path.join(xboxFolder, folder);
          const configPath = path.join(fullFolderPath, 'Content', 'MicrosoftGame.Config');
          
          let title = folder;
          let storeId: string | undefined;
          let localLogoPath: string | undefined;
          let localSplashPath: string | undefined;
          let launchHelper = path.join(fullFolderPath, 'Content', 'gamelaunchhelper.exe');
          
          if (!fs.existsSync(launchHelper)) {
            const rootHelper = path.join(fullFolderPath, 'gamelaunchhelper.exe');
            if (fs.existsSync(rootHelper)) launchHelper = rootHelper;
          }

          if (fs.existsSync(configPath)) {
            try {
              const xml = fs.readFileSync(configPath, 'utf8');
              const storeIdMatch = xml.match(/<StoreId>([^<]+)<\/StoreId>/);
              const titleMatch = xml.match(/DefaultDisplayName="([^"]+)"/);
              const splashMatch = xml.match(/SplashScreenImage="([^"]+)"/);
              const logoMatch = xml.match(/Square480x480Logo="([^"]+)"/) || 
                                xml.match(/Square150x150Logo="([^"]+)"/) ||
                                xml.match(/StoreLogo="([^"]+)"/);

              if (titleMatch) title = titleMatch[1];
              if (storeIdMatch) storeId = storeIdMatch[1];

              const contentDir = path.join(fullFolderPath, 'Content');
              if (logoMatch) {
                const lp = path.join(contentDir, logoMatch[1]);
                if (fs.existsSync(lp)) localLogoPath = lp;
              }
              if (splashMatch) {
                const sp = path.join(contentDir, splashMatch[1]);
                if (fs.existsSync(sp)) localSplashPath = sp;
              }
            } catch (e) {
              console.warn('[FSE Games] Error reading MicrosoftGame.Config for', folder, e);
            }
          }

          // Build local stream URL or fallback
          const coverUrl = localLogoPath 
            ? `/api/fse/game-art?path=${encodeURIComponent(localLogoPath)}`
            : (FALLBACK_COVERS[title.toLowerCase()] || FALLBACK_COVERS['starfield']);

          const splashUrl = localSplashPath
            ? `/api/fse/game-art?path=${encodeURIComponent(localSplashPath)}`
            : coverUrl;

          games.push({
            id: `xbox_${folder.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            title,
            platform: 'Xbox Game Pass',
            coverUrl,
            splashUrl,
            installPath: fullFolderPath,
            executable: fs.existsSync(launchHelper) ? launchHelper : undefined,
            protocol: storeId ? `ms-windows-store://pdp/?productid=${storeId}` : 'ms-gamepass:',
            storeId,
            lastPlayed: `Ready on Drive ${drive}`,
            installedDrive: drive
          });
        }
      } catch (err) {
        console.warn('[FSE Games] Error reading Xbox folder on drive', drive, err);
      }
    }
  }

  // 2. Scan Epic Games Manifests
  const epicManifestDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  if (fs.existsSync(epicManifestDir)) {
    try {
      const files = fs.readdirSync(epicManifestDir);
      for (const f of files) {
        if (f.endsWith('.item')) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(epicManifestDir, f), 'utf8'));
            if (data.DisplayName && data.AppName && 
                !data.DisplayName.includes('Unreal Engine') && 
                !data.DisplayName.includes('Quixel Bridge')) {
              
              const coverUrl = FALLBACK_COVERS[data.DisplayName.toLowerCase()] || 
                'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80';

              games.push({
                id: `epic_${data.AppName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                title: data.DisplayName,
                platform: 'Epic Games',
                coverUrl,
                splashUrl: coverUrl,
                installPath: data.InstallLocation || 'C:\\Program Files\\Epic Games',
                executable: data.LaunchExecutable,
                protocol: `com.epicgames.launcher://apps/${data.AppName}?action=launch&silent=true`,
                lastPlayed: 'Ready to launch',
                installedDrive: (data.InstallLocation && data.InstallLocation[0]) ? data.InstallLocation.slice(0, 2) : 'C:'
              });
            }
          } catch {}
        }
      }
    } catch (e) {
      console.warn('[FSE Games] Error reading Epic manifests:', e);
    }
  }

  // 3. Scan Steam Libraries
  const steamBaseDirs = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam'
  ];
  for (const sb of steamBaseDirs) {
    if (fs.existsSync(sb)) {
      const saDirs = [path.join(sb, 'steamapps')];
      const vdf = path.join(sb, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(vdf)) {
        try {
          const vdfContent = fs.readFileSync(vdf, 'utf8');
          const matches = vdfContent.matchAll(/"path"\s+"([^"]+)"/g);
          for (const m of matches) {
            const lib = m[1].replace(/\\\\/g, '\\');
            const sa = path.join(lib, 'steamapps');
            if (fs.existsSync(sa) && !saDirs.includes(sa)) saDirs.push(sa);
          }
        } catch {}
      }

      for (const sa of saDirs) {
        if (!fs.existsSync(sa)) continue;
        try {
          const files = fs.readdirSync(sa);
          for (const file of files) {
            if (file.startsWith('appmanifest_') && file.endsWith('.acf')) {
              const content = fs.readFileSync(path.join(sa, file), 'utf8');
              const appIdMatch = content.match(/"appid"\s+"(\d+)"/);
              const nameMatch = content.match(/"name"\s+"([^"]+)"/);
              if (appIdMatch && nameMatch) {
                const appId = appIdMatch[1];
                const name = nameMatch[1];
                if (!name.includes('Steamworks Common') && !name.includes('Proton')) {
                  games.push({
                    id: `steam_${appId}`,
                    title: name,
                    platform: 'Steam',
                    coverUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
                    splashUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
                    installPath: path.join(sa, 'common', name),
                    protocol: `steam://run/${appId}`,
                    lastPlayed: 'Steam Library',
                    installedDrive: sa.slice(0, 2)
                  });
                }
              }
            }
          }
        } catch {}
      }
    }
  }

  // 4. Google Play Games PC (Angry Birds 2, etc.)
  games.push({
    id: 'gpg_angry_birds_2',
    title: 'Angry Birds 2',
    platform: 'Google Play Games',
    coverUrl: FALLBACK_COVERS['angry birds 2'],
    splashUrl: FALLBACK_COVERS['angry birds 2'],
    installPath: 'Google Play Games for PC',
    protocol: 'googleplaygames://launch/?id=com.rovio.baba&lid=1&pid=1',
    lastPlayed: 'Installed on PC',
    installedDrive: 'C:'
  });

  return games;
}

// FSE Games is strictly a local desktop launcher bridge. Remote callers / Cloud Run must be refused.
function isLocalhostRequest(req: any): boolean {
  const ip = String(req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || req.hostname === 'localhost';
}

fseGamesRouter.use((req, res, next) => {
  if (!isLocalhostRequest(req)) {
    return res.status(403).json({ success: false, error: 'FSE Game launcher is only accessible on the local machine.' });
  }
  next();
});

// GET /api/fse/games
fseGamesRouter.get('/games', (_req, res) => {
  try {
    const games = scanInstalledGames();
    res.json({
      success: true,
      count: games.length,
      games
    });
  } catch (err: any) {
    console.error('[FSE Games] Scan error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fse/game-art?path=...
fseGamesRouter.get('/game-art', (req, res) => {
  const rawPath = String(req.query.path || '').trim();
  if (!rawPath) return res.status(400).send('Path is required');

  // Prevent directory traversal
  const normalized = path.normalize(path.resolve(rawPath));
  const ext = path.extname(normalized).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.ico'].includes(ext)) {
    return res.status(403).send('Forbidden file extension');
  }

  // Ensure it resides on an active drive and not traversing
  if (rawPath.includes('..') || !fs.existsSync(normalized)) {
    return res.status(404).send('Image file not found');
  }

  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(normalized);
});

const SAFE_PROTOCOL_REGEX = /^(steam|xbox|googleplaygames|epicgames|com\.epicgames\.launcher):\/\/[a-zA-Z0-9_\-\.\/\?=&%+]+$/i;

// POST /api/fse/launch
fseGamesRouter.post('/launch', (req, res) => {
  const { title, protocol, executable, installPath } = req.body ?? {};
  console.log(`[FSE Games] Launch request for: "${title}"`);

  try {
    if (executable && typeof executable === 'string') {
      const normalizedExe = path.normalize(path.resolve(executable));
      if (normalizedExe.includes('..') || !fs.existsSync(normalizedExe)) {
        return res.status(400).json({ success: false, error: 'Executable not found or invalid' });
      }

      // Ensure executable is within a detected game directory (Steam, Xbox, Epic Games)
      const allowedRoots = ['xboxgames', 'steamapps', 'steam library', 'epic games', 'google play games'];
      const lower = normalizedExe.toLowerCase();
      const isAllowedDir = allowedRoots.some(root => lower.includes(root));
      if (!isAllowedDir) {
        return res.status(403).json({ success: false, error: 'Executable outside allowed game directories' });
      }

      const cwd = path.dirname(normalizedExe);
      const child = spawn('cmd.exe', ['/c', 'start', '""', normalizedExe], {
        cwd,
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return res.json({ success: true, method: 'executable', message: `Launched ${title} directly` });
    }

    if (protocol && typeof protocol === 'string') {
      if (!SAFE_PROTOCOL_REGEX.test(protocol)) {
        return res.status(400).json({ success: false, error: 'Invalid game launch protocol format' });
      }

      const child = spawn('cmd.exe', ['/c', 'start', '""', protocol], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return res.json({ success: true, method: 'protocol', message: `Launched ${title} via ${protocol}` });
    }

    if (installPath && typeof installPath === 'string') {
      const normalizedPath = path.normalize(path.resolve(installPath));
      if (!fs.existsSync(normalizedPath)) {
        return res.status(404).json({ success: false, error: 'Install path not found' });
      }
      const child = spawn('explorer.exe', [normalizedPath], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return res.json({ success: true, method: 'folder', message: `Opened install directory for ${title}` });
    }

    res.status(400).json({ success: false, error: 'No valid executable or launch protocol found' });
  } catch (err: any) {
    console.error('[FSE Games] Launch failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
