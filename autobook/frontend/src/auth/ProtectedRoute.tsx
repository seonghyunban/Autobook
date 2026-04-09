import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { useEntity } from "../entity/EntityProvider";
import { OnboardingPage } from "../pages/OnboardingPage";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, isAuthenticated } = useAuth();
  const { entities, loading: entitiesLoading } = useEntity();
  const location = useLocation();

  if (status === "loading") {
    return <p>Checking session…</p>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (entitiesLoading) {
    return <p>Loading…</p>;
  }

  if (entities.length === 0) {
    return <OnboardingPage />;
  }

  return <>{children}</>;
}
