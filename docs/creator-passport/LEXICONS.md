# Creator Passport — Lexicons (Draft v0.1)

AT-Protocol lexicon definitions for the creative-works data model. One NSID per definition (split into
individual files when implementing). Record references use `com.atproto.repo.strongRef` (uri + cid) so a
work graph is content-pinned and survives migration. Media is referenced by `blob` (→ CID).

> Design draft only — not yet wired. Namespace `app.plajah.*` for the reference impl; neutralize for
> standardization later.

---

## Shared defs — `app.plajah.creative.defs`

```json
{
  "lexicon": 1,
  "id": "app.plajah.creative.defs",
  "defs": {
    "visibility": {
      "type": "string",
      "knownValues": ["public", "unlisted", "private"],
      "description": "private => the blob is E2E-encrypted; access via capability grant."
    },
    "rights": {
      "type": "object",
      "properties": {
        "owners": { "type": "array", "items": { "type": "string", "format": "did" } },
        "license": { "type": "string", "description": "SPDX/CC id or 'all-rights-reserved'" },
        "territory": { "type": "array", "items": { "type": "string" }, "description": "ISO country codes; omit = worldwide" },
        "terms": { "type": "string", "maxGraphemes": 2000 }
      }
    },
    "externalLink": {
      "type": "object",
      "required": ["url"],
      "properties": {
        "url": { "type": "string", "format": "uri" },
        "platform": { "type": "string", "description": "e.g. spotify, youtube, appstore" },
        "kind": { "type": "string", "knownValues": ["stream", "purchase", "mirror", "canonical"] }
      }
    },
    "creditRef": {
      "type": "object",
      "description": "Either a strongRef to a credit record, or an inline credit.",
      "properties": {
        "ref": { "type": "ref", "ref": "com.atproto.repo.strongRef" },
        "inline": { "type": "ref", "ref": "#inlineCredit" }
      }
    },
    "inlineCredit": {
      "type": "object",
      "required": ["role"],
      "properties": {
        "role": { "type": "string", "description": "e.g. producer, author, director, featured" },
        "subject": { "type": "string", "format": "did", "description": "the collaborator's Passport DID (verifiable)" },
        "name": { "type": "string", "description": "fallback display name when subject has no DID" }
      }
    },
    "provenance": {
      "type": "object",
      "description": "Authorship proof. Populated async after the work is anchored.",
      "properties": {
        "chain": { "type": "string", "knownValues": ["bitcoin"] },
        "anchoredAt": { "type": "string", "format": "datetime" },
        "rootCid": { "type": "string", "format": "cid", "description": "the repo Merkle root that was timestamped" },
        "otsProof": { "type": "blob", "accept": ["application/octet-stream"], "description": "OpenTimestamps proof file" }
      }
    }
  }
}
```

---

## Profile — `app.plajah.actor.profile`  *(key: literal:self)*

```json
{
  "lexicon": 1,
  "id": "app.plajah.actor.profile",
  "defs": {
    "main": {
      "type": "record",
      "key": "literal:self",
      "record": {
        "type": "object",
        "required": ["displayName"],
        "properties": {
          "displayName": { "type": "string", "maxGraphemes": 64 },
          "bio": { "type": "string", "maxGraphemes": 2560 },
          "pronouns": { "type": "string", "maxGraphemes": 32 },
          "roles": { "type": "array", "items": { "type": "string" }, "description": "artist, author, filmmaker, vj, …" },
          "avatar": { "type": "blob", "accept": ["image/png", "image/jpeg", "image/webp"], "maxSize": 2000000 },
          "banner": { "type": "blob", "accept": ["image/*"], "maxSize": 5000000 },
          "links": { "type": "array", "items": { "type": "ref", "ref": "app.plajah.creative.defs#externalLink" } },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

---

## Credit — `app.plajah.creative.credit`  *(portable, verifiable attribution)*

```json
{
  "lexicon": 1,
  "id": "app.plajah.creative.credit",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["role", "createdAt"],
        "properties": {
          "role": { "type": "string" },
          "subject": { "type": "string", "format": "did" },
          "name": { "type": "string" },
          "work": { "type": "ref", "ref": "com.atproto.repo.strongRef", "description": "the work this credit is for" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

---

## Track — `app.plajah.creative.track`

```json
{
  "lexicon": 1,
  "id": "app.plajah.creative.track",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["title", "audio", "createdAt"],
        "properties": {
          "title": { "type": "string", "maxGraphemes": 200 },
          "audio": { "type": "blob", "accept": ["audio/*"], "maxSize": 200000000 },
          "duration": { "type": "integer", "description": "milliseconds" },
          "cover": { "type": "blob", "accept": ["image/*"], "maxSize": 5000000 },
          "isrc": { "type": "string" },
          "lyrics": { "type": "string", "maxGraphemes": 20000 },
          "album": { "type": "ref", "ref": "com.atproto.repo.strongRef" },
          "credits": { "type": "array", "items": { "type": "ref", "ref": "app.plajah.creative.defs#creditRef" } },
          "visibility": { "type": "ref", "ref": "app.plajah.creative.defs#visibility" },
          "rights": { "type": "ref", "ref": "app.plajah.creative.defs#rights" },
          "external": { "type": "array", "items": { "type": "ref", "ref": "app.plajah.creative.defs#externalLink" } },
          "provenance": { "type": "ref", "ref": "app.plajah.creative.defs#provenance" },
          "tags": { "type": "array", "items": { "type": "string" } },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

---

## Album — `app.plajah.creative.album`

```json
{
  "lexicon": 1,
  "id": "app.plajah.creative.album",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["title", "kind", "createdAt"],
        "properties": {
          "title": { "type": "string", "maxGraphemes": 200 },
          "kind": { "type": "string", "knownValues": ["album", "ep", "single", "mixtape", "compilation"] },
          "cover": { "type": "blob", "accept": ["image/*"], "maxSize": 5000000 },
          "tracks": { "type": "array", "items": { "type": "ref", "ref": "com.atproto.repo.strongRef" } },
          "releaseDate": { "type": "string", "format": "datetime" },
          "label": { "type": "string" },
          "upc": { "type": "string" },
          "credits": { "type": "array", "items": { "type": "ref", "ref": "app.plajah.creative.defs#creditRef" } },
          "visibility": { "type": "ref", "ref": "app.plajah.creative.defs#visibility" },
          "rights": { "type": "ref", "ref": "app.plajah.creative.defs#rights" },
          "provenance": { "type": "ref", "ref": "app.plajah.creative.defs#provenance" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

---

## Video — `app.plajah.creative.video`  *(film/series/episode follow the same shape; see notes)*

```json
{
  "lexicon": 1,
  "id": "app.plajah.creative.video",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["title", "createdAt"],
        "properties": {
          "title": { "type": "string", "maxGraphemes": 300 },
          "media": { "type": "blob", "accept": ["video/*"], "maxSize": 5000000000 },
          "external": { "type": "array", "items": { "type": "ref", "ref": "app.plajah.creative.defs#externalLink" }, "description": "use when media lives off-repo (HLS/CDN)" },
          "thumbnail": { "type": "blob", "accept": ["image/*"], "maxSize": 5000000 },
          "duration": { "type": "integer", "description": "milliseconds" },
          "captions": { "type": "array", "items": { "type": "blob", "accept": ["text/vtt"] } },
          "credits": { "type": "array", "items": { "type": "ref", "ref": "app.plajah.creative.defs#creditRef" } },
          "visibility": { "type": "ref", "ref": "app.plajah.creative.defs#visibility" },
          "rights": { "type": "ref", "ref": "app.plajah.creative.defs#rights" },
          "provenance": { "type": "ref", "ref": "app.plajah.creative.defs#provenance" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```
> **film** = video + `kind`(feature/short/doc), `poster`, `runtime`, `rating`, `cast[]`/`crew[]` (credits).
> **series** = `poster` + `seasons[]` meta. **episode** = `series`(strongRef) + `season` + `number` + the video shape.
> For large video, prefer `external` (HLS on CDN) over an in-repo blob; the CID still identifies the master.

---

## Book — `app.plajah.creative.book`

```json
{
  "lexicon": 1,
  "id": "app.plajah.creative.book",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["title", "createdAt"],
        "properties": {
          "title": { "type": "string", "maxGraphemes": 300 },
          "cover": { "type": "blob", "accept": ["image/*"], "maxSize": 5000000 },
          "isbn": { "type": "string" },
          "authors": { "type": "array", "items": { "type": "ref", "ref": "app.plajah.creative.defs#creditRef" } },
          "content": { "type": "blob", "accept": ["application/epub+zip", "application/pdf"], "maxSize": 500000000 },
          "chapters": { "type": "array", "items": { "type": "ref", "ref": "com.atproto.repo.strongRef" }, "description": "use instead of a single content blob for chaptered/serialized works" },
          "visibility": { "type": "ref", "ref": "app.plajah.creative.defs#visibility" },
          "rights": { "type": "ref", "ref": "app.plajah.creative.defs#rights" },
          "provenance": { "type": "ref", "ref": "app.plajah.creative.defs#provenance" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

---

## Post — `app.plajah.creative.post`  *(maps to ActivityPub Note / AT post)*

```json
{
  "lexicon": 1,
  "id": "app.plajah.creative.post",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["createdAt"],
        "properties": {
          "text": { "type": "string", "maxGraphemes": 3000 },
          "embeds": { "type": "array", "items": { "type": "ref", "ref": "com.atproto.repo.strongRef" }, "description": "media works referenced inline" },
          "images": { "type": "array", "items": { "type": "blob", "accept": ["image/*"], "maxSize": 5000000 } },
          "replyTo": { "type": "ref", "ref": "com.atproto.repo.strongRef" },
          "quote": { "type": "ref", "ref": "com.atproto.repo.strongRef" },
          "visibility": { "type": "ref", "ref": "app.plajah.creative.defs#visibility" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

---

## Project — `app.plajah.creative.project`  *(on-platform creative projects travel too)*

```json
{
  "lexicon": 1,
  "id": "app.plajah.creative.project",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["title", "app", "createdAt"],
        "properties": {
          "title": { "type": "string", "maxGraphemes": 200 },
          "app": { "type": "string", "description": "the creative tool, e.g. plajah-pixels, lorea" },
          "kind": { "type": "string", "description": "tool-specific project kind, e.g. vj-set, book-draft" },
          "snapshot": { "type": "blob", "accept": ["application/json", "application/zip", "application/octet-stream"], "maxSize": 500000000, "description": "the portable project file" },
          "schemaVersion": { "type": "string" },
          "openWith": { "type": "string", "format": "uri", "description": "deep-link/runtime hint to resume the project" },
          "preview": { "type": "blob", "accept": ["image/*", "video/*"], "maxSize": 50000000 },
          "collaborators": { "type": "array", "items": { "type": "ref", "ref": "app.plajah.creative.defs#creditRef" } },
          "visibility": { "type": "ref", "ref": "app.plajah.creative.defs#visibility" },
          "provenance": { "type": "ref", "ref": "app.plajah.creative.defs#provenance" },
          "createdAt": { "type": "string", "format": "datetime" },
          "updatedAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```
> This is the bridge from Plajah's tools to the Passport: a **Plajah Pixels set** or **Lorea draft** is a
> `project` record with a `snapshot` blob, so it follows the creator and can be reopened on any device/app
> that understands `app`+`schemaVersion`. **Design future Plajah features to emit a `project` record** — that
> is how everything built in Plajah inherits portability for free.

---

## Worked example — a creator's repo (render-by-reference)

```
DID: did:plc:alice    Handle: alice.plajah.app    PDS: pds.plajah.app
```
```json
// app.plajah.actor.profile/self
{ "$type": "app.plajah.actor.profile", "displayName": "Alice Vex",
  "roles": ["artist", "vj"], "avatar": { "$type": "blob", "ref": "bafkrei...av", "mimeType": "image/webp", "size": 91233 },
  "createdAt": "2026-03-01T12:00:00Z" }

// app.plajah.creative.credit/c1
{ "$type": "app.plajah.creative.credit", "role": "producer", "subject": "did:plc:bob",
  "createdAt": "2026-03-01T12:00:00Z" }

// app.plajah.creative.track/t1
{ "$type": "app.plajah.creative.track", "title": "Neon Drift",
  "audio": { "$type": "blob", "ref": "bafkrei...aud1", "mimeType": "audio/mp4", "size": 8123004 },
  "duration": 213400, "isrc": "USXXX2600001",
  "album": { "uri": "at://did:plc:alice/app.plajah.creative.album/al1", "cid": "bafyrei...al1" },
  "credits": [ { "ref": { "uri": "at://did:plc:alice/app.plajah.creative.credit/c1", "cid": "bafyrei...c1" } } ],
  "visibility": "public", "createdAt": "2026-03-01T12:00:00Z" }

// app.plajah.creative.album/al1
{ "$type": "app.plajah.creative.album", "title": "Midnight Neon", "kind": "album",
  "cover": { "$type": "blob", "ref": "bafkrei...cov", "mimeType": "image/jpeg", "size": 482113 },
  "tracks": [ { "uri": "at://did:plc:alice/app.plajah.creative.track/t1", "cid": "bafyrei...t1" } ],
  "releaseDate": "2026-03-01T00:00:00Z", "visibility": "public", "createdAt": "2026-03-01T12:00:00Z" }

// app.plajah.creative.project/p1   (a Plajah Pixels set that travels)
{ "$type": "app.plajah.creative.project", "title": "Midnight Neon — Live VJ Set", "app": "plajah-pixels",
  "kind": "vj-set", "schemaVersion": "1.0",
  "snapshot": { "$type": "blob", "ref": "bafkrei...proj", "mimeType": "application/json", "size": 204882 },
  "preview": { "$type": "blob", "ref": "bafkrei...prev", "mimeType": "video/mp4", "size": 4882113 },
  "visibility": "public", "createdAt": "2026-03-02T09:00:00Z", "updatedAt": "2026-03-02T09:00:00Z" }
```
**The flow:** any app resolves `did:plc:alice` → her PDS → reads these records → streams `audio`/`cover`/
`snapshot` by CID from the content layer. Alice uploaded nothing into that app; her catalog + her VJ set are
simply present.
