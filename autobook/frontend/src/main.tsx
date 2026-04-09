import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { EntityProvider } from "./entity/EntityProvider";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <EntityProvider>
          <App />
        </EntityProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
