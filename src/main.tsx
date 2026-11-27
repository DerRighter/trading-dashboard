import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ControlsProvider } from "./ui/state";
import { LocalApiProvider } from "./ui/local";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ControlsProvider>
      <LocalApiProvider>
        <App />
      </LocalApiProvider>
    </ControlsProvider>
  </StrictMode>,
);
