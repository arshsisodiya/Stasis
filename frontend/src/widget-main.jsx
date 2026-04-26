import { createRoot } from "react-dom/client";
import TaskbarWidget from "./shared/TaskbarWidget";
import "./widget.css";

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:7432";

createRoot(document.getElementById("root")).render(
  <TaskbarWidget BASE={BASE} />
);
