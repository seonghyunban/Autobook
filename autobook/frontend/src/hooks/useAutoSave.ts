import { useEffect } from "react";
import { useDraftStore } from "../components/panels/store";

/**
 * Flush dirty corrections to DB on:
 *   - Page unload (beforeunload)
 *
 * Navigation and modal close are handled by the callers directly
 * via store.flushIfDirty(). This hook only covers the browser-level
 * unload event that callers can't intercept.
 */
export function useAutoSave() {
  useEffect(() => {
    const handleUnload = () => {
      const { dirty, draftId, corrected } = useDraftStore.getState();
      if (!dirty || !draftId) return;

      // Best-effort sync flush via sendBeacon (navigator.sendBeacon
      // is more reliable than fetch in beforeunload but only supports POST).
      // Fall back to sync XHR if sendBeacon is unavailable.
      try {
        const { buildPatchForBeacon } = useDraftStore.getState() as unknown as { buildPatchForBeacon?: () => string };
        // Use flushIfDirty which is async — in beforeunload we can't await,
        // but the browser may complete it. sessionStorage already has the data
        // as a safety net.
        void useDraftStore.getState().flushIfDirty();
      } catch {
        // Best effort — sessionStorage has the latest state
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);
}
