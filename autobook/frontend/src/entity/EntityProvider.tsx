import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchEntities, type EntityItem } from "../api/entities";
import { useAuth } from "../auth/AuthProvider";

const STORAGE_KEY = "autobook.active_entity_id";
const CACHED_ENTITIES_KEY = "autobook.cached_entities";

function getCachedEntities(): EntityItem[] {
  try {
    const raw = localStorage.getItem(CACHED_ENTITIES_KEY);
    return raw ? (JSON.parse(raw) as EntityItem[]) : [];
  } catch { return []; }
}

function setCachedEntities(items: EntityItem[]) {
  try { localStorage.setItem(CACHED_ENTITIES_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

type EntityContextValue = {
  entities: EntityItem[];
  activeEntity: EntityItem | null;
  setActiveEntityId: (id: string) => void;
  loading: boolean;
  refetch: () => Promise<void>;
};

const EntityContext = createContext<EntityContextValue | null>(null);

export function EntityProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  // Resolve from cache synchronously — no flash
  const [initial] = useState(() => {
    const cached = getCachedEntities();
    const storedId = localStorage.getItem(STORAGE_KEY);
    return { cached, storedId };
  });

  const [entities, setEntities] = useState<EntityItem[]>(initial.cached);
  const [activeId, setActiveId] = useState<string | null>(initial.storedId);
  const [loading, setLoading] = useState(initial.cached.length === 0);

  const loadEntities = useCallback(async () => {
    try {
      const items = await fetchEntities();
      setEntities(items);
      setCachedEntities(items);
      const storedId = localStorage.getItem(STORAGE_KEY);
      const match = items.find((e) => e.id === storedId);
      const selected = match ?? items[0] ?? null;
      setActiveId(selected?.id ?? null);
      if (selected) {
        try { localStorage.setItem(STORAGE_KEY, selected.id); } catch { /* ignore */ }
      }
    } catch {
      // Only clear if we had no cache to begin with
      if (getCachedEntities().length === 0) {
        setEntities([]);
        setActiveId(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setEntities([]);
      setActiveId(null);
      setLoading(false);
      return;
    }
    void loadEntities();
  }, [isAuthenticated, loadEntities]);

  function setActiveEntityId(id: string) {
    setActiveId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }

  const activeEntity = useMemo(
    () => entities.find((e) => e.id === activeId) ?? null,
    [entities, activeId],
  );

  const value = useMemo<EntityContextValue>(
    () => ({ entities, activeEntity, setActiveEntityId, loading, refetch: loadEntities }),
    [entities, activeEntity, loading, loadEntities],
  );

  return <EntityContext.Provider value={value}>{children}</EntityContext.Provider>;
}

export function useEntity() {
  const ctx = useContext(EntityContext);
  if (!ctx) {
    throw new Error("useEntity must be used inside <EntityProvider>");
  }
  return ctx;
}

export function useActiveEntityId(): string | null {
  return useEntity().activeEntity?.id ?? null;
}
