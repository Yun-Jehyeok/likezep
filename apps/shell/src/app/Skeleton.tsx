import { useMemo } from "react";
import { useLocation } from "react-router-dom";

/**
 * index.html의 <template id="sk-…">를 그대로 그린다.
 * 정적 스켈레톤(JS 번들 전)과 Suspense fallback(remote 로드 중)이 같은 마크업을 쓰게 해서,
 * React가 #root를 갈아끼울 때 화면이 바뀌지 않고 마크업도 한 곳(index.html)에서만 관리한다.
 */
function TemplateSkeleton({ id }: { id: string }) {
    const html = useMemo(() => document.getElementById(id)?.innerHTML ?? "", [id]);
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

/** learn remote를 받는 동안의 화면: 강의 목록(/learn) 또는 강의 상세(/learn/:id) 뼈대 */
export function LearnSkeleton() {
    const { pathname } = useLocation();
    const isList = /^\/learn\/?$/.test(pathname);
    return <TemplateSkeleton id={isList ? "sk-learn" : "sk-course"} />;
}
