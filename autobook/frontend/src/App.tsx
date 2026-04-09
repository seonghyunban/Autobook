import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShellLayout } from "./components/app-shell";
import { LoginPage } from "./pages/LoginPage";
import { EntryDrafterPage } from "./pages/EntryDrafterPage";
import { HistoryPage } from "./pages/HistoryPage";
import { EntryViewerPage } from "./pages/EntryViewerPage";

/**
 * Protected LLM shell — sidebar + auth gate.
 */
function ProtectedAppShell() {
  return (
    <ProtectedRoute>
      <AppShellLayout />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected — app shell */}
      <Route element={<ProtectedAppShell />}>
        <Route path="/draft" element={<EntryDrafterPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/history/:draftId" element={<EntryViewerPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/draft" replace />} />
    </Routes>
  );
}
