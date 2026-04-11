import { createContext, useContext } from "react";
import { type MotionValue, useMotionValue } from "motion/react";

const ProximityContext = createContext<MotionValue<number> | null>(null);

export function useProximityMouseY(): MotionValue<number> | null {
  return useContext(ProximityContext);
}

/**
 * Wrap a container to track mouse Y for proximity-aware children.
 * Children with `proximity` prop will fade based on distance to cursor.
 */
export function ProximityProvider({ children }: { children: React.ReactNode }) {
  const mouseY = useMotionValue(-1000);

  return (
    <ProximityContext.Provider value={mouseY}>
      <div
        onMouseMove={(e) => mouseY.set(e.clientY)}
        onMouseLeave={() => mouseY.set(-1000)}
        style={{ display: "contents" }}
      >
        {children}
      </div>
    </ProximityContext.Provider>
  );
}
