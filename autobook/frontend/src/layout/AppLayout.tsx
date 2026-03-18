import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

type AppLayoutProps = {
  children: ReactNode;
};

const navItems = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/transactions", label: "Transaction" },
  { to: "/clarifications", label: "Clarifications" },
  { to: "/ledger", label: "Ledger" },
  { to: "/statements", label: "Statements" },
];

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Startup Demo</p>
          <h1>{import.meta.env.VITE_APP_NAME ?? "AI Accountant"}</h1>
        </div>
        <p className="topbar-copy">
          Natural language bookkeeping with confidence-gated review.
        </p>
      </header>

      <nav className="nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              isActive ? "nav-link nav-link-active" : "nav-link"
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="content">{children}</main>
    </div>
  );
}
