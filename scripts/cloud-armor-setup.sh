#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Plajah — Google Cloud Armor + Load Balancer setup for Cloud Run
#
# Run this once from any machine with gcloud CLI authenticated as a project owner.
# Prerequisites:
#   gcloud auth login
#   gcloud config set project gen-lang-client-0665118474
#
# After running:
#   1. Note the static IP printed at the end
#   2. In your DNS provider, point plajah.com → that IP (A record)
#   3. Delete any old A/CNAME records pointing elsewhere
#   4. SSL cert auto-provisions within ~30 min after DNS propagates
#
# Estimated monthly cost: ~$18 load balancer + $0.75/million requests (Cloud Armor)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT="gen-lang-client-0665118474"
REGION="us-central1"           # change if your Cloud Run service is in a different region
SERVICE="plajah-server"        # your Cloud Run service name (check: gcloud run services list)
DOMAIN="plajah.com"
POLICY="plajah-armor"
NEG="plajah-neg"
BACKEND="plajah-backend"
IP_NAME="plajah-ip"
CERT="plajah-cert"
URL_MAP="plajah-url-map"
PROXY="plajah-https-proxy"
RULE="plajah-https-rule"

echo "► Setting project to $PROJECT"
gcloud config set project "$PROJECT"

# ── 1. Reserve a global static IP ────────────────────────────────────────────
echo "► Reserving static IP..."
gcloud compute addresses create "$IP_NAME" \
  --global \
  --ip-version=IPV4 \
  --quiet || echo "  (already exists, continuing)"

STATIC_IP=$(gcloud compute addresses describe "$IP_NAME" --global --format="value(address)")
echo "  Static IP: $STATIC_IP"
echo "  ⚠  Point $DOMAIN → $STATIC_IP in your DNS before SSL cert can provision."

# ── 2. Create serverless NEG for Cloud Run ────────────────────────────────────
echo "► Creating serverless NEG..."
gcloud compute network-endpoint-groups create "$NEG" \
  --region="$REGION" \
  --network-endpoint-type=serverless \
  --cloud-run-service="$SERVICE" \
  --quiet || echo "  (already exists, continuing)"

# ── 3. Create backend service ─────────────────────────────────────────────────
echo "► Creating backend service..."
gcloud compute backend-services create "$BACKEND" \
  --global \
  --load-balancing-scheme=EXTERNAL \
  --enable-cdn \
  --quiet || echo "  (already exists, continuing)"

echo "► Adding NEG to backend..."
gcloud compute backend-services add-backend "$BACKEND" \
  --global \
  --network-endpoint-group="$NEG" \
  --network-endpoint-group-region="$REGION" \
  --quiet || echo "  (already added, continuing)"

# ── 4. Create Cloud Armor security policy ─────────────────────────────────────
echo "► Creating Cloud Armor security policy..."
gcloud compute security-policies create "$POLICY" \
  --description="Plajah WAF — OWASP + rate limiting + bot protection" \
  --quiet || echo "  (already exists, continuing)"

# Default rule: allow (overridden by priority rules below)
gcloud compute security-policies rules update 2147483647 \
  --security-policy="$POLICY" \
  --action=allow \
  --quiet

# ── OWASP ModSecurity Core Rule Set (CRS v3.3) ──────────────────────────────
echo "  Adding OWASP SQL injection rules..."
gcloud compute security-policies rules create 100 \
  --security-policy="$POLICY" \
  --expression="evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 2})" \
  --action=deny-403 \
  --description="Block SQL injection" \
  --quiet || echo "  (rule 100 already exists)"

echo "  Adding OWASP XSS rules..."
gcloud compute security-policies rules create 200 \
  --security-policy="$POLICY" \
  --expression="evaluatePreconfiguredWaf('xss-v33-stable', {'sensitivity': 2})" \
  --action=deny-403 \
  --description="Block XSS" \
  --quiet || echo "  (rule 200 already exists)"

echo "  Adding OWASP LFI rules..."
gcloud compute security-policies rules create 300 \
  --security-policy="$POLICY" \
  --expression="evaluatePreconfiguredWaf('lfi-v33-stable')" \
  --action=deny-403 \
  --description="Block local file inclusion" \
  --quiet || echo "  (rule 300 already exists)"

echo "  Adding OWASP RFI rules..."
gcloud compute security-policies rules create 400 \
  --security-policy="$POLICY" \
  --expression="evaluatePreconfiguredWaf('rfi-v33-stable')" \
  --action=deny-403 \
  --description="Block remote file inclusion" \
  --quiet || echo "  (rule 400 already exists)"

echo "  Adding OWASP RCE rules..."
gcloud compute security-policies rules create 500 \
  --security-policy="$POLICY" \
  --expression="evaluatePreconfiguredWaf('rce-v33-stable')" \
  --action=deny-403 \
  --description="Block remote code execution" \
  --quiet || echo "  (rule 500 already exists)"

echo "  Adding Scanner detection rules..."
gcloud compute security-policies rules create 600 \
  --security-policy="$POLICY" \
  --expression="evaluatePreconfiguredWaf('scannerdetection-v33-stable')" \
  --action=deny-403 \
  --description="Block vulnerability scanners" \
  --quiet || echo "  (rule 600 already exists)"

echo "  Adding Protocol attack rules..."
gcloud compute security-policies rules create 700 \
  --security-policy="$POLICY" \
  --expression="evaluatePreconfiguredWaf('protocolattack-v33-stable')" \
  --action=deny-403 \
  --description="Block protocol attacks" \
  --quiet || echo "  (rule 700 already exists)"

echo "  Adding PHP injection rules..."
gcloud compute security-policies rules create 800 \
  --security-policy="$POLICY" \
  --expression="evaluatePreconfiguredWaf('php-v33-stable')" \
  --action=deny-403 \
  --description="Block PHP injection" \
  --quiet || echo "  (rule 800 already exists)"

# ── Rate limiting: 500 req/min per IP (DDoS) ─────────────────────────────────
echo "  Adding rate limiting rule..."
gcloud compute security-policies rules create 1000 \
  --security-policy="$POLICY" \
  --expression="true" \
  --action=rate-based-ban \
  --rate-limit-threshold-count=500 \
  --rate-limit-threshold-interval-sec=60 \
  --ban-duration-sec=300 \
  --conform-action=allow \
  --exceed-action=deny-429 \
  --enforce-on-key=IP \
  --description="Rate limit: 500 req/min per IP, 5-min ban" \
  --quiet || echo "  (rule 1000 already exists)"

# ── Stripe webhook: bypass rate limit for /api/stripe/webhook ─────────────────
echo "  Allowing Stripe webhook bypass..."
gcloud compute security-policies rules create 50 \
  --security-policy="$POLICY" \
  --expression="request.path.matches('/api/stripe/webhook')" \
  --action=allow \
  --description="Allow Stripe webhook (Stripe IPs are pre-verified)" \
  --quiet || echo "  (rule 50 already exists)"

# ── Block known bad user agents ───────────────────────────────────────────────
echo "  Adding bot/scanner UA blocking..."
gcloud compute security-policies rules create 900 \
  --security-policy="$POLICY" \
  --expression="request.headers['user-agent'].matches('(?i)(sqlmap|nikto|nmap|masscan|zgrab|gobuster|dirb|dirbuster|nuclei|burpsuite|acunetix|nessus|openvas)')" \
  --action=deny-403 \
  --description="Block known attack tool user agents" \
  --quiet || echo "  (rule 900 already exists)"

# ── Attach Cloud Armor policy to backend ─────────────────────────────────────
echo "► Attaching Cloud Armor to backend service..."
gcloud compute backend-services update "$BACKEND" \
  --global \
  --security-policy="$POLICY" \
  --quiet

# ── 5. Managed SSL certificate ────────────────────────────────────────────────
echo "► Creating managed SSL certificate for $DOMAIN..."
gcloud compute ssl-certificates create "$CERT" \
  --domains="$DOMAIN,www.$DOMAIN" \
  --global \
  --quiet || echo "  (already exists, continuing)"

# ── 6. URL map ────────────────────────────────────────────────────────────────
echo "► Creating URL map..."
gcloud compute url-maps create "$URL_MAP" \
  --default-service="$BACKEND" \
  --global \
  --quiet || echo "  (already exists, continuing)"

# ── 7. HTTPS target proxy ─────────────────────────────────────────────────────
echo "► Creating HTTPS proxy..."
gcloud compute target-https-proxies create "$PROXY" \
  --url-map="$URL_MAP" \
  --ssl-certificates="$CERT" \
  --global \
  --quiet || echo "  (already exists, continuing)"

# ── 8. Global forwarding rule ─────────────────────────────────────────────────
echo "► Creating forwarding rule (port 443)..."
gcloud compute forwarding-rules create "$RULE" \
  --global \
  --target-https-proxy="$PROXY" \
  --address="$IP_NAME" \
  --ports=443 \
  --quiet || echo "  (already exists, continuing)"

# HTTP → HTTPS redirect
echo "► Adding HTTP→HTTPS redirect..."
gcloud compute url-maps import plajah-http-redirect \
  --global \
  --source /dev/stdin \
  --quiet <<'YAMLEOF' || echo "  (redirect map already exists)"
name: plajah-http-redirect
defaultUrlRedirect:
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
  httpsRedirect: true
YAMLEOF

gcloud compute target-http-proxies create plajah-http-proxy \
  --url-map=plajah-http-redirect \
  --global \
  --quiet || echo "  (already exists)"

gcloud compute forwarding-rules create plajah-http-rule \
  --global \
  --target-http-proxy=plajah-http-proxy \
  --address="$IP_NAME" \
  --ports=80 \
  --quiet || echo "  (already exists)"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Cloud Armor setup complete!"
echo "  Static IP: $STATIC_IP"
echo ""
echo "  Next steps:"
echo "  1. In your DNS: set $DOMAIN A record → $STATIC_IP"
echo "  2. SSL cert will auto-provision after DNS propagates (~30 min)"
echo "  3. Monitor: https://console.cloud.google.com/security/cloud-armor"
echo ""
echo "  To view policy rules:"
echo "  gcloud compute security-policies describe $POLICY"
echo "════════════════════════════════════════════════════════════════"
