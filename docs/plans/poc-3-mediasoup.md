# PoC 3 — mediasoup 기반 화면공유 포워딩

## 목표

발표자 1명의 화면공유 스트림을 mediasoup SFU가 수신하고, N명의 시청자에게 동시에 포워딩하는 것을 검증.

PoC 1·2의 근접 화상(P2P Mesh)과 별도 레이어로 동작한다.  
화면공유는 P2P가 아닌 SFU 중계 방식이므로 발표자 업로드 1회, 나머지는 서버가 분배.

## Definition of Done

| # | 검증 항목 | 방법 |
|---|---|---|
| 1 | mediasoup Worker/Router EC2에서 정상 기동 | 서버 로그 확인 |
| 2 | 발표자 화면공유 스트림 Produce 성공 | 브라우저 콘솔 `producer.id` 출력 확인 |
| 3 | 시청자 1명 Consume → 화면 수신 | `<video>` 재생 확인 |
| 4 | 시청자 3명 이상 동시 Consume → 모두 화면 수신 | 탭 3개 동시 확인 |
| 5 | 발표자 퇴장 시 시청자 화면 중단 | `consumer.on('producerclose')` 발생 확인 |

---

## 아키텍처

```
발표자 브라우저                  EC2 (mediasoup SFU)             시청자 브라우저
─────────────────               ───────────────────             ─────────────────
getDisplayMedia()
    │
    ▼
ProducerTransport ──WebRTC──▶  Router ──────────────WebRTC──▶ ConsumerTransport
(screen track)                    │                                │
                                  ├── Consumer A ─────────────▶ 시청자 A
                                  ├── Consumer B ─────────────▶ 시청자 B
                                  └── Consumer C ─────────────▶ 시청자 C
```

시그널링은 기존 Colyseus 채널을 재사용한다 (Colyseus message로 mediasoup 시그널 교환).

---

## Phase 0: 패키지 설치 및 EC2 환경 준비

### 0-1. 패키지 추가

```bash
# 서버
pnpm --filter @likezep/server add mediasoup

# 클라이언트
pnpm --filter @likezep/client add mediasoup-client
```

mediasoup는 네이티브 빌드(node-gyp)가 필요하다. EC2에 빌드 도구 필요:

```bash
sudo apt-get install -y build-essential python3
```

> t3.micro (1GB RAM)에서 mediasoup 빌드 시 OOM 위험 → 스왑 2GB 유지 필수.  
> 빌드 시간 약 3~5분 소요.

### 0-2. EC2 보안그룹 추가

mediasoup WebRTC transport용 포트 범위 (coturn과 별도):

| 타입 | 프로토콜 | 포트 | 설명 |
|------|----------|------|------|
| Custom UDP | UDP | 40000–49151 | mediasoup RTC 포트 범위 |
| Custom TCP | TCP | 40000–49151 | mediasoup RTC 포트 범위 (TCP 폴백) |

> coturn 포트(49152–65535)와 겹치지 않게 40000–49151 사용.

---

## Phase 1: 서버 — mediasoup Worker/Router + 시그널링 API

### 1-1. 디렉토리 구조

```
apps/server/src/
└── mediasoup/
    ├── worker.ts        — Worker 싱글턴 생성 및 관리
    ├── router.ts        — Room별 Router 생성
    ├── transport.ts     — WebRtcTransport 생성 헬퍼
    └── index.ts         — Express 라우터 (시그널링 엔드포인트)
```

### 1-2. Worker 초기화 (`mediasoup/worker.ts`)

```ts
import mediasoup from "mediasoup";
import type { Worker } from "mediasoup/node/lib/types.js";

let worker: Worker;

export async function getWorker(): Promise<Worker> {
  if (worker) return worker;
  worker = await mediasoup.createWorker({
    rtcMinPort: 40000,
    rtcMaxPort: 49151,
    logLevel: "warn",
  });
  worker.on("died", () => {
    console.error("mediasoup worker died — exiting");
    process.exit(1);
  });
  return worker;
}
```

### 1-3. Router 생성 (`mediasoup/router.ts`)

```ts
import type { Router } from "mediasoup/node/lib/types.js";
import { getWorker } from "./worker.js";

const MEDIA_CODECS = [
  {
    kind: "video" as const,
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {},
  },
  {
    kind: "audio" as const,
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
];

const routers = new Map<string, Router>();

export async function getOrCreateRouter(roomId: string): Promise<Router> {
  if (routers.has(roomId)) return routers.get(roomId)!;
  const worker = await getWorker();
  const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
  routers.set(roomId, router);
  return router;
}

export function deleteRouter(roomId: string) {
  const router = routers.get(roomId);
  if (router) {
    router.close();
    routers.delete(roomId);
  }
}
```

### 1-4. 시그널링 엔드포인트 (`mediasoup/index.ts`)

아래 5개 엔드포인트로 mediasoup 시그널링을 처리한다.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/ms/rtp-capabilities/:roomId` | Router RTP capabilities 반환 |
| POST | `/ms/transport/create` | WebRtcTransport 생성 |
| POST | `/ms/transport/connect` | Transport DTLS 연결 |
| POST | `/ms/produce` | Producer 생성 (발표자) |
| POST | `/ms/consume` | Consumer 생성 (시청자) |

**주요 구현 포인트:**

- Transport 생성 시 `announcedIp: EC2_PUBLIC_IP` 설정 필수 (coturn의 external-ip와 동일한 이유)
- Consumer 생성 전 `router.canConsume({ producerId, rtpCapabilities })` 확인
- 서버 메모리에 `Map<transportId, transport>`, `Map<producerId, producer>` 유지

### 1-5. 환경변수 추가 (`.env.example`)

```env
MEDIASOUP_ANNOUNCED_IP=<EC2_PUBLIC_IP>
```

---

## Phase 2: 클라이언트 — 화면공유 UI + mediasoup-client

### 2-1. 디렉토리 구조

```
apps/client/src/
└── features/screenshare/
    ├── ScreenShareButton.tsx   — 화면공유 시작/중단 버튼
    ├── ScreenShareView.tsx     — 시청자 화면 표시 컴포넌트
    └── useScreenShare.ts       — mediasoup-client 로직 훅
```

### 2-2. 발표자 흐름 (`useScreenShare.ts` — produce 측)

```
1. getDisplayMedia() 로 화면 스트림 획득
2. GET /ms/rtp-capabilities/:roomId → Device.load()
3. POST /ms/transport/create → ProducerTransport 생성
4. POST /ms/transport/connect (on 'connect' 이벤트)
5. transport.produce({ track }) → POST /ms/produce
6. producer.id 를 Colyseus 메시지로 룸 전체에 브로드캐스트
```

### 2-3. 시청자 흐름 (`useScreenShare.ts` — consume 측)

```
1. Colyseus에서 producerId 수신
2. GET /ms/rtp-capabilities/:roomId → Device.load()
3. POST /ms/transport/create → ConsumerTransport 생성
4. POST /ms/transport/connect (on 'connect' 이벤트)
5. POST /ms/consume → { id, producerId, kind, rtpParameters }
6. transport.consume(params) → consumer.track → <video> 재생
```

### 2-4. Colyseus 메시지 타입 추가 (`packages/shared/protocol`)

```ts
// 발표자 → 서버 → 시청자
export interface ScreenShareStarted {
  type: "screenshare-started";
  producerId: string;
  presenterId: string;
}

export interface ScreenShareStopped {
  type: "screenshare-stopped";
  presenterId: string;
}
```

---

## Phase 3: 검증

### 검증 시나리오

| # | 시나리오 | 기대 결과 |
|---|---|---|
| 1 | 서버 기동 로그 | `mediasoup worker created` |
| 2 | 발표자 화면공유 버튼 클릭 | 콘솔에 `producer.id: <id>` 출력 |
| 3 | 시청자 탭에서 화면 수신 | `<video>` 자동재생 |
| 4 | 시청자 탭 3개 동시 접속 | 모두 화면 수신 |
| 5 | 발표자 공유 중단 | 시청자 화면 블랙 또는 숨김 처리 |

```bash
pnpm check
```

---

## 파일 변경 목록

```
신규:
  apps/server/src/mediasoup/worker.ts
  apps/server/src/mediasoup/router.ts
  apps/server/src/mediasoup/transport.ts
  apps/server/src/mediasoup/index.ts
  apps/client/src/features/screenshare/ScreenShareButton.tsx
  apps/client/src/features/screenshare/ScreenShareView.tsx
  apps/client/src/features/screenshare/useScreenShare.ts

수정:
  apps/server/src/index.ts              — mediasoup 라우터 마운트, Worker 초기화
  apps/server/.env.example              — MEDIASOUP_ANNOUNCED_IP 추가
  packages/shared/protocol/             — screenshare 메시지 타입 추가
  apps/client/src/features/poc/GameScreen.tsx — ScreenShareButton 통합
```

---

## 주의사항 / 삽질 방지

| 항목 | 내용 |
|---|---|
| `announcedIp` 필수 | EC2 사설 IP로 바인딩되므로 퍼블릭 IP 명시 안 하면 외부 클라이언트가 transport에 연결 불가 |
| mediasoup 빌드 | 패키지 설치 시 node-gyp 빌드 실행됨. t3.micro에서 OOM 방지 위해 스왑 유지 |
| Device.load() 순서 | `device.load()` 전에 `transport.produce()` 호출 시 에러. 반드시 load 완료 후 진행 |
| `canConsume()` 확인 | Consumer 생성 전 서버에서 확인 필수. 건너뛰면 mediasoup 내부 에러 |
| VP8 고정 | PoC 수준에서 코덱 협상 단순화. H264는 하드웨어 인코딩 필요해 t3.micro에서 불안정 |
| 포트 범위 보안그룹 | 40000–49151 UDP/TCP 미개방 시 transport 연결 타임아웃 |

---

## 다음 단계 (PoC 3 완료 후)

DoD 5개 항목 체크 완료 → MVP 착수.  
MVP: PixiJS 맵/아바타, React Router, Google OAuth, Prisma/PostgreSQL, 관리 대시보드.
