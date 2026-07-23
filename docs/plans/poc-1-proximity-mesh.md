# PoC 1 — 근접 감지 + WebRTC Mesh 연결/해제 검증

## 목표

아바타가 가까워지면 화상이 자동으로 붙고, 멀어지거나 방을 나가면 리소스 누수 없이 깔끔하게 끊기는지 검증.  
렉 문제 해결의 핵심 가설("무거운 리소스는 근접 인원과만, 그리고 언제나 확실히 정리된다")을 코드로 증명하는 단계.

## Definition of Done

| # | 검증 항목 | 방법 |
|---|---|---|
| 1 | Colyseus 방에 2명 이상 입장 시 아바타 위치가 실시간 동기화됨 | 브라우저 2탭 열어 아바타 이동 확인 |
| 2 | 거리 < 150px 진입 시 WebRTC 연결이 자동으로 맺어지고 화상이 뜸 | 카메라 영상 타일 노출 확인 |
| 3 | 거리 ≥ 180px 이탈 시 연결이 정리됨 — 메모리 누수 없이 | Chrome DevTools Memory 탭 힙 스냅샷 비교 |
| 4 | 방 나가기(탭 닫기 포함) 시 그 방의 모든 WebRTC 연결이 즉시 정리됨 | 상대방 브라우저에서 화상 타일 사라짐 확인 |
| 5 | 3명 동시 근접 시 3-way mesh가 꼬임 없이 동작함 | 탭 3개로 직접 확인 |

## 최소 구현 범위 (PoC 한정)

- DB 없음 — Colyseus 인메모리 상태만 사용
- 인증 없음 — 이름 입력 후 바로 입장
- 방 1개만 (`"poc-room"` 고정 이름)
- 렌더링: PixiJS 없이 plain HTML5 Canvas (사각형 아바타)
- 이동: WASD / 방향키

## 현재 상태 (착수 기준선)

완료된 것:
- `packages/shared/src/protocol/messages.ts` — 메시지 타입 정의 완료
- `packages/shared/src/schema/state.ts` — PlayerData / RoomStateData 인터페이스 완료
- `apps/server/src/index.ts` — Express 기본 셸만 존재 (Colyseus 미탑재)
- `apps/client/src/main.tsx` — Vite 진입점만 존재
- 모노레포 스캐폴딩, lint/typecheck 파이프라인 완료

만들어야 하는 것 — 아래 Phase별로 순서대로.

---

## Phase 0: 의존성 추가

### 서버 (`apps/server/package.json`)

```json
"dependencies"에 추가:
  "@colyseus/core": "^0.16"
  "@colyseus/schema": "^3.0"
  "@colyseus/ws-transport": "^0.16"
```

> `@colyseus/uwebsockets-transport`는 네이티브 바이너리라 Windows 로컬 개발에서 빌드 실패 가능.  
> 개발 중에는 `ws-transport` 사용, EC2 프로덕션에서 uws로 교체 검토.

### 클라이언트 (`apps/client/package.json`)

```json
"dependencies"에 추가:
  "colyseus.js": "^0.16"
```

설치:
```bash
pnpm install
```

---

## Phase 1: 서버 — Colyseus Room

### 1-1. 근접 판정 순수 함수 (`apps/server/src/rooms/logic/proximity.ts`)

**이 파일은 Colyseus를 import하지 않는다** (CLAUDE.md 절대 규칙).

```
export interface Point { x: number; y: number }
export interface PeerPair { a: string; b: string }  // a < b 보장

export function computeProximityChanges(params: {
  players: Map<string, Point>
  connectedPairs: Set<string>    // 현재 연결된 쌍 ("a:b", a < b)
  connectThreshold: number       // 150
  disconnectThreshold: number    // 180 (히스테리시스)
}): { toConnect: PeerPair[]; toDisconnect: PeerPair[] }
```

구현 핵심:
- 모든 플레이어 쌍을 순회해 유클리드 거리 계산
- 미연결 + 거리 < connectThreshold → `toConnect`에 추가
- 연결됨 + 거리 ≥ disconnectThreshold → `toDisconnect`에 추가
- 연결됨 + 거리 < disconnectThreshold → 유지 (히스테리시스: disconnectThreshold > connectThreshold이므로 경계 진동 없음)
- 쌍 인코딩: `[a, b].sort().join(":")` — 항상 lexicographic 오름차순으로 중복 방지

### 1-2. 근접 판정 단위테스트 (`apps/server/src/rooms/logic/proximity.test.ts`)

vitest로 작성. 커버해야 할 케이스:
- 2명, 가까움 → toConnect 반환
- 2명, 이미 연결됨, 멀어짐 → toDisconnect 반환
- 2명, 이미 연결됨, connectThreshold < 거리 < disconnectThreshold → 변화 없음 (히스테리시스 검증)
- 3명 동시 근접 → 3쌍 모두 toConnect
- 플레이어 1명 → 빈 결과

### 1-3. Colyseus Schema (`apps/server/src/rooms/schema/RoomState.ts`)

`@colyseus/schema` 데코레이터 사용. shared의 인터페이스와 별개로 서버 전용.

```ts
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("number") x = 400;
  @type("number") y = 300;
}

export class ProximityRoomState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
```

### 1-4. Colyseus Room 클래스 (`apps/server/src/rooms/ProximityRoom.ts`)

`@colyseus/core`의 `Room<ProximityRoomState>` 상속.

구현 포인트:
- `onJoin`: Player 생성, 중간 입장 플레이어에게 현재 state는 schema sync가 자동 처리
- `onLeave`: 플레이어 제거, 해당 플레이어와 연결된 모든 쌍을 `connectedPairs`에서 제거하고 상대 클라이언트에 `proximity-disconnect` 전송
- `onMessage("move", ...)`: x/y 업데이트, 이동 속도 sanity check (1tick당 최대 이동량 제한, PoC에서는 느슨하게 설정)
- `tick` 루프 (100ms): `computeProximityChanges` 호출 → connect/disconnect 메시지 발송
  - `proximity-connect` payload: `{ peerId, isOfferer: clientId < peerId }` (id 사전순 작은 쪽이 offerer)
  - `proximity-disconnect` payload: `{ peerId }`
- WebRTC 시그널링 릴레이 (`webrtc-offer`, `webrtc-answer`, `webrtc-ice`): `payload.to` 기준으로 해당 클라이언트에만 포워딩
- `onCreate`: `this.setSimulationInterval(this.tick.bind(this), 100)` 으로 tick 등록

메시지 타입은 `@mentoring/shared`의 `ClientToServerMessages`, `ServerToClientMessages` 에서 import.

내부 `connectedPairs: Set<string>` — 룸 인스턴스 상태로 유지 (Colyseus state에 노출할 필요 없음).

### 1-5. 서버 진입점 수정 (`apps/server/src/index.ts`)

```ts
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { ProximityRoom } from "./rooms/ProximityRoom.js";

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));

const gameServer = new Server({
  transport: new WebSocketTransport({ server: app as any }),
});
gameServer.define("poc-room", ProximityRoom, { maxClients: 20 });

const PORT = Number(process.env.PORT ?? 2567);
gameServer.listen(PORT).then(() => {
  console.log(`[server] ws://localhost:${PORT}`);
});
```

---

## Phase 2: 클라이언트 — 핵심 모듈

### 2-1. WebRTC 정리 함수 (`apps/client/src/core/webrtc/cleanup.ts`)

**CLAUDE.md 절대 규칙**: 모든 WebRTC 연결 해제는 이 파일의 함수로만 처리.

```ts
const peers = new Map<string, {
  pc: RTCPeerConnection;
  videoEl: HTMLVideoElement | null;
}>();

export function getPeer(peerId: string) { return peers.get(peerId); }
export function setPeer(peerId: string, pc: RTCPeerConnection, videoEl: HTMLVideoElement | null) {
  peers.set(peerId, { pc, videoEl });
}

export function cleanupPeer(peerId: string): void {
  const entry = peers.get(peerId);
  if (!entry) return;
  entry.pc.close();
  if (entry.videoEl) {
    entry.videoEl.srcObject = null;
    entry.videoEl.remove();
  }
  peers.delete(peerId);
}

export function cleanupAllPeers(): void {
  for (const peerId of peers.keys()) cleanupPeer(peerId);
}

export function activePeerIds(): string[] {
  return [...peers.keys()];
}
```

### 2-2. WebRTC 연결 관리 (`apps/client/src/core/webrtc/peerManager.ts`)

```
책임: offer/answer/ICE 협상 처리, 미디어 스트림 연결
의존: cleanup.ts (연결 해제 위임), Colyseus 클라이언트 (시그널링 메시지 송신)

export function initPeerAsOfferer(
  peerId: string,
  localStream: MediaStream,
  sendSignal: (type: string, payload: object) => void,
  onRemoteStream: (peerId: string, stream: MediaStream) => void,
): void

export function initPeerAsAnswerer(
  peerId: string,
  localStream: MediaStream,
  offer: RTCSessionDescriptionInit,
  sendSignal: (type: string, payload: object) => void,
  onRemoteStream: (peerId: string, stream: MediaStream) => void,
): void

export function handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): void
export function handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void
```

RTCPeerConnection 생성 시 `iceServers`에 public STUN (`stun:stun.l.google.com:19302`) 등록.  
연결이 맺어지면 `setPeer(peerId, pc, null)`로 cleanup.ts에 등록.  
`pc.ontrack`에서 remoteStream 추출 → `onRemoteStream` 콜백 호출.

### 2-3. Colyseus 클라이언트 래퍼 (`apps/client/src/core/realtime/colyseusClient.ts`)

```
export interface RoomCallbacks {
  onPlayerJoin(id: string, data: PlayerData): void;
  onPlayerLeave(id: string): void;
  onPlayerMove(id: string, x: number, y: number): void;
  onProximityConnect(peerId: string, isOfferer: boolean): void;
  onProximityDisconnect(peerId: string): void;
  onWebRtcSignal(type: string, payload: object): void;
}

export async function joinPocRoom(
  playerName: string,
  callbacks: RoomCallbacks,
): Promise<Room>
```

내부:
- `new Client("ws://localhost:2567")`
- `client.joinOrCreate("poc-room", { name: playerName })`
- `room.state.players.onAdd`, `onRemove`, `onChange` 구독
- `room.onMessage("proximity-connect", ...)` 등 등록

반환된 `Room` 객체는 GameScreen이 보관해 move/signal 메시지 전송에 사용.

---

## Phase 3: 클라이언트 — UI

### 3-1. Zustand store (`apps/client/src/core/store/gameStore.ts`)

PoC 1 한정 최소 상태:

```ts
interface GameState {
  myId: string | null;
  players: Map<string, { id: string; name: string; x: number; y: number }>;
  remoteStreams: Map<string, MediaStream>;
  setMyId(id: string): void;
  upsertPlayer(id: string, data: ...): void;
  removePlayer(id: string): void;
  setRemoteStream(peerId: string, stream: MediaStream): void;
  removeRemoteStream(peerId: string): void;
}
```

### 3-2. 이름 입력 화면 (`apps/client/src/features/poc/JoinScreen.tsx`)

- 이름 입력 `<input>` + 입장 버튼
- 제출 시 → `GameScreen`으로 전환 (props로 name 전달)

### 3-3. 게임 캔버스 (`apps/client/src/features/poc/GameCanvas.tsx`)

- `useRef<HTMLCanvasElement>` + `useEffect`로 requestAnimationFrame 루프
- store에서 players 구독, 매 프레임 캔버스 clear → 플레이어 사각형 + 이름 텍스트 그리기
- 내 플레이어는 파란색, 타인은 회색
- keydown 핸들러: WASD/Arrow → store 업데이트 + `room.send("move", { x, y })`
  - 이동 속도: 4px/프레임 (requestAnimationFrame 기준)

### 3-4. 화상 타일 그리드 (`apps/client/src/features/poc/VideoGrid.tsx`)

- store의 `remoteStreams` 구독
- 각 스트림마다 `<video autoPlay playsInline>` 렌더링
- 위치: 캔버스 우상단에 절대 위치, 최대 5개 (PoC 제약)

### 3-5. 게임 화면 (`apps/client/src/features/poc/GameScreen.tsx`)

조립 컴포넌트. `playerName` prop을 받아:

1. `useEffect` 마운트 시:
   - `navigator.mediaDevices.getUserMedia({ video: true, audio: true })` 로 로컬 스트림 확보
   - `joinPocRoom(playerName, callbacks)` 호출
   - `callbacks` 안에서:
     - `onProximityConnect`: peerManager.initPeerAsOfferer / initPeerAsAnswerer 분기 호출
     - `onProximityDisconnect`: `cleanupPeer(peerId)` + store에서 remoteStream 제거
     - `onWebRtcSignal`: peerManager.handleAnswer / handleIceCandidate 호출
     - `onRemoteStream` 콜백: store.setRemoteStream
   - `myId` = `room.sessionId` → store 저장
2. `useEffect` 언마운트 시:
   - `cleanupAllPeers()` 호출
   - `room.leave()`
3. 렌더링: `<GameCanvas>` + `<VideoGrid>` 레이어 조합

### 3-6. 앱 라우팅 (`apps/client/src/App.tsx`)

```tsx
const [playerName, setPlayerName] = useState<string | null>(null);
return playerName
  ? <GameScreen playerName={playerName} />
  : <JoinScreen onJoin={setPlayerName} />;
```

---

## Phase 4: 통합 실행 및 검증

### 실행 절차

```bash
# 서버
cd apps/server && pnpm dev

# 클라이언트 (별도 터미널)
cd apps/client && pnpm dev
```

### 검증 시나리오 체크리스트

- [ ] 시나리오 1: 탭 2개에서 이름 입력 후 입장 → 양쪽 캔버스에 두 아바타 위치 동기화
- [ ] 시나리오 2: 한 아바타를 다른 아바타 쪽으로 이동 → 150px 이내 진입 시 양쪽에 화상 타일 등장
- [ ] 시나리오 3: 아바타 멀리 이동 → 180px 이탈 시 화상 타일 사라짐
- [ ] 시나리오 4 (히스테리시스): 150~180px 사이에서 왔다갔다 → 화상이 깜빡이지 않음
- [ ] 시나리오 5: 탭 3개로 3-way mesh → 3명 모두 서로의 화상 표시
- [ ] 시나리오 6: 탭 강제 종료 → 나머지 클라이언트에서 해당 아바타와 화상 타일 사라짐
- [ ] 메모리 검증: 연결/해제를 5회 반복 → Chrome Memory 탭 힙 스냅샷에서 RTCPeerConnection 잔여 없음

### pnpm check 통과 확인

```bash
pnpm check   # typecheck + lint + dependency-cruiser + vitest (proximity.test.ts 포함)
```

---

## 파일 생성 순서 요약

```
1. pnpm install (Phase 0 의존성 추가 후)
2. apps/server/src/rooms/logic/proximity.ts
3. apps/server/src/rooms/logic/proximity.test.ts
4. apps/server/src/rooms/schema/RoomState.ts
5. apps/server/src/rooms/ProximityRoom.ts
6. apps/server/src/index.ts (수정)
7. apps/client/src/core/webrtc/cleanup.ts
8. apps/client/src/core/webrtc/peerManager.ts
9. apps/client/src/core/realtime/colyseusClient.ts
10. apps/client/src/core/store/gameStore.ts
11. apps/client/src/features/poc/JoinScreen.tsx
12. apps/client/src/features/poc/GameCanvas.tsx
13. apps/client/src/features/poc/VideoGrid.tsx
14. apps/client/src/features/poc/GameScreen.tsx
15. apps/client/src/App.tsx (수정)
```

---

## 주의사항 / 삽질 방지

| 항목 | 내용 |
|---|---|
| Windows + uWebSockets | `@colyseus/uwebsockets-transport`는 네이티브 바이너리라 Windows 빌드에서 실패할 수 있음. `@colyseus/ws-transport` 사용. |
| CORS | 클라이언트(`:5173`)가 서버(`:2567`)에 접속 시 CORS 에러 가능. `express-cors` 또는 `gameServer.transport`의 cors 옵션 설정 필요. |
| getUserMedia 실패 | HTTPS가 아닌 환경에서 `localhost`는 예외적으로 허용되지만 탭 여러 개에서 동시에 카메라를 요청하면 권한 충돌 가능. 각 탭에서 개별적으로 권한 승인 필요. |
| 시그널링 타이밍 | offer/answer 교환 중 ICE candidate가 먼저 도착할 수 있음. `peerManager`에서 `remoteDescription` 설정 전에 도착한 candidate는 queue에 보관 후 나중에 적용. |
| Colyseus schema sync | `onAdd`는 해당 플레이어가 처음 추가될 때만 발생. x/y 변경은 `onChange`에서 처리. `onChange`는 변경된 필드만 전달하므로 x만 변할 때 y를 0으로 덮어쓰지 않도록 주의. |
| cleanup.ts 단일 진입점 | `pc.close()`를 cleanup.ts 외 어디서도 직접 호출하지 않는다. `peerManager.ts`도 연결 종료가 필요하면 반드시 `cleanupPeer()` 함수를 호출. |
| rooms/logic 순수성 | `proximity.ts`에서 `@colyseus/core`, `@colyseus/schema`를 import하면 dependency-cruiser가 CI에서 실패시킴. |

---

## 다음 단계 (PoC 1 완료 후)

DoD 5개 항목 모두 체크 완료 → PoC 2 (`docs/plans/poc-2-coturn.md`) 착수.  
PoC 2: 동일 코드 기반에 `iceServers`에 자체 TURN 서버(coturn on EC2) 추가, 다양한 네트워크 환경에서 P2P 연결 검증.
