import React from "react";
import ReactDOM from "react-dom/client";
import { StrictMode } from "react";
import RootApp from "./App"; // Import the RootApp from App.tsx

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>
);
