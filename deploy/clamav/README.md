# ClamAV for Content HQ

Without `CLAMAV_HOST`, Content HQ runs its size, type and signature checks and each file says "Not scanned by antivirus".
With it, the server streams each stored file to clamd over TCP before clearing it. Files go only to this container, which
runs beside the API. ClamAV downloads signature updates; it doesn't send files anywhere.

Not yet deployed or run against real clamd. The code is tested against a fake server that speaks INSTREAM.

## Cloud Run sidecar

`--source` can't be combined with a sidecar in the current deploy step, so this needs a CI change:

```bash
gcloud run deploy plajah-api --project gen-lang-client-0665118474 --region us-west1 \
  --container api --source . --port 8080 --memory 2Gi --cpu 2 \
  --set-env-vars CLAMAV_HOST=127.0.0.1,CLAMAV_PORT=3310 \
  --container clamav --image clamav/clamav:stable --memory 4Gi --cpu 1 \
  --set-env-vars CLAMAV_NO_MILTERD=true
```

Check before relying on it:

- **Pin the image** to a digest once tested. Mirror it to Artifact Registry if Docker Hub limits become a problem.
- **Memory.** Signatures take over 1 GB, up to double during an update. Cloud Run's memory is shared with nothing else in
  that container, but instance cost goes up for all traffic. A separate internal service is the alternative: set
  `CLAMAV_HOST` to it over the VPC.
- **Startup.** clamd takes a minute or more to load signatures. Until then files stay on "Scanning" and retry by themselves.
- **File size.** clamd's default `StreamMaxLength` is far below Content HQ's 25 GB limit. A bigger file is reported as
  "Too large for the antivirus scanner", cleared on the other checks, and says so. Raise `StreamMaxLength`, `MaxScanSize`
  and `MaxFileSize` in `clamd.conf` for fuller coverage, within the container's disk and memory.
- **Instances that scale to zero** start from old signatures until freshclam catches up.

## Variables

| Name | Default | Purpose |
| --- | --- | --- |
| `CLAMAV_HOST` | none | Turns antivirus on |
| `CLAMAV_PORT` | 3310 | clamd TCP port |
| `CLAMAV_TIMEOUT_MS` | 600000 | Gives up on one file after this; it stays locked and retries |

## If clamd is down

Files stay on "Scanning", locked, and the file panel keeps retrying. Nothing is cleared without the scanner it was promised.
The server logs `[Content HQ] antivirus unavailable`. Alert on that log line.

## Files already in Content HQ

Files cleared before this have `scanEngine` unset and show no antivirus claim. They aren't rescanned automatically.
