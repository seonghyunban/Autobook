import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook that measures content height via ResizeObserver and returns
 * a style object with explicit height + transition for smooth animation.
 *
 * Call `skipTransition(ms)` to temporarily snap height (no transition)
 * and set overflow:visible — use during FLIP animations.
 */
export function useAnimatedHeight(duration = 200) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const initialized = useRef(false);
  const [paused, setPaused] = useState(false);
  const pauseTimer = useRef<ReturnType<typeof setTimeout>>();

  const skipTransition = useCallback((ms = 400) => {
    setPaused(true);
    clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => setPaused(false), ms);
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        setHeight(h);
      }
    });

    setHeight(el.offsetHeight);
    requestAnimationFrame(() => {
      initialized.current = true;
    });

    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(pauseTimer.current); };
  }, []);

  const style: React.CSSProperties = {
    height: height != null ? height : "auto",
    overflow: paused ? "visible" : "hidden",
    transition: (initialized.current && !paused) ? `height ${duration}ms ease` : "none",
  };

  return { contentRef, style, skipTransition };
}
