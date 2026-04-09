import { Sidebar } from "./Sidebar";

/**
 * Left grid slot of the app shell. Transparent and padded — it just reserves
 * the column width and provides breathing room around the floating `Sidebar`
 * panel that lives inside.
 *
 * The grid's `auto` column follows the inner Sidebar's intrinsic width
 * (240 expanded / 56 collapsed) plus this slot's padding.
 *
 * `id="app-sidebar"` matches the `aria-controls` on the toggle button
 * inside Sidebar so screen readers can connect them.
 */
export function AppSidebar() {
  return (
    <aside
      id="app-sidebar"
      style={{
        gridArea: "sidebar",
        padding: "20px 0 20px 20px",
        background: "#FFFCF2", // floralWhite
        display: "flex",
      }}
    >
      <Sidebar />
    </aside>
  );
}
