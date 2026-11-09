# Content HQ as the one file manager

Owner decision, 2026-11-09: there is one place for files, and it is **Content HQ**. Plajah Drive does not ship as a separate app. Its storage engine and features move into HQ. HQ also becomes the window onto storage people already have:
- the cloud drives they're signed into
- their NAS boxes
- their FTP/SFTP servers, with FileZilla sites imported for logging in

## What HQ already does (keep it)
- Department folders, with per-file access (open / restricted / revoked, by department, role or person) checked on the server.
- Sharing to other orgs, share and review links, comments, versions, and an activity log.
- Malware and MIME quarantine, an audit log, and the account wall between accounts.
- Tela documents, answer keys, and store/product hooks.

## Layer 1: Plajah storage on B2 (built, off)
- New HQ uploads go to B2 under `hq/{kind}/{scopeId}/{assetId}/v{n}`. Records are ordinary `orgAssets` entries whose `storagePath` is `b2:…`.
- The places that read objects all choose the right storage from that prefix:
  - streaming
  - the scan's head read
  - antivirus
  - the 30-day trash sweep
- Access rules, share links, versions and quarantine work unchanged.
- Uploads are resumable: 64 MiB parts, 4 at a time, retried. Signed links pin the size and type. A HEAD check confirms the true size before the record exists.
- The cap is HQ's plan cap plus any storage add-ons:
  - personal add-ons for a person or a business page's owner
  - pools for an org
- Old files stay on Firebase Storage. Nothing is migrated.
- Code:
  - `services/hq/b2Store.ts` and `routes/hqB2.ts`, mounted at `/api/hq/b2`
  - `services/orgAssets.ts` (`uploadHqToB2`, `deleteHqAsset`)
  - `services/drive/client.ts` (`runSignedUpload`)
- **To turn on:** set CORS on plajah-private (allow PUT/GET/HEAD from Plajah origins, expose `ETag`), then set `HQ_B2_ENABLED=1`.

## Layer 2: HQ features that come from Drive (next)
- A storage meter that shows plan plus add-ons, the warning / grace / full states, and "Add storage".
- An upload tray with progress and cancel for each file. Large files survive a dropped connection.
- Trash with "deletes in N days", restore, and delete forever. HQ already has `deletedAt` and `retentionDeleteAt`; this adds the visible countdown.
- Nested folders, a breadcrumb path, and a move dialog. HQ folders are one level today.
- Transfers: a "Send" action on any file (WeTransfer-style link, expiry, download limit), using Drive's transfer rules.

## Layer 3: Connected storage ("Locations")
HQ's sidebar gains a **Locations** section. Each location lists, previews, uploads, downloads, renames and deletes in the same file view. Files can be copied or moved between any two locations, including into Plajah storage. Credentials never sit in a browser's storage.

| Location | How it connects | Where it runs |
|---|---|---|
| Google Drive, OneDrive / SharePoint, Dropbox, Box | OAuth sign-in ("pull storage from where you're logged in"); tokens encrypted server-side | Server (API calls); bytes stream browser↔provider where the API allows |
| iCloud Drive | No public API; the desktop app reads the local iCloud folder | Desktop |
| S3-compatible (AWS, B2, Wasabi, R2, MinIO) | Access keys | Server or desktop |
| FTP, FTPS, FTPES, SFTP | Host + login, or key file; **FileZilla import** | Desktop for any server; server relay for internet-reachable hosts |
| WebDAV (Nextcloud, ownCloud, many NAS) | URL + login | Server or desktop |
| NAS: Synology (File Station API), QNAP (File Station), TrueNAS (REST), Unraid, plus any SMB/NFS share | The vendor API when it's available, otherwise SMB/WebDAV | Desktop on the same network; remote via the vendor's own relay (e.g. Synology QuickConnect) or WebDAV |

**Why the desktop app does the local-network work:**
- A browser can't open FTP, SFTP or SMB connections.
- A cloud server can't reach a NAS inside someone's home or church network.
- So the Windows app does this work: it already owns the native engine and has the device keychain.
- The web and phone apps see those locations through the desktop app when it's online, the way Plex reaches a home server.

**NAS management** means more than browsing. Through the vendor APIs, an admin can see:
- disk and volume health, capacity, and temperature
- shared folders and users
- running tasks and backups

They can also start and stop backup jobs, for example pushing a NAS folder to Plajah storage on a schedule. Synology and QNAP come first: they're most of the church and small-business market. TrueNAS and Unraid follow.

**FTP client:**
- Two panes: a location on one side, HQ or another location on the other.
- A transfer queue with resume and retry, and a log.
- Sites saved with a folder tree.
- **Import from FileZilla:** `sitemanager.xml`, a Site Manager export, or `recentservers.xml`. The parser (`services/storageConnectors/filezilla.ts`) keeps:
  - folders, host, port and protocol (FTP / FTPS / FTPES / SFTP / S3 / WebDAV)
  - user, logon type, key file, remote and local folders, and comments
- **FileZilla passwords:**
  - Base64-saved passwords go straight into the device keychain. They are never uploaded or logged.
  - Passwords encrypted with a FileZilla master password show as "enter once on first connect".
  - Sites with no saved password ask for one.

**Safety rules for connectors:**
- Server relays refuse private, loopback and link-local addresses, so a user can't make our server attack internal hosts (SSRF).
- Server relays connect only to ports the protocol allows.
- Every connection has a time and size budget.
- Tokens and passwords are encrypted at rest with a key that only the server holds. Desktop-held secrets stay in the OS keychain.
- Copying from a location into Plajah storage goes through the same quota, scan and quarantine as an upload.
- Org admins choose which location types their org may use.

## Order
1. Layer 1: on once CORS is set.
2. Layer 2: meter, tray, trash countdown, nested folders.
3. Locations framework, plus Google Drive / OneDrive / Dropbox sign-in.
4. Desktop: FTP/SFTP client with FileZilla import; SMB and WebDAV.
5. NAS: Synology and QNAP browsing, then management (health, backups).
6. Transfers ("Send").
