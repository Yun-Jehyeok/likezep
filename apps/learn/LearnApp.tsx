import { Routes, Route } from "react-router-dom";
import { CourseListPage } from "./src/features/learn/CourseListPage";
import { CoursePage } from "./src/features/learn/CoursePage";
import "./src/index.css";

export default function LearnApp() {
    return (
        <Routes>
            <Route index element={<CourseListPage />} />
            <Route path=":courseId" element={<CoursePage />} />
        </Routes>
    );
}
