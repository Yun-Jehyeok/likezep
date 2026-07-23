# ZEP 대체 온라인 멘토링 플랫폼 — 프로젝트 구조 & 개발 환경 가이드

> claude-cli(Claude Code)가 최초 스캐폴딩 시 기준으로 삼는 문서. 하네스 엔지니어링 구조는 별도 문서(`멘토링플랫폼_하네스엔지니어링.md`) 참조.

## 1. 리포지토리 전략

**pnpm workspaces 기반 모노레포** 1개.

이유:
- shared 패키지(메시지 프로토콜 타입, Colyseus 스키마)를 클라이언트/서버가 공유해야 함 — 타입이 어긋나면 실시간 통신이 조용히 깨지는 프로젝트 특성상, 단일 리포에서 타입을 강제 공유하는 것이 안전
- Claude Code가 전체 컨텍스트(클라+서버+문서)를 한 리포에서 파악 가능 — 하네스 관점에서도 유리

## 2. 디렉토리 구조

```
mentoring-platform/
├── CLAUDE.md                     # Claude Code용 지도 (하네스 문서 참조)
├── .claude/
│   ├── settings.json             # 권한/훅 설정
│   ├── commands/                 # 슬래시 커맨드
│   └── agents/                   # 서브에이전트 정의
├── docs/                         # 모든 설계 문서 (버전 관리 대상)
│   ├── requirements.md           # 요구사항 정리 (기존 문서 이관)
│   ├── db-schema.md              # DB 스키마
│   ├── api-spec.md               # API 명세서
│   ├── architecture.md           # 아키텍처 결정 기록 + 의존성 그래프
│   └── plans/                    # 실행 계획 (PoC 1~3, MVP 단계별)
│       ├── poc-1-proximity-mesh.md
│       ├── poc-2-coturn.md
│       └── poc-3-mediasoup.md
├── packages/
│   └── shared/                   # 공유 타입/프로토콜
│       └── src/
│           ├── protocol/         # Colyseus 메시지 타입 (chat, move, webrtc-*, ss-*)
│           ├── schema/           # Colyseus State 스키마 (Player, RoomState)
│           └── types/            # 공통 도메인 타입 (Role, RoomType 등)
├── apps/
│   ├── server/                   # Colyseus + Express + mediasoup
│   │   └── src/
│   │       ├── config/           # 환경변수 로딩/검증 (zod)
│   │       ├── db/               # Prisma 클라이언트, 리포지토리 레이어
│   │       ├── services/         # 비즈니스 로직 (auth, group, stats)
│   │       ├── rooms/            # Colyseus Room 클래스 (MentoringRoom, GlobalAnnounceRoom)
│   │       │   └── logic/        # 근접 판정, 시그널링 릴레이 (Room에서 분리, 단위테스트 대상)
│   │       ├── media/            # mediasoup Worker/Router/Transport 관리
│   │       ├── api/              # Express 라우터 (auth, rooms, admin)
│   │       └── index.ts
│   └── client/                   # React + Vite SPA
│       └── src/
│           ├── core/             # API 클라이언트, colyseus 연결, WebRTC 관리자, 전역 store
│           │   ├── api/
│           │   ├── realtime/     # colyseus.js 래퍼
│           │   ├── webrtc/       # PeerConnection Map 관리 + 정리 함수 (핵심 모듈)
│           │   └── store/        # Zustand
│           ├── game/             # PixiJS 월드 (React와 분리된 순수 렌더링 계층)
│           │   ├── world/        # 맵 로딩(Tiled), 카메라
│           │   ├── entities/     # 아바타 (레이어 구조)
│           │   └── input/        # WASD 입력 (채팅 포커스 시 비활성)
│           ├── features/         # 화면 단위 기능
│           │   ├── auth/         # 로그인, 배정 대기
│           │   ├── lobby/
│           │   ├── room/         # 룸 화면 (PixiJS 캔버스 마운트 + 화상 타일 + 채팅)
│           │   ├── screenshare/
│           │   └── admin/        # 대시보드 3종
│           ├── App.tsx           # 라우팅
│           └── main.tsx
├── infra/
│   ├── docker-compose.dev.yml    # postgres + coturn (로컬 개발)
│   ├── docker-compose.prod.yml   # 전체 스택 (EC2 배포)
│   ├── coturn/turnserver.conf
│   └── Dockerfile.server
├── e2e/                          # Playwright 멀티클라이언트 시나리오
├── .github/workflows/ci.yml
├── pnpm-workspace.yaml
└── package.json
```

**구조 원칙**
- `client/game/`(PixiJS)은 React를 import하지 않음 — 렌더링 계층과 UI 계층의 분리를 디렉토리 수준에서 강제 (React 리렌더가 캔버스를 건드리는 사고 방지)
- `server/rooms/logic/`은 Colyseus에 의존하지 않는 순수 함수로 작성 — 근접 판정/히스테리시스 로직을 단위테스트 가능하게
- `packages/shared/protocol`이 클라-서버 간 유일한 메시지 계약 — 양쪽 모두 여기서만 메시지 타입을 import

## 3. 기술 버전 기준선

| 항목 | 버전 |
|---|---|
| Node.js | 22 LTS |
| 패키지 매니저 | pnpm 9+ |
| TypeScript | 5.x, `strict: true` (전 패키지) |
| React | 18+ |
| Vite | 6+ |
| Colyseus | 0.16+ |
| PixiJS | 8+ |
| mediasoup | 3.x |
| Prisma | 6+ |
| PostgreSQL | 16 |

## 4. 로컬 개발 환경 세팅

```bash
# 1. 의존성
pnpm install

# 2. 인프라 (postgres + coturn)
docker compose -f infra/docker-compose.dev.yml up -d

# 3. 환경변수
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env

# 4. DB 마이그레이션 + 시드 (공용 공간 룸 2개 생성)
pnpm --filter server db:migrate
pnpm --filter server db:seed

# 5. 개발 서버 (서버 + 클라 동시 기동)
pnpm dev
```

**환경변수 (server/.env.example)**
```
DATABASE_URL=postgresql://dev:dev@localhost:5432/mentoring
JWT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_EMAIL=            # 이 이메일로 첫 로그인한 계정이 admin
TURN_URL=turn:localhost:3478
TURN_SECRET=            # coturn REST API 방식 임시 credential용
MEDIASOUP_ANNOUNCED_IP= # 로컬은 127.0.0.1, EC2는 퍼블릭 IP
```

- 환경변수는 `server/config`에서 zod로 기동 시 검증 — 누락 시 서버가 명확한 에러와 함께 즉시 종료 (조용한 오동작 방지)

## 5. 스크립트 규약 (루트 package.json)

| 스크립트 | 동작 |
|---|---|
| `pnpm dev` | 서버 + 클라이언트 동시 기동 |
| `pnpm check` | typecheck + lint + 구조 검증(dependency-cruiser) + 단위테스트 — **CI와 동일, Claude Code 훅에서도 사용** |
| `pnpm test` | vitest 단위테스트 |
| `pnpm test:e2e` | Playwright 멀티클라이언트 E2E |
| `pnpm db:migrate` / `db:seed` | Prisma 마이그레이션/시드 |

## 6. CI (GitHub Actions)

PR마다: `pnpm check` → `pnpm test:e2e`(핵심 시나리오만) → Docker 빌드 검증.
main 머지 시: ECR 푸시 → EC2 배포 (요구사항 문서 10장 참조).
