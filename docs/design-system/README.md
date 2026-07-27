# Wanted Design System — 로컬 Export

출처: https://www.figma.com/design/sU6h8D1zkwkdUdMlA0dEVe/Wanted-Design-System--Community-

## 파일 목록

### 최상위
| 파일 | 내용 |
|---|---|
| `overview.png` | 전체 개요 — 소개, 색상 팔레트, Pretendard 폰트, 네비게이션 예시 |
| `resource.png` | Resource 페이지 |

### components/
| 파일 | 섹션 | 포함 컴포넌트 |
|---|---|---|
| `1-layout.png` | 1 Layout | 레이아웃 구조 |
| `2-action.png` | 2 Action | Button, Text Button, Icon Button, Chip, Toggle Icon, Action Area |
| `3-selection-input.png` | 3 Selection and Input | Textfield, Textarea, Select, Radio, Checkbox, Toggle, Segmented Control, Counter |
| `4-content.png` | 4 Content | Icon, Content Badge, Thumbnail, Avatar, List Cell, Card |
| `5-loading.png` | 5 Loading | Circular Spinner, Skeleton (Text/Rectangle/Circle) |
| `6-navigation.png` | 6 Navigation | Tab, Category Chip, Page Indicator, Pagination |
| `7-feedback.png` | 7 Feedback | Alert, Toast, Snackbar, Menu |
| `8-presentation.png` | 8 Presentation | Tooltip |

### theme/
| 파일 | 내용 |
|---|---|
| `theme-logo-icons.png` | Theme 페이지 전체 (로고 + 아이콘) |
| `icons.png` | 아이콘 라이브러리 (Normal, Chevron 등 100+ 아이콘) |
| `element-basic-spacing-decorate.png` | Element 페이지 — Ratio, Spacing, Gradient, Interaction |

## 핵심 디자인 토큰 (overview.png 기반)

- **폰트**: Pretendard (한국어 최적화)
- **Primary 색상**: Wanted 브랜드 블루
- **라이트/다크 모드**: 둘 다 지원
- **컴포넌트 스타일**: 라운드 코너, 클린 미니멀

## MVP 화면별 참조 파일

| 화면 | 참조 파일 |
|---|---|
| LoginPage | `2-action.png` (Button), `3-selection-input.png` (Textfield) |
| LobbyPage | `4-content.png` (Card), `6-navigation.png` (Tab) |
| RoomPage | `2-action.png` (Button/Icon Button), `7-feedback.png` (Toast) |
| AdminPage | `4-content.png` (List Cell), `6-navigation.png` (Tab), `7-feedback.png` (Alert) |
