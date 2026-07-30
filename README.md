# likezep

ZEP을 대체하는 자체 온라인 멘토링 플랫폼.
멀티룸 동시 관리 시 렉 제로를 목표로 설계했습니다.

## 기술 스택

| 분류 | 기술 |
|---|---|
| 프론트엔드 | React, TypeScript, Vite, PixiJS, Tailwind CSS v4 |
| 백엔드 | Node.js, Express, Colyseus, mediasoup |
| 실시간 통신 | WebRTC (Mesh), WebSocket (Colyseus) |
| 데이터베이스 | PostgreSQL, Prisma ORM |
| 인증 | Google OAuth 2.0, JWT |
| 인프라 | AWS EC2, nginx, pm2, Let's Encrypt |
| 미디어 중계 | coturn (TURN), mediasoup (SFU) |

## 주요 기능

- **근접 화상**: 2D 맵에서 아바타가 가까워지면 WebRTC P2P 화상 자동 연결/해제
- **화면공유**: mediasoup SFU 기반 1:N 화면공유 (멘토 → 멘티 전체)
- **실시간 채팅**: Colyseus 브로드캐스트 + DB 저장
- **방 스위처**: 탭 새로고침 없이 룸 전환 (WebRTC 리소스 자동 정리)
- **관리 대시보드**: 실시간 접속 현황, 그룹/유저 관리, 접속 로그
- **멘티 접근 제어**: 미배정 멘티 차단, 그룹 외 룸 URL 직접 접근 차단

## 아키텍처

```
클라이언트 (React + PixiJS)
    │
    ├── REST API ──────────────────────► Express
    │                                       │
    ├── WebSocket (Colyseus) ─────────► ProximityRoom
    │       └── 위치 동기화, 채팅            │
    │           WebRTC 시그널 릴레이         ├── PostgreSQL (Prisma)
    │                                       └── mediasoup (SFU)
    └── WebRTC (P2P) ──────────────────► 브라우저 ↔ 브라우저
            └── 근접 화상/음성
```

**렉 제로 설계 원칙**: 한 클라이언트가 여러 룸 상태를 인지하되, 무거운 리소스(WebRTC, PixiJS)는 현재 입장한 룸에만 유지합니다.

## 모노레포 구조

```
apps/
  client/   — React 클라이언트 (@mentoring/client)
  server/   — Colyseus + Express 서버 (@mentoring/server)
packages/
  shared/   — 공유 타입 및 프로토콜 (@mentoring/shared)
infra/
  coturn/   — TURN 서버 설정
```

## 시작하기

### 필요 환경

- Node.js 22+
- pnpm 11+
- PostgreSQL 16+

### 환경변수 설정

```bash
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env
# 각 .env 파일에 실제 값 입력
```

### 개발 서버 실행

```bash
pnpm install
pnpm dev
```

### 검증

```bash
pnpm check   # 타입체크 + 린트 + 의존성 구조 검증
pnpm test    # 단위 테스트
```

## 배포

EC2 + nginx + pm2 기반. `https://like-zep.shop`에서 운영 중.

```bash
git pull
pnpm install
pnpm --filter @mentoring/shared build
pnpm --filter @mentoring/client build
pm2 restart likezep-server --update-env
pm2 restart likezep-client
```
