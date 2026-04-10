import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchDrafts, type DraftListItem } from "../api/drafts";
import { panel, palette, T, PanelHeader } from "../components/panels/shared";
import s from "../components/panels/panels.module.css";

export function HistoryPage() {
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    fetchDrafts()
      .then(setDrafts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      style={{
        height: "100%",
        padding: 20,
        boxSizing: "border-box",
        fontFamily: T.pageFont,
        color: T.pageText,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
        <section style={{ ...panel, flex: 1, minHeight: 0, overflow: "hidden" }}>
          <PanelHeader title="Draft History" help="Past transactions processed by the agent." />

          {loading && <p style={{ fontSize: 13, color: T.textSecondary }}>Loading...</p>}
          {error && <p style={{ fontSize: 13, color: T.errorText }}>{error}</p>}

          {!loading && !error && drafts.length === 0 && (
            <p style={{ fontSize: 13, color: T.textSecondary, opacity: 0.6 }}>No drafts yet. Submit a transaction to get started.</p>
          )}

          {!loading && drafts.length > 0 && (
            <div className={s.scrollable} style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0 }}>
              {drafts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => navigate(`/history/${d.id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.25)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Decision badge */}
                  <span
                    style={{
                      flexShrink: 0,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: d.decision === "PROCEED"
                        ? palette.fern
                        : d.decision === "MISSING_INFO"
                        ? palette.deepSaffron
                        : d.decision === "STUCK"
                        ? palette.burntOrange
                        : palette.silver,
                    }}
                  />

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: palette.carbonBlack,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {d.raw_text}
                    </div>
                    <div style={{ fontSize: 11, color: T.textSecondary, opacity: 0.6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>
                        {new Date(d.created_at).toLocaleString()}
                        {d.decision && <> · {d.decision}</>}
                      </span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 500,
                        lineHeight: 1,
                        padding: "3px 8px",
                        borderRadius: 10,
                        ...(d.review_status === "reviewed"
                          ? { color: palette.fern, background: "rgba(79, 119, 45, 0.1)" }
                          : d.review_status === "in_review"
                          ? { color: palette.deepSaffron, background: "rgba(255, 143, 0, 0.1)" }
                          : { color: T.textSecondary, background: "rgba(204, 197, 185, 0.25)" }),
                        opacity: 1,
                      }}>
                        {d.review_status === "reviewed" ? "Reviewed" : d.review_status === "in_review" ? "In Review" : "Not Reviewed"}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
