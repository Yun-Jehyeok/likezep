# 아키텍처 결정 기록

> 계층 구조, 의존성 규칙, 좋은/나쁜 코드 패턴 기준서.
> harness.md의 "엔트로피 관리" 섹션에서 언급한 문서. 하네스 변경 이력도 여기서 관리.

---

## 1. 계층 구조

```
[packages/shared]
  └── protocol/      메시지 타입 (ClientToServer, ServerToClient)
  └── schema/        Colyseus State 인터페이스
  └── types/         공통 도메인 타입 (Role 등)

[apps/server]
  config/            환경변수 로딩 (zod 검증)
  db/                Prisma 클라이언트 + 리포지토리 함수
  services/          비즈니스 로직 (auth, group, stats)
  rooms/
    logic/           근접 판정 등 순수 함수 (Colyseus 미의존)
    schema/          Colyseus State 스키마
    ProximityRoom.ts Colyseus Room 클래스
  mediasoup/         Worker/Router/Transport/Express 라우터
  api/               Express REST 라우터
  turn/              TURN credential 생성
  index.ts           진입점

[apps/client]
  core/
    realtime/        Colyseus 클라이언트 래퍼
    webrtc/          PeerConnection 관리 + 정리 함수
    store/           Zustand (게임 상태)
    api/             REST API 클라이언트
  game/              PixiJS 렌더링 계층 (React 미의존)
    world/           맵 로딩
    entities/        아바타
    input/           키보드 입력
  features/          화면 단위 React 컴포넌트
    auth/            LoginPage, WaitingPage
    lobby/           LobbyPage
    room/            RoomPage
    screenshare/     ScreenShareButton, ScreenShareView, useScreenShare
    admin/           AdminPage
    poc/             PoC 검증용 (GameScreen, GameCanvas, VideoGrid)
  app/
    store.ts         Zustand auth store
    router.tsx       React Router (RequireAuth, RequireAdmin)
```

### 의존 방향 (아래로만)

```
shared → (없음)
server: config → db → services → rooms/media → api
client: core → game → features → app
```

역방향 의존 금지. `game/`이 `features/`를 알면 안 된다.

---

## 2. 절대 규칙 + 이유

### 2-1. `client/game/`은 React를 import하지 않는다

**이유**: React 리렌더가 requestAnimationFrame 루프와 충돌하면 캔버스가 깜빡이거나 초기화됨.  
PixiJS 객체는 `game/` 계층에서 생성, React 컴포넌트는 캔버스 element를 마운트하는 역할만 담당.

```ts
// ❌ 금지 — game/ 안에서 React import
import { useEffect } from "react";                // game/world/mapLoader.ts 에서

// ✅ 올바른 패턴 — game/ 은 순수 클래스/함수
export class World {
  init(canvas: HTMLCanvasElement) { ... }       // React에서 ref로 canvas를 넘겨줌
}
```

dependency-cruiser `game-no-react` 룰이 CI에서 강제.

---

### 2-2. 클라-서버 메시지 타입은 `packages/shared/protocol`에서만

**이유**: 양쪽에 중복 정의되면 타입이 어긋났을 때 런타임에서야 발견됨 (컴파일 통과하는 버그).

```ts
// ❌ 금지 — 서버 로컬에 타입 재정의
interface ProximityConnect { peerId: string }   // apps/server/src/rooms/ProximityRoom.ts

// ✅ 올바른 패턴
import type { ProximityConnectPayload } from "@likezep/shared/protocol";
```

dependency-cruiser `protocol-single-source` 룰이 CI에서 강제.

---

### 2-3. WebRTC 연결 해제는 `core/webrtc/cleanup.ts`의 함수로만

**이유**: `pc.close()` 단독 호출 시 video element와 Map 항목이 남아 메모리 누수 발생. PoC 1 설계 단계에서 확인한 핵심 리스크.

```ts
// ❌ 금지 — 직접 close
peerConnection.close();

// ✅ 올바른 패턴 — cleanup.ts 경유
import { cleanupPeer } from "@/core/webrtc/cleanup";
cleanupPeer(peerId);   // pc.close() + video 제거 + Map 삭제 원자적 처리
```

ESLint `no-raw-peerconnection-close` 커스텀 룰 (향후 추가 예정).

---

### 2-4. `server/rooms/logic/`은 Colyseus를 import하지 않는다

**이유**: 근접 판정 로직을 순수 함수로 유지해야 vitest 단위테스트 가능. Colyseus Room 인스턴스 없이도 테스트 가능한 구조.

```ts
// ❌ 금지 — logic/에서 Colyseus import
import { Room } from "@colyseus/core";           // proximity.ts 에서

// ✅ 올바른 패턴 — Room이 logic을 호출
// proximity.ts: 순수 함수, Map<string, Point> 입력 → { toConnect, toDisconnect } 출력
// ProximityRoom.ts: logic 결과를 받아 Colyseus 메시지 발송
```

---

### 2-5. DB 접근은 `server/db/` 리포지토리를 통해서만

**이유**: 서비스에서 Prisma 직접 호출 시 쿼리가 여러 곳에 흩어져 스키마 변경 영향 범위 파악이 어려워짐.

```ts
// ❌ 금지 — 서비스에서 Prisma 직접 호출
import { prisma } from "../db/client";
const user = await prisma.user.findUnique(...);   // auth.ts 서비스에서

// ✅ 올바른 패턴
import { findUserByGoogleId } from "../db/userRepository";
const user = await findUserByGoogleId(googleId);
```

---

## 3. PoC 코드 재사용 가이드

PoC 1~3에서 검증된 코드를 MVP에서 재사용할 때 주의할 것:

| PoC 파일 | MVP 사용 방식 | 변경 필요 사항 |
|---|---|---|
| `core/webrtc/cleanup.ts` | 그대로 재사용 | 없음 (이미 MVP 구조) |
| `core/webrtc/peerManager.ts` | 그대로 재사용 | 없음 |
| `core/webrtc/iceServers.ts` | 그대로 재사용 | 없음 |
| `core/realtime/colyseusClient.ts` | MVP용으로 확장 | JWT token 파라미터 추가 |
| `rooms/ProximityRoom.ts` | 확장 | onAuth JWT 검증 추가, DB 로깅 추가 |
| `features/screenshare/useScreenShare.ts` | 그대로 재사용 | 없음 |
| `features/poc/GameCanvas.tsx` | `game/` 계층으로 이동 | PixiJS + Tiled 맵으로 교체 |
| `features/poc/VideoGrid.tsx` | `features/room/RoomPage.tsx`에 통합 | 위치/레이아웃 조정 |

---

## 4. 하네스 변경 이력

> Claude가 저지른 실수와 그에 대응해 추가한 룰 기록. 같은 실수 재발 시 이 섹션을 참조.

| 날짜 | 발생한 실수 | 추가한 대응 |
|---|---|---|
| (이력 없음) | — | — |

> 실수 발생 시 이 테이블에 행 추가 + 대응 룰(lint/테스트/훅) 구현.

---

## 5. 주요 기술 결정 이유

| 결정 | 이유 |
|---|---|
| Colyseus 선택 | 멀티룸 구조 네이티브 지원, Redis 확장 가능, 스키마 기반 상태 동기화 |
| mediasoup (SFU) 화면공유 | 화면공유는 P2P 불가 (발표자 업로드 N회 = 대역폭 N배). SFU로 서버 1회 수신, N회 분배 |
| WebRTC Mesh 근접 화상 | 룸 전체 인원이 아닌 근접 인원과만 연결 → 총 인원 증가해도 개인 부하 고정 |
| Tailwind CSS | PixiJS 캔버스와 HTML UI가 공존하는 구조에서 CSS-in-JS보다 적합. 빌드 크기 최소 |
| Zustand | PixiJS 렌더링 루프와 React 컴포넌트가 동일 상태를 구독해야 함. Redux보다 가볍고 비동기 처리 단순 |
| Prisma | TypeScript 스키마 → 타입 자동 생성. Colyseus/React 전체 TS 스택과 궁합 |
