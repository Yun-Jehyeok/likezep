#!/usr/bin/env bash
#
# Phase B: t4g.nano (ARM64, Ubuntu 24.04) 스테이징 EC2 초기 세팅 스크립트.
#
# 사용법:
#   scp infra/scripts/setup-staging-ec2.sh ubuntu@<staging-ip>:/tmp/
#   ssh ubuntu@<staging-ip> 'sudo bash /tmp/setup-staging-ec2.sh'
#
# 각 단계는 idempotent하도록 작성. 실패한 지점에서 재실행 가능.
# 인터랙티브가 필요한 부분(certbot email, .env 값, Google OAuth 등록)은
# 스크립트 밖에서 수동으로 처리 — 하단 "수동 단계" 참조.
#
# 관련: docs/plans/s3-cloudfront-migration.md Phase B

set -euo pipefail

log() { echo -e "\n\033[1;36m[$(date +%H:%M:%S)] $*\033[0m"; }

# ─── 1. 사전 확인 ──────────────────────────────────────────────────────────
log "1. 시스템 확인"
arch=$(uname -m)
if [ "$arch" != "aarch64" ]; then
  echo "ERROR: 이 스크립트는 t4g.nano (ARM64/aarch64) 전용. 현재: $arch"
  exit 1
fi
lsb_release -a || true
free -h
df -h /

# ─── 2. Swap 2GB (mediasoup 네이티브 빌드 OOM 방지) ────────────────────────
# t4g.nano는 512MB RAM. mediasoup 첫 빌드 시 OOM 필연 → swap 필수.
log "2. Swap 2GB 설정"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  log "  → swap 활성화 완료"
else
  log "  → /swapfile 이미 존재, 스킵"
fi
swapon --show

# ─── 3. 시스템 패키지 업데이트 + 기본 도구 ──────────────────────────────────
log "3. apt 업데이트 + 기본 도구"
apt-get update
apt-get install -y curl git build-essential ca-certificates gnupg python3-pip \
  postgresql postgresql-contrib coturn nginx certbot python3-certbot-nginx

# ─── 4. Node.js 20 (arm64) ─────────────────────────────────────────────────
# NodeSource 저장소에서 설치. ARM64 바이너리 자동 선택됨.
log "4. Node.js 20 설치"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v20'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

# ─── 5. pnpm 9 (corepack) ──────────────────────────────────────────────────
log "5. pnpm 9 설치"
corepack enable
corepack prepare pnpm@9 --activate
pnpm -v

# ─── 6. PostgreSQL — staging DB + 유저 ─────────────────────────────────────
# 프로덕션과 동일한 dev:dev 자격증명이지만 DB명은 별도(mentoring_staging).
# 시딩은 seed 재실행 방식(§6 결정) → 이 스크립트는 DB/유저만 만들고
# prisma migrate/seed는 리포지토리 clone 후 실행.
log "6. PostgreSQL 유저/DB 생성"
sudo -u postgres psql <<'SQL'
DO $$ BEGIN
  CREATE USER dev WITH PASSWORD 'dev';
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'user dev already exists';
END $$;
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'mentoring_staging'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE mentoring_staging OWNER dev;"

# ─── 7. coturn — 프로덕션과 동일 설정 ──────────────────────────────────────
# coturn 상세 설정(realm, listening-port, static-auth-secret 등)은
# 프로덕션 turnserver.conf를 그대로 복사해 사용.
# 이 스크립트는 패키지 설치와 서비스 활성화만.
log "7. coturn 서비스 활성화"
sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn || true
systemctl enable coturn
# 실제 start는 turnserver.conf 배치 후 수동으로 (아래 수동 단계)

# ─── 8. pm2 + systemd startup ───────────────────────────────────────────────
# 재부팅 후 자동 복구 (EC2 auto recovery 대비, ec2-reboot-2026-09-26 회고 참조).
log "8. pm2 + startup"
npm install -g pm2
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | bash || true

# ─── 9. 방화벽 (UFW) — 기본 정책 ──────────────────────────────────────────
# EC2 Security Group이 primary 방어층이지만 이중 방어 차원.
log "9. UFW 기본 정책 (참고용, 실 적용은 수동)"
echo "  → UFW는 수동 활성화. 필요 포트: 22(SSH), 80/443(HTTP/S), 3478/UDP(TURN), 49152-65535/UDP(TURN relay)"

log "==================================================="
log "자동화 부분 완료. 아래 수동 단계를 이어서 진행:"
log "==================================================="
cat <<'MANUAL'

[수동 단계 — Phase B checklist]

M1. Route53 hosted zone 생성 (like-zep.shop) — 이 시점엔 NS 전환 X
    aws route53 create-hosted-zone --name like-zep.shop --caller-reference $(date +%s)

M2. ACM 인증서 발급 (us-east-1! CloudFront는 us-east-1만 지원)
    aws acm request-certificate \
      --region us-east-1 \
      --domain-name staging.like-zep.shop \
      --validation-method DNS

M3. S3 버킷 생성 (likezep-client-staging, ap-northeast-2, public 접근 차단)
    aws s3api create-bucket \
      --bucket likezep-client-staging \
      --region ap-northeast-2 \
      --create-bucket-configuration LocationConstraint=ap-northeast-2

M4. CloudFront distribution 생성 (S3 origin + OAC)
    - Alternate domain: staging.like-zep.shop
    - Cache behavior: /assets/* immutable, / no-cache (SPA)
    - ACM 인증서: M2에서 발급한 것
    - Default root object: index.html
    - Error pages: 403/404 → /index.html (SPA fallback)

M5. Route53 레코드 추가 (Route53 NS로 직접 dig 검증 — 아직 NS 전환 안 했으므로)
    - staging.like-zep.shop  A(alias) → CloudFront
    - api-staging.like-zep.shop  A → 이 EC2 IP

M6. certbot 인증서 발급 (api-staging.like-zep.shop 대상, DNS 전파 후)
    sudo certbot --nginx -d api-staging.like-zep.shop

M7. nginx 설정 배포
    sudo cp infra/nginx/api-staging.like-zep.shop.conf /etc/nginx/sites-available/
    sudo ln -s /etc/nginx/sites-available/api-staging.like-zep.shop /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx

M8. Google Cloud Console — JavaScript origins에 https://staging.like-zep.shop 추가

M9. 리포지토리 clone + .env 세팅
    cd /home/ubuntu
    git clone https://github.com/Yun-Jehyeok/likezep.git
    cd likezep
    # apps/server/.env: DATABASE_URL=postgresql://dev:dev@localhost/mentoring_staging 로 설정
    # apps/client/.env: staging 값 (VITE_API_URL=https://api-staging.like-zep.shop 등)

M10. 빌드 (ARM 네이티브 빌드 검증 — mediasoup / prisma)
    NODE_OPTIONS='--max-old-space-size=1024' pnpm install
    pnpm --filter @mentoring/shared build
    pnpm --filter @mentoring/server build
    pnpm --filter @mentoring/server exec prisma migrate deploy
    pnpm --filter @mentoring/server exec prisma db seed

M11. pm2 등록 + save
    pm2 start /home/ubuntu/likezep/apps/server/dist/index.js \
      --name likezep-staging-server \
      --node-args="--env-file=.env" \
      --cwd /home/ubuntu/likezep/apps/server
    pm2 save

M12. GH Actions Environment "staging" 생성 + secrets/vars 등록
    (Repository Settings → Environments → New environment: staging)
    secrets: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET=likezep-client-staging,
             CLOUDFRONT_DISTRIBUTION_ID, VITE_GOOGLE_CLIENT_ID, VITE_SENTRY_DSN
    vars: VITE_API_URL=https://api-staging.like-zep.shop
          VITE_SERVER_URL=wss://api-staging.like-zep.shop

M13. 클라 배포 (Actions → Deploy Client → Run workflow → staging)

M14. E2E 스모크
    PLAYWRIGHT_BASE_URL=https://staging.like-zep.shop pnpm test:e2e

M15. ARM 검증 체크리스트
    - [ ] mediasoup worker 정상 기동 (`curl 127.0.0.1:2567/health` + Colyseus 룸 접속)
    - [ ] prisma 쿼리 정상 (Login → /api/me 응답)
    - [ ] coturn relay candidate 획득 (실기기 테스트)
    - [ ] 스크린 셰어 시청자 5명 부하 테스트

MANUAL

log "완료. 상세 checklist는 위 MANUAL 블록 참조."
