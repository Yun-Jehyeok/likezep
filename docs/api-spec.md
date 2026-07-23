# ZEP 대체 온라인 멘토링 플랫폼 — API 명세서

통신은 두 계층으로 나뉨:
1. **REST API** — 인증, 룸 목록, 채팅 기록, 관리 기능 (Express, Colyseus와 같은 Node 프로세스에 마운트)
2. **실시간 메시지** — Colyseus WebSocket 채널 (위치 동기화, 채팅, WebRTC 시그널링, 화면공유 시그널링)

## 0. 인증 공통

- Google OAuth 로그인 성공 시 서버가 **JWT** 발급 (payload: `userId`, `role`, `groupId`)
- REST: `Authorization: Bearer <token>` 헤더
- Colyseus: `client.joinById(roomId, { token })` → 서버 `onAuth`에서 JWT 검증
- 토큰 만료: 24h (MVP 기준, refresh 토큰은 추후)

**공통 에러 응답**
```json
{ "error": { "code": "FORBIDDEN", "message": "..." } }
```
| HTTP | code | 상황 |
|---|---|---|
| 401 | UNAUTHORIZED | 토큰 없음/만료 |
| 403 | FORBIDDEN | 권한 부족 (예: 멘티가 타 그룹 룸 접근, 비Admin이 admin API 호출) |
| 404 | NOT_FOUND | 리소스 없음 |
| 422 | VALIDATION_ERROR | 입력값 오류 |

---

## 1. REST API

### 1-1. 인증

#### `POST /api/auth/google`
Google OAuth 인가 코드로 로그인/가입 처리.

Request:
```json
{ "code": "<google authorization code>" }
```
Response 200:
```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid", "name": "윤제혁", "email": "...",
    "role": "admin", "groupId": null
  }
}
```
- 최초 로그인 시 users 레코드 자동 생성 (`role: mentee`, `group_id: null`)
- `ADMIN_EMAIL` 환경변수와 일치하는 이메일은 role=admin으로 생성

#### `GET /api/me`
현재 유저 정보 + 배정 상태 조회. (배정 대기 화면의 폴링 엔드포인트)

Response 200:
```json
{ "id": "uuid", "name": "...", "role": "mentee", "groupId": "uuid | null" }
```

### 1-2. 룸

#### `GET /api/rooms`
입장 가능한 룸 목록. **서버가 role/groupId 기준으로 필터링해서 반환** (클라이언트 필터링에 의존하지 않음).

Response 200:
```json
{
  "rooms": [
    { "id": "uuid", "name": "광장", "type": "public", "occupants": 12 },
    { "id": "uuid", "name": "A그룹 룸", "type": "private", "occupants": 4 }
  ]
}
```
- `occupants`: Colyseus room listing에서 실시간 조회
- 멘티: 공용 공간 + 본인 그룹 룸만 / 멘토·Admin: 전체

#### `GET /api/rooms/:roomId/chat?before=<messageId>&limit=50`
채팅 기록 조회 (커서 페이지네이션, 최신순).

Response 200:
```json
{
  "messages": [
    { "id": 123, "userId": "uuid", "userName": "홍길동", "content": "...", "createdAt": "..." }
  ],
  "hasMore": true
}
```
- 권한: 해당 룸 입장 권한과 동일한 규칙 적용

### 1-3. 관리 (Admin 전용 — role=admin 미들웨어)

#### `GET /api/admin/status`
실시간 접속 현황 (대시보드 7-1, 수 초 간격 폴링).

Response 200:
```json
{
  "rooms": [
    {
      "id": "uuid", "name": "A그룹 룸", "type": "private",
      "occupants": [ { "userId": "uuid", "name": "홍길동" } ]
    }
  ]
}
```

#### `POST /api/admin/groups`
그룹 생성 (+ 프라이빗 룸 자동 생성).

Request: `{ "name": "3기 A그룹" }`
Response 201: `{ "group": { "id": "uuid", "name": "..." }, "room": { "id": "uuid", "name": "3기 A그룹 룸" } }`

#### `DELETE /api/admin/groups/:groupId`
그룹 삭제 — 소속 멘티 group_id NULL 처리, 룸 soft delete (is_active=false).

Response 204.

#### `GET /api/admin/users`
전체 유저 목록 (그룹 관리 화면 7-2).

Response 200:
```json
{ "users": [ { "id": "uuid", "name": "...", "email": "...", "role": "mentee", "groupId": "uuid | null", "lastLoginAt": "..." } ] }
```

#### `PATCH /api/admin/users/:userId`
역할 변경 / 그룹 배정·재배정.

Request (부분 업데이트):
```json
{ "role": "mentor" }        // 또는
{ "groupId": "uuid | null" } // null이면 배정 해제
```
Response 200: 변경된 user 객체.
- 제약: role이 mentor/admin이면 groupId는 강제 NULL

#### `GET /api/admin/logs?userId=&roomId=&from=&to=&limit=100`
입장/퇴장 이벤트 로그 (7-3).

Response 200:
```json
{ "logs": [ { "userId": "uuid", "userName": "...", "roomName": "...", "event": "join", "createdAt": "..." } ] }
```

#### `GET /api/admin/stats?from=&to=`
그룹별 이용시간 합계 (join~leave 쌍 매칭 집계).

Response 200:
```json
{ "groups": [ { "groupId": "uuid", "groupName": "...", "totalMinutes": 1240, "memberCount": 6 } ] }
```

---

## 2. 실시간 메시지 프로토콜 (Colyseus)

### 2-1. 룸 입장/상태

**입장**: `client.joinById(roomId, { token })`
- 서버 `onAuth`: JWT 검증 → role/groupId로 입장 권한 체크 (멘티는 공용 or 본인 그룹 룸만)
- 서버 `onJoin`: access_logs에 join 기록, Player 상태 추가
- 서버 `onLeave`: access_logs에 leave 기록 (비정상 종료 포함), 상태 제거

**동기화 상태 (RoomState 스키마)**
```ts
class Player extends Schema {
  @type("string") id: string;      // users.id
  @type("string") name: string;
  @type("number") x: number;
  @type("number") y: number;
  @type("boolean") micOn: boolean;
  @type("boolean") camOn: boolean;
}
class RoomState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type("string") activeScreenshareUserId: string | null; // 전역 공지가 아닌 룸 내 표시용 참조
}
```

### 2-2. 클라이언트 → 서버 메시지

| 타입 | payload | 설명 |
|---|---|---|
| `move` | `{ x, y }` | 아바타 이동. 서버가 맵 경계/속도 검증 후 상태 반영 |
| `media-toggle` | `{ mic?: boolean, cam?: boolean }` | 마이크/카메라 상태 표시 동기화 (실제 트랙 제어는 클라 로컬) |
| `chat` | `{ content }` | 룸 전체 채팅. 서버가 브로드캐스트 + DB 저장 (비동기) |
| `webrtc-offer` | `{ to, sdp }` | 근접 화상 시그널링 릴레이 요청 |
| `webrtc-answer` | `{ to, sdp }` | 〃 |
| `webrtc-ice` | `{ to, candidate }` | 〃 |

### 2-3. 서버 → 클라이언트 메시지

| 타입 | payload | 설명 |
|---|---|---|
| `chat` | `{ id, userId, userName, content, createdAt }` | 채팅 브로드캐스트 |
| `proximity-connect` | `{ peerId, isOfferer }` | 근접 진입 — isOfferer=true인 쪽이 offer 생성 (id 사전순 작은 쪽) |
| `proximity-disconnect` | `{ peerId }` | 근접 이탈 — 해당 PeerConnection close 지시 |
| `webrtc-offer` / `webrtc-answer` / `webrtc-ice` | `{ from, sdp \| candidate }` | 시그널링 릴레이 전달 |

### 2-4. 근접 판정 (서버)

- 서버 tick (100ms)마다 모든 쌍 거리 계산 (O(n²), 룸 규모상 충분)
- 임계값: 연결 150px / 해제 180px — **히스테리시스 적용** (경계에서 연결/해제가 떨리는 것 방지)
- 근접 쌍 상태를 서버가 유지, 변화 시에만 connect/disconnect 메시지 발송

### 2-5. 화면공유 (전역 공지 채널 — mediasoup 시그널링)

화면공유는 룸 경계와 무관한 전역 채널. 시그널링은 별도 Colyseus room("global-announce")을 전 유저가 백그라운드 참여하는 방식으로 처리 (상태 동기화 없이 메시지 채널만 사용, 부하 미미).

**클라이언트 → 서버**
| 타입 | payload | 설명 |
|---|---|---|
| `ss-start` | `{}` | 발표 시작 요청. 서버가 role 체크(mentor/admin만) 후 mediasoup transport 파라미터 응답 |
| `ss-connect-transport` | `{ dtlsParameters }` | transport 연결 |
| `ss-produce` | `{ rtpParameters }` | 화면공유 스트림 produce |
| `ss-consume` | `{ rtpCapabilities }` | 시청 요청 → 서버가 consumer 파라미터 응답 |
| `ss-stop` | `{}` | 발표 종료 |

**서버 → 클라이언트**
| 타입 | payload | 설명 |
|---|---|---|
| `ss-started` | `{ presenterId, presenterName }` | 전체에 발표 시작 알림 → 각 클라가 ss-consume 요청 |
| `ss-stopped` | `{}` | 발표 종료 → 시청 뷰 정리 |

제약: 동시 발표자 1명 (이미 발표 중이면 `ss-start` 거부, 에러 응답)

---

## 3. 권한 매트릭스 요약

| 행위 | 멘티 | 멘토 | Admin |
|---|---|---|---|
| 공용 공간 입장 | O | O | O |
| 본인 그룹 룸 입장 | O | O | O |
| 타 그룹 룸 입장 | X | O | O |
| 화면공유 시작 | X | O | O |
| 채팅 | O | O | O |
| /api/admin/* | X | X | O |
