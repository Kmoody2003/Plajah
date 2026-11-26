#!/bin/bash
# Livewire origin setup (plajah-live-1, Hetzner Ashburn, 178.156.241.166). Idempotent; run as root
# after copying this folder to /tmp/live and installing MediaMTX to /opt/mediamtx (see README.md).
set -e
id -u live >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin live
mkdir -p /opt/plajah-live /etc/plajah-live
install -m 644 /tmp/live/auth.mjs /opt/plajah-live/auth.mjs
install -m 644 /tmp/live/mediamtx.yml /opt/mediamtx/mediamtx.yml
if [ ! -f /etc/plajah-live/env ]; then
  umask 077
  printf 'LIVEWIRE_SECRET=%s\nLIVE_PULL_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48)" "$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-40)" > /etc/plajah-live/env
fi
# MediaMTX CDN mode: Bunny sends 'Authorization: Bearer <pull secret>' and gets cacheable,
# cookie-free HLS. Same value as LIVE_PULL_SECRET, passed by env so it never sits in the yml.
. /etc/plajah-live/env
grep -q '^MTX_HLSCDNSECRET=' /etc/plajah-live/env || echo "MTX_HLSCDNSECRET=$LIVE_PULL_SECRET" >> /etc/plajah-live/env
chown root:live /etc/plajah-live/env; chmod 640 /etc/plajah-live/env

cat >/etc/systemd/system/plajah-live-auth.service <<'U'
[Unit]
Description=Livewire origin auth gate
After=network.target
[Service]
User=live
EnvironmentFile=/etc/plajah-live/env
ExecStart=/usr/bin/node /opt/plajah-live/auth.mjs
Restart=always
RestartSec=2
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
[Install]
WantedBy=multi-user.target
U

cat >/etc/systemd/system/mediamtx.service <<'U'
[Unit]
Description=MediaMTX (Livewire origin)
After=network.target plajah-live-auth.service
Wants=plajah-live-auth.service
[Service]
User=live
EnvironmentFile=/etc/plajah-live/env
ExecStart=/opt/mediamtx/mediamtx /opt/mediamtx/mediamtx.yml
Restart=always
RestartSec=2
LimitNOFILE=65536
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
[Install]
WantedBy=multi-user.target
U

systemctl daemon-reload
systemctl enable --now plajah-live-auth mediamtx >/dev/null 2>&1
systemctl restart plajah-live-auth; sleep 1; systemctl restart mediamtx; sleep 2
systemctl is-active plajah-live-auth mediamtx
journalctl -u mediamtx -n 15 --no-pager -o cat
