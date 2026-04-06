import { useCallback, useEffect, useRef, useState } from "react";

export function useContainerSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const pendingSize = useRef<{ width: number; height: number } | null>(null);
  const mouseDown = useRef(false);

  const updateSize = useCallback(() => {
    if (ref.current) {
      const { width, height } = ref.current.getBoundingClientRect();
      setSize({ width, height });
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Set initial size immediately
    updateSize();

    // Track mouse state globally
    function onMouseDown() { mouseDown.current = true; }
    function onMouseUp() {
      mouseDown.current = false;
      // Apply pending size if any
      if (pendingSize.current) {
        setSize(pendingSize.current);
        pendingSize.current = null;
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);

    const observer = new ResizeObserver(() => {
      if (!ref.current) return;
      const { width, height } = ref.current.getBoundingClientRect();

      if (mouseDown.current) {
        // Stash for later — don't update state during drag
        pendingSize.current = { width, height };
      } else {
        // No mouse down — update immediately (e.g., fullscreen toggle, modal open)
        setSize({ width, height });
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [updateSize]);

  return { ref, ...size };
}
