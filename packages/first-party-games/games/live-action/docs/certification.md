# Hardware certification programme

See ADR-0005 for why Plajah does not manufacture.

## What Plajah publishes

| Layer | Contents |
|---|---|
| Protocol | Hit registration, reload, damage model, session join |
| Pairing | BLE/UWB handshake, hardware-rooted attestation, anti-spoof |
| Physical | Silhouette, colour ratio, forbidden finishes, muzzle energy, age marking |
| Badge | "Plajah Compatible" + protocol version, on the retail box |

## What the licensee carries

Injection tooling, ASTM F963 toy safety, CPSC compliance, FCC/CE radio certification
per SKU, freight, warehousing, retail margin, returns and recalls.

## Revenue

Per-SKU certification fee plus a cut of sessions played on certified gear. Both
recur; neither requires holding inventory.

## Revocation

Two levels, both live: `CertifiedSku.revokedAt` kills a batch, `CertifiedDevice
.revokedAt` kills a unit. No attestation, no session — a revoked device simply cannot
join. This is the only real remedy against a bad licensee, so it must be exercised
before it is ever needed, not designed and left untested.

## Badge rules

- Minimum 12mm wide; below that, mark only, no wordmark.
- Protocol version always shown — it is how a buyer knows a 2027 blaster works in a
  2029 arena.
- The licensee's own branding is always larger. It is their product, not ours.
