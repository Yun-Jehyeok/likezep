# PoC 2 — coturn 기반 네트워크 환경 검증

## 목표

다양한 실제 네트워크 환경(가정용 와이파이, 모바일 핫스팟, 학원망 등)에서 P2P WebRTC 연결이 실패할 때  
자체 TURN 서버(coturn on EC2)가 릴레이를 수행해 연결이 성립하는지 검증.

PoC 1 코드를 그대로 재사용하고, iceServers 설정과 TURN credential API만 추가한다.

## Definition of Done

| # | 검증 항목 | 방법 |
|---|---|---|
| 1 | coturn이 EC2에서 정상 기동됨 | `turnutils_uclient`로 TURN 할당 테스트 |
| 2 | 같은 네트워크 두 클라이언트 — STUN으로 연결됨 (기준선) | ICE 후보 타입 로그에서 `host` 또는 `srflx` 확인 |
| 3 | 다른 네트워크 두 클라이언트 — TURN 릴레이로 연결됨 | ICE 후보 타입 로그에서 `relay` 확인 |
| 4 | TURN 서버 중단 시 다른 네트워크 간 연결 실패 | TURN 필요성 대조군 확인 |
| 5 | TURN credential이 만료 기간(TTL) 이후 재사용 불가 | 만료된 credential로 연결 시도 → 실패 확인 |

## 현재 상태 (착수 기준선)

완료된 것 (PoC 1):
- `apps/client/src/core/webrtc/peerManager.ts` — iceServers: Google STUN만 하드코딩
- `apps/client/src/core/webrtc/cleanup.ts` — WebRTC 정리 로직
- `apps/server/src/index.ts` — Express + Colyseus 서버 기동
- PoC 1 전체 동작 확인

만들어야 하는 것:
- EC2에 coturn 설치 및 설정 (인프라)
- 서버: 시간 제한 TURN credential REST API
- 클라이언트: iceServers 업데이트 + ICE 로깅 추가
- 환경변수: TURN 설정값 `.env`로 분리

---

## Phase 0: AWS EC2 + coturn 설치 (인프라)

### 0-1. EC2 보안그룹 설정

아래 인바운드 규칙 추가. **이 설정 없이는 TURN 릴레이가 절대 동작하지 않는다.**

| 타입 | 프로토콜 | 포트 | 설명 |
|------|----------|------|------|
| Custom TCP | TCP | 3478 | TURN 리스닝 (TCP) |
| Custom UDP | UDP | 3478 | TURN 리스닝 (UDP) |
| Custom UDP | UDP | 49152–65535 | TURN relay 포트 범위 |

> relay 포트 범위는 coturn의 `min-port` / `max-port` 설정과 반드시 일치해야 함.

### 0-2. coturn 설치 (Ubuntu 22.04 기준)

```bash
sudo apt-get update
sudo apt-get install -y coturn
sudo systemctl enable coturn
```

### 0-3. coturn 설정 (`/etc/turnserver.conf`)

```conf
# 리스닝 포트
listening-port=3478

# EC2 IP 설정 — 필수. 없으면 사설 IP로만 바인딩돼 외부에서 relay 불가.
external-ip=<EC2_PUBLIC_IP>/<EC2_PRIVATE_IP>

# fingerprint: WebRTC 호환성을 위해 필요
fingerprint

# 시간 제한 credential (HMAC-SHA1 REST API 방식)
use-auth-secret
static-auth-secret=<랜덤_시크릿_문자열>   # openssl rand -hex 32 로 생성

# realm: 도메인 또는 식별 문자열
realm=mentoring.likezep.local

# relay 포트 범위 — EC2 보안그룹과 동일하게
min-port=49152
max-port=65535

# 보안 강화
no-loopback-peers
no-multicast-peers
stale-nonce=600

# 동시 할당 상한
total-quota=100
```

```bash
# 설정 후 재시작
sudo systemctl restart coturn
sudo systemctl status coturn
```

### 0-4. coturn 동작 확인

```bash
# EC2 안에서 자체 연결 테스트
turnutils_uclient -T -u testuser -w testpass 127.0.0.1

# 외부에서: 로컬 PC에서 EC2 퍼블릭 IP로 테스트
turnutils_uclient -T -p 3478 <EC2_PUBLIC_IP>
```

> `turnutils_uclient`는 coturn 설치 시 함께 설치됨 (`sudo apt install coturn`).

### 0-5. 인프라 설정 파일 보관 (`infra/coturn/`)

```
infra/
└── coturn/
    ├── turnserver.conf.example   # 시크릿 제거한 예시 파일 (커밋)
    └── README.md                 # 설치 절차 메모 (커밋)
```

`static-auth-secret` 값은 EC2의 `/etc/turnserver.conf`에만 존재, 절대 커밋하지 않는다.

---

## Phase 1: 서버 — TURN Credential REST API

### 1-1. 환경변수 추가 (`apps/server/.env`)

```env
TURN_SECRET=<EC2 /etc/turnserver.conf의 static-auth-secret과 동일한 값>
TURN_HOST=<EC2_PUBLIC_IP>
TURN_PORT=3478
TURN_TTL=86400
```

> `.env`는 `.gitignore`에 이미 있음. `.env.example`에 키 목록만 추가.

### 1-2. TURN Credential 생성 유틸 (`apps/server/src/turn/credentials.ts`)

시간 제한 credential 생성. coturn의 `use-auth-secret` 모드에서 요구하는 HMAC-SHA1 방식.

```ts
import crypto from "crypto";

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
}

export function generateTurnCredentials(
  host: string,
  port: number,
  secret: string,
  ttlSeconds: number
): TurnCredentials {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expires}:poc-user`;
  const credential = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  return {
    urls: [`turn:${host}:${port}`, `turn:${host}:${port}?transport=tcp`],
    username,
    credential,
  };
}
```

**username 형식**: `<Unix timestamp>:<임의 식별자>` — coturn이 timestamp를 파싱해 만료 여부 검증.

### 1-3. REST 엔드포인트 추가 (`apps/server/src/index.ts`)

```ts
app.get("/turn-credentials", (_req, res) => {
  const secret = process.env.TURN_SECRET;
  const host = process.env.TURN_HOST;
  const port = Number(process.env.TURN_PORT ?? 3478);
  const ttl = Number(process.env.TURN_TTL ?? 86400);

  if (!secret || !host) {
    // TURN 미설정 시 STUN 전용으로 폴백 (PoC 1과 동일하게 동작)
    return res.json({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  }

  const turn = generateTurnCredentials(host, port, secret, ttl);
  res.json({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      turn,
    ],
  });
});
```

> `TURN_SECRET` / `TURN_HOST`가 없으면 STUN 전용으로 폴백하므로 로컬 개발 시 `.env` 없이도 동작함.

---

## Phase 2: 클라이언트 — iceServers 업데이트 + ICE 로깅

### 2-1. iceServers 페치 모듈 (`apps/client/src/core/webrtc/iceServers.ts`)

```ts
const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL?.replace("ws://", "http://").replace("wss://", "https://")
  ?? "http://localhost:2567";

let cached: RTCIceServer[] | null = null;

export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cached) return cached;
  try {
    const res = await fetch(`${SERVER_URL}/turn-credentials`);
    const data = await res.json();
    cached = data.iceServers;
    return cached!;
  } catch {
    // 서버 미응답 시 Google STUN 폴백
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
}
```

> 세션당 1회만 페치 (캐싱). TURN credential TTL 내에는 재사용 가능.

### 2-2. peerManager.ts — iceServers 파라미터화 + ICE 로깅

`initPeerAsOfferer` / `initPeerAsAnswerer`의 시그니처에 `iceServers` 추가.

```ts
// 변경 전
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

// 변경 후: 파라미터로 받음
export async function initPeerAsOfferer(
  peerId: string,
  localStream: MediaStream,
  iceServers: RTCIceServer[],     // ← 추가
  sendSignal: (type: string, payload: object) => void,
  onRemoteStream: (peerId: string, stream: MediaStream) => void
): Promise<void>
```

RTCPeerConnection 생성 시:
```ts
const pc = new RTCPeerConnection({ iceServers });
```

**ICE 로깅 추가** — 어떤 타입의 후보가 선택됐는지 확인용:
```ts
pc.oniceconnectionstatechange = () => {
  console.log(`[ICE ${peerId}] state: ${pc.iceConnectionState}`);
  if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
    // 선택된 candidate pair 로깅
    pc.getStats().then((stats) => {
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          console.log(`[ICE ${peerId}] selected pair:`, report);
        }
        if (report.type === "remote-candidate") {
          console.log(`[ICE ${peerId}] remote candidate type: ${report.candidateType}`);
          // host | srflx | relay — relay이면 TURN 경유
        }
      });
    });
  }
};
```

### 2-3. GameScreen.tsx — iceServers 전달 경로 수정

```ts
// useEffect 안에서 iceServers 먼저 페치
const iceServers = await getIceServers();

// onProximityConnect 콜백에서 peerManager 호출 시 전달
onProximityConnect(peerId, isOfferer) {
  if (!localStreamRef.current) return;
  if (isOfferer) {
    initPeerAsOfferer(peerId, localStreamRef.current, iceServers, sendSignal, onRemoteStream);
  }
},
onWebRtcOffer(from, sdp) {
  if (!localStreamRef.current) return;
  initPeerAsAnswerer(from, localStreamRef.current, iceServers, sdp, sendSignal, onRemoteStream);
},
```

---

## Phase 3: 검증

### 검증 시나리오

| # | 시나리오 | 기대 결과 | ICE 로그에서 확인 |
|---|---|---|---|
| 1 | 동일 와이파이 두 탭 | 화상 연결 성공 | remote candidate type: `host` 또는 `srflx` |
| 2 | 핫스팟(모바일) ↔ 집 와이파이 | TURN 릴레이로 화상 연결 성공 | remote candidate type: `relay` |
| 3 | 핫스팟 ↔ 집 와이파이, coturn 중단 상태 | 연결 실패 또는 매우 느림 | ICE state: `failed` |
| 4 | 만료된 credential (TTL 0초로 생성) | TURN 인증 거부 | TURN allocation 실패 로그 |

### pnpm check 통과 확인

```bash
pnpm check
```

### 검증 방법 상세

```
브라우저 콘솔에서:
- "[ICE <peerId>] remote candidate type: relay" → TURN 경유 확인
- "[ICE <peerId>] state: connected" → 연결 성공

Chrome: chrome://webrtc-internals 에서 ICE 후보 전체 목록 및 선택 경로 상세 확인 가능
```

---

## 파일 변경 목록

```
신규:
  infra/coturn/turnserver.conf.example
  infra/coturn/README.md
  apps/server/src/turn/credentials.ts
  apps/client/src/core/webrtc/iceServers.ts

수정:
  apps/server/src/index.ts           — /turn-credentials 엔드포인트 추가
  apps/server/.env.example           — TURN 관련 환경변수 키 추가
  apps/client/src/core/webrtc/peerManager.ts   — iceServers 파라미터화 + ICE 로깅
  apps/client/src/features/poc/GameScreen.tsx  — getIceServers() 호출 + 전달
```

---

## 주의사항 / 삽질 방지

| 항목 | 내용 |
|---|---|
| `external-ip` 필수 | EC2는 사설 IP로 바인딩되므로 `external-ip=퍼블릭IP/사설IP` 없으면 외부 relay 불가. 가장 흔한 실패 지점. |
| 보안그룹 UDP relay 포트 | 3478만 열고 49152–65535 안 열면 STUN은 되는데 TURN relay가 안 됨. |
| `static-auth-secret` 일치 | EC2 turnserver.conf의 secret과 서버 `.env`의 `TURN_SECRET`이 다르면 credential 검증 실패. |
| TCP 폴백 | 일부 기업망/학원망은 UDP 차단. `turn:host:3478?transport=tcp`도 iceServers에 포함해야 함 (Phase 1-2에 이미 반영). |
| 로컬 개발 | `TURN_SECRET`/`TURN_HOST` 없으면 서버가 STUN 전용으로 응답 → PoC 1과 동일하게 동작. 로컬 개발에 지장 없음. |
| credential 캐싱 | iceServers.ts에서 세션당 1회 캐싱. 탭 열어둔 채 TTL이 지나면 다음 세션부터 새 credential 발급. PoC 수준에서는 충분. |

---

## 다음 단계 (PoC 2 완료 후)

DoD 5개 항목 체크 완료 → PoC 3 (`docs/plans/poc-3-mediasoup.md`) 착수.  
PoC 3: mediasoup으로 발표자 1명의 화면공유를 N명에게 포워딩.
