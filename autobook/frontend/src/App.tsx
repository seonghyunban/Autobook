import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { ClarificationPage } from "./pages/ClarificationPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LedgerPage } from "./pages/LedgerPage";
import { StatementsPage } from "./pages/StatementsPage";
import { TransactionPage } from "./pages/TransactionPage";

export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionPage />} />
        <Route path="/clarifications" element={<ClarificationPage />} />
        <Route path="/ledger" element={<LedgerPage />} />
        <Route path="/statements" element={<StatementsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}
