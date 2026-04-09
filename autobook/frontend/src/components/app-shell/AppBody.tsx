import type { ReactNode } from "react";

/**
 * Main content slot of the app shell. The page component (e.g.
 * `<LLMInteractionPage />`) is passed as children and rendered here.
 *
 * `<main>` landmark for accessibility, scrollable container via
 * `overflow: auto`, and `min-width: 0` + `min-height: 0` to prevent
 * long-text / wide-table content from blowing out the grid column.
 *
 * Self-places into the `body` grid area of `AppShell`.
 */
export function AppBody({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        gridArea: "body",
        overflow: "auto",
        minWidth: 0,
        minHeight: 0,
        background: "#FFFCF2", // floralWhite — shell owns the canvas
      }}
    >
      {children}
    </main>
  );
}
