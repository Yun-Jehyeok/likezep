# ZEP 대체 온라인 멘토링 플랫폼 — 하네스 엔지니어링 (Claude Code 기준)

> OpenAI의 하네스 엔지니어링 방법론(https://openai.com/index/harness-engineering/)을 Claude Code(claude-cli) 환경에 맞게 번안한 문서.
> 하네스 = 에이전트가 할 수 있는 것을 **제약(Constrain)**, 해야 할 것을 **안내(Inform)**, 제대로 했는지 **검증(Verify)**, 잘못됐을 때 **교정(Correct)**하는 시스템 전체.

## 0. 핵심 원칙 (이 프로젝트에 적용하는 형태)

1. **짧은 지도 > 긴 매뉴얼** — CLAUDE.md는 100줄 이내의 "지도"로 유지하고, 상세 내용은 docs/의 개별 문서로 위임. 컨텍스트는 희소 자원.
2. **아키텍처는 기계적으로 강제** — "PixiJS 계층은 React를 import하지 마라"를 문서에 쓰는 게 아니라 dependency-cruiser 룰로 CI에서 막는다.
3. **에러 메시지가 곧 교육** — 커스텀 린트 룰의 에러 메시지에 "왜 안 되는지 + 어떻게 고치는지"를 포함시켜, Claude가 실패 메시지만 보고 스스로 수정하게 한다.
4. **모든 에이전트 실수는 하네스의 버그** — Claude가 같은 유형의 실수를 반복하면 프롬프트를 고치는 게 아니라 린트 룰/구조 테스트/훅을 추가해 그 실수 유형 자체를 불가능하게 만든다.
5. **검증 가능한 요구만 요구** — "렉 없게 해줘"가 아니라 "룸 전환 시 이전 룸의 RTCPeerConnection이 0개여야 한다"처럼 측정 가능한 형태로 지시하고, 그걸 확인하는 테스트/스크립트를 하네스에 포함시킨다.

## 1. CLAUDE.md 설계 (지도 역할)

리포 루트의 CLAUDE.md는 Claude Code가 매 세션 자동으로 읽는 파일. **100줄 이내**로 유지하고 아래 구성만 담는다:

```markdown
# 멘토링 플랫폼

ZEP 대체 자체 멘토링 플랫폼. 핵심 목표: 멀티룸 동시 관리 시 렉 제로.

## 반드시 읽을 문서 (작업 유형별)
- 무엇을 만드는가: docs/requirements.md
- DB 작업: docs/db-schema.md
- API/실시간 메시지: docs/api-spec.md
- 아키텍처 규칙: docs/architecture.md
- 현재 작업 단계: docs/plans/ 의 해당 계획 문서

## 절대 규칙 (위반 시 CI 실패)
- client/game/ 은 React를 import하지 않는다
- 클라-서버 메시지 타입은 packages/shared/protocol 에서만 가져온다
- WebRTC 연결 해제는 core/webrtc/cleanup.ts 의 정리 함수로만 한다
- 서버 rooms/logic/ 은 Colyseus를 import하지 않는다 (순수 함수)
- DB 접근은 server/db/ 리포지토리를 통해서만 (서비스에서 Prisma 직접 호출 금지)

## 작업 완료 조건
- pnpm check 통과 (typecheck + lint + 구조검증 + 단위테스트)
- 실시간 기능 변경 시 pnpm test:e2e 통과

## 명령어
pnpm dev / pnpm check / pnpm test / pnpm test:e2e
```

- CLAUDE.md에 상세 설명을 덧붙이고 싶어질 때마다 → docs/로 옮기고 링크만 남긴다 (지도 원칙)
- 하위 디렉토리별 CLAUDE.md 추가 가능: `apps/client/game/CLAUDE.md`에 PixiJS 계층 전용 규칙(텍스처 destroy 규약 등)을 두면 해당 디렉토리 작업 시에만 로드됨 — 컨텍스트 절약

## 2. 기계적 제약 (Constrain)

### 2-1. 의존성 그래프 강제 — dependency-cruiser

이 프로젝트의 계층:
```
[shared: types → protocol/schema]
[server: config → db → services → rooms/media → api]
[client: core → game → features → App]
```

`.dependency-cruiser.cjs` 룰로 강제하는 것들:
| 룰 | 막는 것 | 에러 메시지에 포함할 교정 지침 |
|---|---|---|
| `game-no-react` | client/game/* → react | "PixiJS 계층은 React를 모릅니다. UI 연동이 필요하면 core/store를 통해 상태를 구독하세요." |
| `protocol-single-source` | 클라/서버가 로컬에 메시지 타입 정의 | "메시지 타입은 packages/shared/protocol에 추가하고 양쪽에서 import하세요." |
| `logic-pure` | server/rooms/logic/* → colyseus | "근접 판정 로직은 순수 함수로 유지합니다. Room 클래스에서 로직을 호출하는 방향으로 작성하세요." |
| `db-via-repo` | services → @prisma/client 직접 | "서비스는 server/db/의 리포지토리 함수를 사용하세요. 새 쿼리가 필요하면 리포지토리에 추가하세요." |
| `layer-order` | 하위 계층 → 상위 계층 역참조 | "의존 방향은 config→db→services→rooms→api 입니다." |

### 2-2. 커스텀 ESLint 룰

- `no-raw-peerconnection-close`: `pc.close()` 직접 호출 금지 → "연결 해제는 core/webrtc/cleanup.ts의 cleanupPeer()를 사용하세요. video element 제거와 Map 정리가 함께 이뤄져야 메모리 누수가 없습니다." (이 프로젝트 최대 리스크인 리소스 누수를 룰 하나로 원천 차단)
- `no-pixi-in-react-render`: React 컴포넌트 본문에서 PIXI 객체 생성 금지 → "PIXI 객체는 game/ 계층에서 생성하고, React에서는 마운트만 하세요."

### 2-3. 구조 테스트

- Colyseus State 스키마 변경 시 shared의 스키마 정의와 서버 사용처가 일치하는지 검증하는 테스트
- 마이그레이션 파일과 Prisma 스키마 동기화 검증

### 2-4. Claude Code 권한 설정 — .claude/settings.json

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(**/.env)",
      "Bash(git push --force*)",
      "Bash(rm -rf*)",
      "Edit(prisma/migrations/**)"
    ],
    "allow": [
      "Bash(pnpm check)",
      "Bash(pnpm test*)",
      "Bash(docker compose -f infra/docker-compose.dev.yml*)"
    ]
  }
}
```
- 적용된 마이그레이션 파일 수정 금지(스키마 드리프트 방지), .env 읽기 차단, 파괴적 명령 차단

## 3. 검증 루프 (Verify) — Claude Code 훅

`.claude/settings.json`의 hooks로 자동 검증을 강제:

| 훅 | 시점 | 동작 |
|---|---|---|
| PostToolUse (Edit/Write) | 파일 수정 직후 | 수정된 파일에 `eslint --fix` + `tsc --noEmit` (해당 패키지만) 실행, 실패 시 에러를 Claude에게 반환 → 즉시 자가 수정 유도 |
| Stop | 응답 종료 시 | `pnpm check` 실행 — 통과 전엔 작업 완료로 치지 않도록 실패 내용을 반환 |
| PreToolUse (Bash) | 명령 실행 전 | `db:migrate reset` 등 파괴적 DB 명령 차단 |

핵심: **사람이 "린트 돌려봐"라고 말할 필요가 없게** 만드는 것. 검증은 하네스가 자동으로 수행하고, Claude는 실패 메시지(=교정 지침)를 보고 스스로 고친다.

## 4. 관측 가능성 (Observe) — 실시간 앱 특화

이 프로젝트는 "여러 클라이언트 간 실시간 상호작용"이 핵심이라, Claude가 결과를 눈으로 확인할 수단이 하네스에 반드시 필요하다:

- **Playwright 멀티클라이언트 E2E**: 브라우저 컨텍스트 2~3개를 동시에 띄워 근접 화상 연결/해제 시나리오를 자동 검증. `getStats()`로 활성 PeerConnection 수를 assert — "룸 전환 후 이전 룸 연결 0개" 같은 요구를 측정 가능하게.
- **가짜 미디어 플래그**: E2E는 `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`로 카메라 권한 팝업 없이 실행 (헤드리스 환경에서 WebRTC 검증 가능).
- **디버그 엔드포인트**: 개발 모드 한정 `GET /debug/rooms` — 서버가 인식 중인 룸/인원/근접 쌍 상태를 JSON으로 노출. Claude가 curl 한 번으로 서버 상태를 관측 가능.
- **클라이언트 디버그 오버레이**: `?debug=1` 쿼리로 활성 PeerConnection 수 / FPS / 메모리 사용량을 화면에 표시 — Playwright 스크린샷으로도 상태 확인 가능.
- **Chrome DevTools MCP (선택)**: 브라우저 콘솔/네트워크를 Claude가 직접 관측해 UI 버그 재현 시 활용.

## 5. 작업 단위와 슬래시 커맨드 (Inform)

### 5-1. 실행 계획 문서 — docs/plans/

각 단계(PoC 1~3, MVP 화면별)를 에이전트 크기의 작업 단위로 분해한 계획 문서를 두고, Claude에게는 "docs/plans/poc-1-proximity-mesh.md 의 3번 작업을 진행해"처럼 계획 문서 기준으로 지시한다. 계획 문서엔 완료 조건(Definition of Done)이 검증 가능한 형태로 명시되어 있어야 한다.

### 5-2. 슬래시 커맨드 — .claude/commands/

| 커맨드 | 내용 |
|---|---|
| `/verify` | pnpm check + 관련 E2E 실행 후 결과 요약 |
| `/proximity-test` | 근접 화상 멀티클라이언트 E2E만 실행 + PeerConnection 수 리포트 |
| `/cleanup-scan` | 아래 6장의 정리 스캔을 수동 트리거 |
| `/plan-status` | docs/plans/ 의 현재 단계 문서를 읽고 완료/미완료 항목 정리 |

### 5-3. 서브에이전트 — .claude/agents/

- `reviewer`: 변경 diff를 절대 규칙(1장) 관점에서 검토하는 읽기 전용 서브에이전트 — 본 작업 컨텍스트를 오염시키지 않고 리뷰 수행
- `e2e-runner`: E2E 실행과 실패 분석 전담 (긴 로그가 메인 컨텍스트를 잠식하지 않게 격리)

## 6. 엔트로피 관리 (Correct)

에이전트는 리포에 이미 있는 패턴을 복제하므로, 나쁜 패턴이 하나 들어오면 증식한다. 대응:

- **골든 룰 문서화**: docs/architecture.md에 "좋은 예/나쁜 예" 코드 쌍을 유지 — Claude가 패턴을 복제할 때 좋은 쪽을 복제하게
- **주기적 정리 스캔**: 주 1회 `claude -p`(headless)를 GitHub Actions cron으로 실행 — 스캔 항목: (1) cleanup 함수 우회한 WebRTC 해제 코드, (2) shared/protocol 밖의 중복 메시지 타입 정의, (3) docs/와 실제 코드의 불일치(스키마 문서 vs Prisma 스키마), 발견 시 소규모 수정 PR 자동 생성
- **1인 운영 현실 반영**: OpenAI처럼 자동 머지까지 가진 않고, 정리 PR은 본인이 리뷰 후 머지 (규모상 주 1회 리뷰로 충분)
- **실수 → 룰 전환 로그**: docs/architecture.md 말미에 "하네스 변경 이력" 섹션 — Claude가 저지른 실수와 그에 대응해 추가한 룰을 기록. 같은 실수가 재발하면 룰이 불충분하다는 신호

## 7. 이 프로젝트 하네스의 우선 구축 순서

PoC 1 착수 전에 전부 갖출 필요는 없다. 단계별 최소 하네스:

| 단계 | 갖출 것 |
|---|---|
| **PoC 1 착수 전** | CLAUDE.md(지도), 모노레포 스캐폴딩, pnpm check(typecheck+eslint 기본), PostToolUse 훅, `game-no-react` + `protocol-single-source` 룰 |
| **PoC 1 진행 중** | `no-raw-peerconnection-close` 룰, 디버그 엔드포인트/오버레이, Playwright 멀티클라이언트 기반 구축 |
| **PoC 2~3** | Stop 훅(pnpm check 강제), E2E 시나리오 확충, `/proximity-test` 커맨드 |
| **MVP 개발** | dependency-cruiser 전체 룰, 서브에이전트(reviewer), 정리 스캔 cron, 하네스 변경 이력 운영 시작 |

> 원칙: 하네스도 점진적으로. "Claude가 실수하면 → 그 실수를 막는 룰을 추가"하는 사이클을 PoC 1부터 습관화하는 것이 문서 완비보다 중요하다.
