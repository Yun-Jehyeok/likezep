import { useState } from "react";
import { useNavigate } from "react-router-dom";

const CATEGORIES = ["전체", "코딩테스트", "알고리즘", "자료구조", "시스템 설계", "CS 기초"];

const COURSES = [
    {
        id: "1",
        category: "코딩테스트",
        title: "코딩테스트 완전 정복",
        description: "DFS/BFS, 동적 프로그래밍, 그래프 이론 등 코딩테스트 핵심 알고리즘을 단계별로 학습합니다.",
        lessonCount: 24,
        completedCount: 8,
        thumbnailBg: "#e8f1ff",
        iconColor: "#0071ff",
    },
    {
        id: "2",
        category: "자료구조",
        title: "자료구조 완전 정복",
        description: "스택, 큐, 힙, 트리, 그래프를 직접 구현하며 자료구조를 완벽하게 이해합니다.",
        lessonCount: 16,
        completedCount: 0,
        thumbnailBg: "#f0ebff",
        iconColor: "#7c3aed",
    },
    {
        id: "3",
        category: "알고리즘",
        title: "알고리즘 심화 과정",
        description: "투 포인터, 슬라이딩 윈도우, 분할 정복 등 고급 알고리즘 패턴을 마스터합니다.",
        lessonCount: 20,
        completedCount: 20,
        thumbnailBg: "#e8f7ee",
        iconColor: "#1a7a3f",
    },
    {
        id: "4",
        category: "시스템 설계",
        title: "시스템 설계 입문",
        description: "대규모 시스템 설계의 기초부터 실전 면접 대비까지 체계적으로 학습합니다.",
        lessonCount: 12,
        completedCount: 3,
        thumbnailBg: "#fff7e8",
        iconColor: "#e05c00",
    },
    {
        id: "5",
        category: "CS 기초",
        title: "CS 기초 완성",
        description: "운영체제, 네트워크, 데이터베이스 핵심 개념을 면접 관점에서 정리합니다.",
        lessonCount: 18,
        completedCount: 0,
        thumbnailBg: "#fff1f0",
        iconColor: "#e03131",
    },
    {
        id: "6",
        category: "코딩테스트",
        title: "SQL 코딩테스트 완성",
        description: "프로그래머스, 리트코드 SQL 문제를 풀며 데이터베이스 쿼리 실력을 키웁니다.",
        lessonCount: 10,
        completedCount: 5,
        thumbnailBg: "#e8f1ff",
        iconColor: "#0071ff",
    },
];

type Course = typeof COURSES[0];

export function CourseListPage() {
    const [selectedCategory, setSelectedCategory] = useState("전체");
    const navigate = useNavigate();

    const filtered =
        selectedCategory === "전체" ? COURSES : COURSES.filter((c) => c.category === selectedCategory);

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* GNB */}
            <header className="bg-white border-b border-border px-6 h-14 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#0071ff] flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
                            <path d="M4 5h14M4 11h14M4 17h8" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                        </svg>
                    </div>
                    <span className="text-[15px] font-bold text-text-primary">멘토링 플랫폼</span>
                    <span className="text-text-disabled text-sm mx-0.5">/</span>
                    <span className="text-[15px] text-text-secondary">강의실</span>
                </div>
                <button
                    type="button"
                    onClick={() => navigate("/lobby")}
                    className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    로비로 돌아가기
                </button>
            </header>

            <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
                {/* Page title */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-text-primary">강의실</h1>
                    <p className="text-sm text-text-secondary mt-1">원하는 강의를 선택하여 학습을 시작하세요</p>
                </div>

                {/* Category chips */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                selectedCategory === cat
                                    ? "bg-[#0071ff] text-white"
                                    : "bg-white border border-border text-text-secondary hover:border-[#0071ff] hover:text-[#0071ff]"
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Course grid */}
                {filtered.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filtered.map((course) => (
                            <CourseCard
                                key={course.id}
                                course={course}
                                onClick={() => navigate(course.id)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-[#f0f0f0] flex items-center justify-center mb-4">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#b2b2b2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <p className="text-[15px] font-medium text-text-secondary">준비 중인 강의입니다</p>
                        <p className="text-sm text-text-disabled mt-1">곧 업데이트될 예정입니다</p>
                    </div>
                )}
            </main>
        </div>
    );
}

function CourseCard({ course, onClick }: { course: Course; onClick: () => void }) {
    const progress = Math.round((course.completedCount / course.lessonCount) * 100);
    const status =
        course.completedCount === 0 ? "미시작" : course.completedCount === course.lessonCount ? "완료" : "진행 중";
    const statusStyle =
        status === "완료"
            ? "bg-[#e8f7ee] text-[#1a7a3f]"
            : status === "진행 중"
              ? "bg-[#e8f1ff] text-[#0071ff]"
              : "bg-[#f0f0f0] text-text-secondary";

    return (
        <button
            type="button"
            onClick={onClick}
            className="bg-white rounded-2xl border border-border hover:border-[#0071ff] hover:shadow-[0_4px_20px_rgba(0,113,255,0.1)] text-left transition-all group overflow-hidden"
        >
            {/* Thumbnail */}
            <div
                className="h-36 flex items-center justify-center"
                style={{ backgroundColor: course.thumbnailBg }}
            >
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 004 22h16v-5H6.5A2.5 2.5 0 004 19.5zM4 19.5V5a2 2 0 012-2h12a2 2 0 012 2v10"
                        stroke={course.iconColor}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M9 7h6M9 11h4"
                        stroke={course.iconColor}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                    />
                </svg>
            </div>

            {/* Body */}
            <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#f4f6f9] text-text-secondary">
                        {course.category}
                    </span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusStyle}`}>
                        {status}
                    </span>
                </div>

                <h3 className="text-[15px] font-semibold text-text-primary group-hover:text-[#0071ff] transition-colors mb-1 line-clamp-1">
                    {course.title}
                </h3>
                <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-2 mb-4">
                    {course.description}
                </p>

                {/* Progress */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12px] text-text-secondary">
                            {course.completedCount} / {course.lessonCount}강
                        </span>
                        <span className="text-[12px] font-semibold text-text-primary">{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[#0071ff] rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>
        </button>
    );
}
