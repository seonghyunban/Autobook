import { palette } from "../panels/shared/tokens";
import { BrandIcon } from "../BrandIcon";
import { EntitySwitcher } from "../../entity/EntitySwitcher";

/**
 * Fixed width of the header's left (brand) section.
 *
 * Matches the AppSidebar grid slot width when the sidebar is fully expanded:
 *   Sidebar panel (240) + AppSidebar padding (16 × 2) = 272
 *
 * Using the *max* width (not the live collapsed/expanded width) keeps the
 * "Autobook" brand anchored in a stable position as the sidebar toggles.
 */
const SIDEBAR_SLOT_WIDTH = 272;

/**
 * Top bar of the app shell. Holds the "Autobook" brand in a fixed-width
 * left section that lines up with the expanded AppSidebar slot. The rest
 * of the bar is intentionally empty space.
 *
 * Self-places into the `header` grid area of `AppShell`. `minHeight: 48`
 * gives the row a floor (~industry-standard compact desktop header).
 */
export function AppHeader() {
  return (
    <header
      style={{
        gridArea: "header",
        minHeight: 48,
        background: "#FFFCF2", // floralWhite
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: SIDEBAR_SLOT_WIDTH,
          flexShrink: 0,
          marginTop: 16,
          padding: "0 32px", // header padding (16) + AppSidebar slot padding (16) → aligns "Autobook" with the Sidebar panel's left edge
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 16,
          fontWeight: 700,
          color: palette.carbonBlack,
          letterSpacing: "-0.01em",
        }}
      >
        <BrandIcon size={24} />
        Autobook
      </div>
      <div
        style={{
          flex: 1,
          marginTop: 16,
          padding: "0 16px 0 0",
          display: "flex",
          alignItems: "center",
        }}
      >
        <EntitySwitcher />
      </div>
    </header>
  );
}
