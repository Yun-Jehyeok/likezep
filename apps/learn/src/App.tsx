import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CourseListPage } from "./features/learn/CourseListPage";
import { CoursePage } from "./features/learn/CoursePage";

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route index element={<CourseListPage />} />
                <Route path=":courseId" element={<CoursePage />} />
            </Routes>
        </BrowserRouter>
    );
}
