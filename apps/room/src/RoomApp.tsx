import { Routes, Route } from "react-router-dom";
import { RoomPage } from "./features/room/RoomPage.js";
import "./index.css";

export default function RoomApp() {
    return (
        <Routes>
            <Route path=":roomId" element={<RoomPage />} />
        </Routes>
    );
}
