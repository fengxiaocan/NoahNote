import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppDialogsProvider } from "./components/AppDialogs";
import "./styles/app.css";
import "./styles/command.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppDialogsProvider><App /></AppDialogsProvider>
  </StrictMode>,
);
