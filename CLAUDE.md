# 멘토링 플랫폼

ZEP 대체 자체 멘토링 플랫폼. 핵심 목표: 멀티룸 동시 관리 시 렉 제로.

## 반드시 읽을 문서 (작업 유형별)
- 무엇을 만드는가: docs/requirements.md
- DB 작업: docs/db-schema.md
- API/실시간 메시지: docs/api-spec.md
- 아키텍처 규칙: docs/architecture.md
- 현재 작업 단계: docs/plans/mvp.md

## 현재 단계: MVP 개발 (PoC 1~3 완료)
- PoC 1 (근접 화상 Mesh) — 완료 commit `4540500`
- PoC 2 (coturn TURN relay) — 완료 commit `100c1f1`
- PoC 3 (mediasoup SFU 화면공유) — 완료 commit `6f8761a`
- MVP UI 스켈레톤 (Tailwind + mock data) — 구현 완료, 미커밋

## 절대 규칙 (위반 시 CI 실패)
- `client/game/`은 React를 import하지 않는다
- 클라-서버 메시지 타입은 `packages/shared/protocol`에서만 가져온다
- WebRTC 연결 해제는 `core/webrtc/cleanup.ts`의 정리 함수로만 한다
- `server/rooms/logic/`은 Colyseus를 import하지 않는다 (순수 함수)
- DB 접근은 `server/db/` 리포지토리를 통해서만 (서비스에서 Prisma 직접 호출 금지)

## 작업 완료 조건
- pnpm check 통과 (typecheck + lint + 구조검증)
- 실시간 기능 변경 시 pnpm test:e2e 통과

## 명령어
pnpm dev / pnpm check / pnpm test / pnpm test:e2e

## Git 워크플로우

### 브랜치 전략
- **PoC 단계 (완료)**: main에 직접 커밋
- **MVP 개발 이후**: feature branch → main merge

### 작업 단위 흐름
1. 파악: 관련 docs + 영향 파일 확인, 불명확한 요구사항은 작업 전에 질문
2. 구현: pnpm check 통과 확인
3. 커밋: `git add <구체적 파일>` (git add . 사용 안 함)
4. PR/merge: 명시적으로 요청할 때만

### 커밋 타이밍
- MVP: Phase 완료마다 커밋 1회 (docs/plans/mvp.md의 Phase 구분 기준)

### 규칙
- 커밋/푸시는 명시적 요청 시에만
- force push, reset --hard 등 파괴적 작업은 요청해도 한 번 더 확인
- 커밋 메시지: `type: 설명` 형식 (feat / fix / chore / refactor / test / docs)
