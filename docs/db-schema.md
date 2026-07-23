# ZEP 대체 온라인 멘토링 플랫폼 — DB 스키마 설계

## 0. DB 선택

**PostgreSQL** (Docker 컨테이너로 EC2에 함께 배치, 규모 확대 시 RDS 이전 검토)

선택 이유:
- 유저/그룹/로그 등 관계형 데이터 중심이라 RDB가 자연스러움
- Node.js 생태계(Prisma, Drizzle 등 ORM)와 궁합이 좋음
- 초기 규모(30~50명)에서는 EC2 내 Docker 컨테이너로 충분, 관리 부담 최소

> ORM은 **Prisma** 권장 (스키마 선언 → 마이그레이션 자동화, TypeScript 타입 자동 생성이 Colyseus/React 풀 TS 스택과 잘 맞음)

## 1. ERD 개요

```
users ──< chat_messages >── rooms
  │                           │
  │ (group_id FK, nullable)   │ (group_id FK, nullable)
  └────────> groups <─────────┘
  │
  └──< access_logs >── rooms
```

- 멘티는 **하나의 그룹**에만 소속 (users.group_id)
- 그룹 1개 = 프라이빗 룸 1개 (그룹 생성 시 자동 생성)
- 공용 공간(광장/회의실)은 group_id가 NULL인 rooms 레코드
- Admin/외부 멘토는 그룹 소속 없음 (group_id NULL + role로 구분)

## 2. 테이블 정의

### users
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| google_id | varchar | UNIQUE, NOT NULL | Google OAuth sub 클레임 |
| email | varchar | UNIQUE, NOT NULL | |
| name | varchar | NOT NULL | 표시 이름 (Google 프로필명, 수정 가능) |
| role | enum('admin','mentor','mentee') | NOT NULL, default 'mentee' | |
| group_id | uuid | FK → groups.id, NULLABLE | 멘티만 사용. NULL이면 배정 대기 상태 |
| created_at | timestamptz | default now() | |
| last_login_at | timestamptz | NULLABLE | |

인덱스: `google_id`(unique), `group_id`

**역할별 group_id 규칙**
- `mentee`: 배정 전 NULL → 배정 후 그룹 id
- `mentor` / `admin`: 항상 NULL (전체 룸 접근이라 소속 개념 없음)

### groups
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| name | varchar | NOT NULL, UNIQUE | 그룹명 (예: "3기 A그룹") |
| created_at | timestamptz | default now() | |

> 그룹 삭제 시: 소속 멘티의 group_id를 NULL로(배정 대기로 되돌림), 연결된 프라이빗 룸은 비활성화(soft delete) — 채팅/로그 기록 보존을 위해 하드 삭제하지 않음

### rooms
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| name | varchar | NOT NULL | 룸 표시 이름 (예: "A그룹 룸", "광장") |
| type | enum('private','public') | NOT NULL | private=그룹 룸, public=공용 공간 |
| group_id | uuid | FK → groups.id, NULLABLE | private일 때만 값 존재 (1:1) |
| map_key | varchar | NOT NULL | 사용할 Tiled 맵 식별자 (예: 'default', 'plaza') |
| is_active | boolean | default true | 그룹 삭제 시 false (soft delete) |
| created_at | timestamptz | default now() | |

인덱스: `group_id`(unique, partial: WHERE group_id IS NOT NULL), `type`

> Colyseus의 런타임 room 인스턴스와 이 테이블의 관계: DB의 rooms가 "정의"이고, Colyseus room은 그 정의를 기반으로 생성되는 런타임 인스턴스. Colyseus room 생성 시 `roomId`를 DB의 rooms.id와 동일하게 지정해 매핑.

### chat_messages
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | bigserial | PK | 대량 적재 대비 bigserial |
| room_id | uuid | FK → rooms.id, NOT NULL | |
| user_id | uuid | FK → users.id, NOT NULL | |
| content | text | NOT NULL | 메시지 본문 (최대 길이는 앱 레벨에서 제한, 예: 1000자) |
| created_at | timestamptz | default now() | |

인덱스: `(room_id, created_at DESC)` — 룸별 최근 메시지 조회용 복합 인덱스

**저장 흐름**: 클라이언트 chat 메시지 → Colyseus 서버가 브로드캐스트와 동시에 DB INSERT (비동기, 실패해도 브로드캐스트는 유지)
**조회 흐름**: 룸 입장 시 REST API로 최근 N개(예: 50개) 로드, 무한 스크롤 시 `before` 커서 페이지네이션

### access_logs
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | bigserial | PK | |
| user_id | uuid | FK → users.id, NOT NULL | |
| room_id | uuid | FK → rooms.id, NOT NULL | |
| event | enum('join','leave') | NOT NULL | |
| created_at | timestamptz | default now() | |

인덱스: `(user_id, created_at)`, `(room_id, created_at)`

**기록 시점**: Colyseus `onJoin` / `onLeave` 훅에서 INSERT
**통계 산출**: join~leave 쌍을 매칭해 세션 시간 계산 (비정상 종료로 leave가 없는 경우, Colyseus의 연결 끊김 감지 시점에 leave 기록 — onLeave는 비정상 종료에도 호출됨)

## 3. 마이그레이션/시드 전략

- Prisma Migrate로 스키마 버전 관리
- 시드 데이터:
  - 공용 공간 rooms 2개 (광장, 회의실) — 초기 시드로 고정 생성
  - 최초 Admin 계정: 첫 로그인한 특정 이메일(본인 Gmail)을 환경변수 `ADMIN_EMAIL`로 지정해 자동 admin 부여

## 4. 확장 대비 노트

- **아바타 커스터마이징 (추후)**: `users`에 `avatar_config jsonb` 컬럼 추가만으로 대응 가능 (레이어 구조 설정값 저장)
- **채팅 기록 증가 대비**: chat_messages는 시간 기준 파티셔닝 가능하나 현 규모에서는 불필요, 인덱스로 충분
- **멘토별 담당 그룹 (추후 정책 변경 시)**: 현재는 멘토가 전체 접근이지만, 담당제로 바뀌면 `mentor_groups(user_id, group_id)` 조인 테이블 추가로 대응
