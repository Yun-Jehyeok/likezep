# MVP 개발 계획

**상태**: Phase 6 완료
**시작**: 2026-07-27
**Phase 1~5 완료**: 2026-07-27
**Phase 6 완료**: 2026-07-28

## 현재 완료된 것 (UI 스켈레톤)

React Router v6 + Zustand auth store + Tailwind CSS 기반 5개 화면 목업 (mock data, 커밋 미완료):

| 화면 | 파일 | 상태 |
|---|---|---|
| 로그인 | `features/auth/LoginPage.tsx` | ✅ UI 완료 (Google OAuth 버튼 UI only + 개발용 빠른로그인) |
| 배정 대기 | `features/auth/WaitingPage.tsx` | ✅ UI 완료 |
| 로비 | `features/lobby/LobbyPage.tsx` | ✅ UI 완료 (룸 카드 그리드, 역할별 필터 mock) |
| 룸 화면 | `features/room/RoomPage.tsx` | ✅ UI 완료 (PixiJS placeholder, 채팅 패널, 하단 컨트롤 바) |
| 관리 대시보드 | `features/admin/AdminPage.tsx` | ✅ UI 완료 (실시간현황/그룹관리/접속로그 탭) |

공통 인프라:
- `apps/client/src/app/store.ts` — Zustand auth store (user: id/name/email/role/groupId)
- `apps/client/src/app/router.tsx` — RequireAuth, RequireAdmin guard 컴포넌트
- `apps/client/src/index.css` — Tailwind CSS v4 import
- `apps/client/vite.config.ts` — @tailwindcss/vite 플러그인 추가

---

## MVP 개발 순서

UI-first 전략: mock data → 실제 API/실시간 연결 순서로 진행.

### Phase 1: DB + Auth (백엔드 기반) ✅ `3bd8dbb`

목표: 실제 유저 데이터로 로그인/로비가 동작하게.

| 작업 | 파일 | 비고 |
|---|---|---|
| PostgreSQL Docker 컨테이너 설정 | `infra/docker-compose.dev.yml` | |
| Prisma 스키마 작성 | `apps/server/src/db/schema.prisma` | docs/db-schema.md 기반 |
| 마이그레이션 + 시드 | `apps/server/src/db/seed.ts` | 공용 룸 2개 (광장, 회의실) |
| Google OAuth 연동 | `apps/server/src/api/auth.ts` | `POST /api/auth/google` |
| JWT 발급/검증 미들웨어 | `apps/server/src/api/middleware/auth.ts` | |
| `GET /api/me` | `apps/server/src/api/auth.ts` | 배정 대기 폴링용 |
| 클라이언트 Google OAuth 버튼 연결 | `features/auth/LoginPage.tsx` | mock 제거 |

### Phase 2: 룸 목록 + Colyseus 연동 ✅ `a4dfede`

목표: 로비에서 실제 룸 데이터 표시, 룸 입장 시 Colyseus 연결.

| 작업 | 파일 | 비고 |
|---|---|---|
| `GET /api/rooms` | `apps/server/src/api/rooms.ts` | role/groupId 기반 필터링 |
| 로비 API 연결 | `features/lobby/LobbyPage.tsx` | mock 제거 |
| Colyseus auth 연동 | `apps/server/src/rooms/ProximityRoom.ts` | `onAuth` JWT 검증 + 권한 체크 |
| 룸 입장 JWT 전달 | `core/realtime/colyseusClient.ts` | `joinById(roomId, { token })` |
| access_logs 기록 | `ProximityRoom.ts` | onJoin/onLeave → DB INSERT |

### Phase 3: PixiJS 맵 + 아바타 ✅ `79c926b`

목표: 룸 화면에 실제 맵과 이동 가능한 아바타.

| 작업 | 파일 | 비고 |
|---|---|---|
| PixiJS Application 마운트 | `features/room/RoomPage.tsx` | useRef로 캔버스 마운트 |
| 맵 로딩 (Tiled) | `game/world/mapLoader.ts` | 초기엔 단순 배경으로 시작 가능 |
| 아바타 엔티티 | `game/entities/Avatar.ts` | 고정 스프라이트 (1단계) |
| WASD 입력 | `game/input/keyboard.ts` | 채팅 포커스 시 비활성 |
| 서버 위치 동기화 연결 | `ProximityRoom.ts` ↔ `RoomPage` | 기존 PoC 1 로직 재사용 |

### Phase 4: 근접 화상 + 채팅 ✅ `e517807`

목표: 룸 화면에서 근접 인원과 화상 자동 연결, 채팅 동작.

| 작업 | 파일 | 비고 |
|---|---|---|
| 근접 화상 타일 UI | `features/room/RoomPage.tsx` | VideoGrid PoC 컴포넌트 통합 |
| 근접 화상 로직 연결 | `core/webrtc/peerManager.ts` | PoC 1 로직 그대로 재사용 |
| 채팅 UI 연결 | `features/room/RoomPage.tsx` | Colyseus `chat` 메시지 |
| `GET /api/rooms/:roomId/chat` | `apps/server/src/api/rooms.ts` | 입장 시 최근 50개 로드 |
| 채팅 DB 저장 | `ProximityRoom.ts` | 브로드캐스트 + 비동기 INSERT |

### Phase 5: 화면공유 + 방 스위처 ✅ `71d870d`

목표: 멘토/Admin의 화면공유, 방 전환 기능.

| 작업 | 파일 | 비고 |
|---|---|---|
| 화면공유 UI 통합 | `features/room/RoomPage.tsx` | ScreenShareButton/View PoC 컴포넌트 재사용 |
| 화면공유 시청 오버레이 | `features/room/ScreenShareOverlay.tsx` | |
| 방 스위처 드롭다운 | `features/room/RoomSwitcher.tsx` | 멘토/Admin 전용 |
| 방 전환 리소스 정리 | `core/webrtc/cleanup.ts` | cleanupAll + Colyseus leave → 새 룸 join |

### Phase 6: 관리 대시보드 연동 ✅ (Phase 7 커밋 예정)

목표: AdminPage mock → 실제 API 데이터.

| 작업 | 파일 | 비고 |
|---|---|---|
| `GET /api/admin/status` | `apps/server/src/api/admin.ts` | Colyseus room listing + access_logs 연동 |
| `GET /api/admin/users` | `apps/server/src/api/admin.ts` | ✅ |
| `GET /api/admin/groups` | `apps/server/src/api/admin.ts` | ✅ (UI 드롭다운용 추가) |
| `PATCH /api/admin/users/:id` | `apps/server/src/api/admin.ts` | ✅ 역할/그룹 변경 |
| `POST /api/admin/groups` | `apps/server/src/api/admin.ts` | ✅ 그룹 + 프라이빗 룸 자동 생성 |
| `GET /api/admin/logs` | `apps/server/src/api/admin.ts` | ✅ access_logs 조회 |
| AdminPage API 연결 | `features/admin/AdminPage.tsx` | ✅ mock 제거, 인라인 역할/그룹 편집 추가 |

---

## 파일럿 전 체크리스트

- [x] Google OAuth 실제 계정으로 로그인 가능 (`e46f8c6` — 도메인 + HTTPS + Google Cloud Console 설정 완료, 2026-07-30)
- [x] 멘티 최초 로그인 → 배정 대기 화면 → 관리자가 그룹 배정 → 로비 자동 진입 (`8c572f6`)
- [x] 멘티가 타 그룹 룸 URL 직접 입력 시 차단 (`8c572f6` — RequireAssigned + ProximityRoom DB 권한 체크)
- [ ] 멘토/Admin이 전체 룸 접근 가능 (코드 완료, 실 테스트 필요)
- [ ] 근접 화상: 3명 이상 테스트
- [ ] 화면공유: 멘토 1명 → 멘티 5명 이상 시청
- [ ] 방 스위처: 멘토가 탭 새로고침 없이 룸 전환
- [ ] 관리 대시보드: 실시간 접속 현황 폴링 (코드 완료, 실 테스트 필요)
- [x] 관리 대시보드: 그룹 수정/삭제 기능 (`e46f8c6` — PATCH/DELETE /api/admin/groups/:id)
- [x] `pnpm check` 통과 (2026-07-30)
- [ ] EC2 배포 후 실제 네트워크에서 TURN 릴레이 확인
- [ ] mock 로그인 제거 (파일럿 직전)

### 도메인 + HTTPS 설정 완료 (2026-07-30)

- **도메인**: `like-zep.shop` (www 포함)
- **EC2 퍼블릭 IP**: `13.125.127.128`
- **HTTPS**: Let's Encrypt certbot, 인증서 위치 `/etc/letsencrypt/live/like-zep.shop/`
- **nginx**: `/etc/nginx/sites-available/likezep`
- **접속 URL**: `https://like-zep.shop`

### nginx 라우팅 구조 (중요)

Colyseus WebSocket 연결이 클라이언트(3000)가 아닌 서버(2567)로 가야 하므로 `map` 지시어로 분기:

```nginx
map $http_upgrade $game_upstream {
    "websocket"  http://127.0.0.1:2567;
    default      http://127.0.0.1:3000;
}
```

- `/matchmake/*` → 2567 (Colyseus HTTP 매치메이킹)
- `/api/*`, `/ms/*`, `/turn-credentials` → 2567 (REST + mediasoup + TURN)
- `/` HTTP → 3000 (React 클라이언트), WebSocket → 2567 (Colyseus)

**주의**: `proxy_pass`에 변수 사용 시 `localhost` 대신 `127.0.0.1` 필수 (DNS resolver 미설정 에러 방지)

### PostgreSQL EC2 직접 설치 (Docker 없음)

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER dev WITH PASSWORD 'dev';"
sudo -u postgres psql -c "CREATE DATABASE mentoring OWNER dev;"
pnpm --filter @mentoring/server exec prisma generate
pnpm --filter @mentoring/server exec prisma migrate deploy
pnpm --filter @mentoring/server exec prisma db seed
```

### Google Cloud Console 설정

- **승인된 JavaScript 출처**: `https://like-zep.shop`, `https://www.like-zep.shop`
- **승인된 리디렉션 URI**: `https://like-zep.shop/api/auth/google/callback`

### EC2 .env 현황 (2026-07-30 기준)

- `apps/server/.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL`, `JWT_SECRET`, `DATABASE_URL=postgresql://dev:dev@localhost:5432/mentoring`, TURN/mediasoup 설정 완료
- `apps/client/.env`: `VITE_GOOGLE_CLIENT_ID`, `VITE_API_URL=https://like-zep.shop`, `VITE_SERVER_URL=https://like-zep.shop` 설정 완료

---

## Phase 1~5 완료 중 발견한 버그/결정사항

- **Colyseus 예약어**: `filterBy(["roomId"])` 금지. `roomId`는 Colyseus 내부 옵션명 → `dbRoomId` 사용
- **방 전환 상태 초기화**: `occupants`, `messages`, `remotePeers`는 effect 재실행 시 명시적으로 초기화 필요
- **WebGL 재초기화**: canvas에 `key={roomId}` → 방 전환 시 React가 새 DOM 노드 생성, 컨텍스트 충돌 방지
- **WebRTC renegotiation**: offerer/answerer 구분 없이 양방향 offer 생성 허용. `onWebRtcOffer`에서 기존 PC 있으면 재협상으로 처리
- **카메라 후발 활성화**: 근접 연결 후 카메라 켜도 `addTrackToPeer` + offer 재전송으로 영상 전송 가능
- **onPlayerLeave 중복 방어**: `playerNamesRef.has(sessionId)` 체크로 중복 호출 시 early return

## 기술 결정 사항

- **UI-first**: mock data로 UI 완성 → API 연결 순서 (DB 없이 화면 먼저 검증)
- **PoC 코드 재사용**: `proximity.ts`, `peerManager.ts`, `cleanup.ts`, `useScreenShare.ts` — MVP에서 그대로 사용, 리팩토링은 필요할 때만
- **브랜치 전략**: MVP 이후 feature branch → main merge (CLAUDE.md 참조)
- **commit 단위**: Phase 완료마다 커밋 (Phase 1 완료 = 1커밋)
