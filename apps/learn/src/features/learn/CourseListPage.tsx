import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CourseListItem } from "../../api";

const CATEGORIES = ["전체", "코딩테스트", "알고리즘", "자료구조", "시스템 설계", "CS 기초"];

const CATEGORY_COLORS: Record<string, { bg: string; icon: string }> = {
    "코딩테스트": { bg: "#e8f1ff", icon: "#0071ff" },
    "알고리즘":   { bg: "#e8f7ee", icon: "#1a7a3f" },
    "자료구조":   { bg: "#f0ebff", icon: "#7c3aed" },
    "시스템 설계": { bg: "#fff7e8", icon: "#e05c00" },
    "CS 기초":   { bg: "#fff1f0", icon: "#e03131" },
};
const DEFAULT_COLORS = { bg: "#f4f6f9", icon: "#666666" };

export function CourseListPage() {
    const [selectedCategory, setSelectedCategory] = useState("전체");
    const [courses, setCourses] = useState<CourseListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        setLoading(true);
        const query = selectedCategory === "전체" ? "" : `?category=${encodeURIComponent(selectedCategory)}`;
        api.get<CourseListItem[]>(`/api/courses${query}`)
            .then(setCourses)
            .catch(() => setCourses([]))
            .finally(() => setLoading(false));
    }, [selectedCategory]);

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

                {/* Loading */}
                {loading ? (
                    <div className="flex justify-center py-24">
                        <div className="w-8 h-8 border-2 border-[#0071ff] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : courses.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {courses.map((course) => (
                            <CourseCard
                                key={course.id}
                                course={course}
                                onClick={() => navigate(String(course.id))}
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

function CourseCard({ course, onClick }: { course: CourseListItem; onClick: () => void }) {
    const progress = course.lessonCount > 0
        ? Math.round((course.completedCount / course.lessonCount) * 100)
        : 0;
    const status =
        course.completedCount === 0 ? "미시작"
        : course.completedCount === course.lessonCount ? "완료"
        : "진행 중";
    const statusStyle =
        status === "완료"
            ? "bg-[#e8f7ee] text-[#1a7a3f]"
            : status === "진행 중"
              ? "bg-[#e8f1ff] text-[#0071ff]"
              : "bg-[#f0f0f0] text-text-secondary";
    const colors = CATEGORY_COLORS[course.category] ?? DEFAULT_COLORS;

    return (
        <button
            type="button"
            onClick={onClick}
            className="bg-white rounded-2xl border border-border hover:border-[#0071ff] hover:shadow-[0_4px_20px_rgba(0,113,255,0.1)] text-left transition-all group overflow-hidden"
        >
            {/* Thumbnail */}
            <div className="h-36 flex items-center justify-center overflow-hidden" style={{ backgroundColor: colors.bg }}>
                {course.thumbnail ? (
                    <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
                ) : (
                    <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
                        <path
                            d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 004 22h16v-5H6.5A2.5 2.5 0 004 19.5zM4 19.5V5a2 2 0 012-2h12a2 2 0 012 2v10"
                            stroke={colors.icon}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        <path d="M9 7h6M9 11h4" stroke={colors.icon} strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                )}
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
                    {course.description ?? ""}
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
