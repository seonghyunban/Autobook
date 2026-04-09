import { T } from "../panels/shared/tokens";

/**
 * Bottom bar of the app shell. Holds a right-aligned credit line.
 *
 * Self-places into the `footer` grid area of `AppShell`. `minHeight: 24`
 * gives the row a floor (status-bar height) so it stays visible even with
 * minimal content; can grow if content needs more space.
 */
export function AppFooter() {
  return (
    <footer
      style={{
        gridArea: "footer",
        minHeight: 24,
        background: "#FFFCF2", // floralWhite
        borderTop: "1px solid rgba(64, 61, 57, 0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 16px",
        fontSize: 11,
        fontWeight: 400,
        color: T.textSecondary,
        opacity: 0.6,
        letterSpacing: "0.02em",
      }}
    >
      © 2026 Seonghyun Ban. All rights reserved.
    </footer>
  );
}
