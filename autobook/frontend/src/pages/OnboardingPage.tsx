import { useState, type FormEvent } from "react";
import { BrandIcon } from "../components/BrandIcon";
import { PrimaryButton } from "../components/panels/shared/PrimaryButton";
import { FIELD_BASE_STYLE, palette, T } from "../components/panels/shared/tokens";
import s from "../components/panels/panels.module.css";
import { createEntity } from "../api/entities";
import { useEntity } from "../entity/EntityProvider";

/**
 * Onboarding page — shown when the user has no entities.
 * Same visual style as LoginPage: centered card, brand header, single field.
 */
export function OnboardingPage() {
  const { refetch } = useEntity();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await createEntity(name.trim());
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={headerStyle}>
          <BrandIcon size={40} gap={4} />
          <span style={brandLabelStyle}>Autobook</span>
        </div>

        <form onSubmit={handleSubmit} style={bodyStyle}>
          <div
            role="alert"
            style={{
              ...errorBannerStyle,
              visibility: error ? "visible" : "hidden",
            }}
          >
            {error ?? "\u00a0"}
          </div>

          <label style={fieldLabelStyle}>
            Organization Name
            <div className={s.fieldHighlight} style={{ ...FIELD_BASE_STYLE, ...T.fieldBg, cursor: "text" }}>
              <input
                type="text"
                required
                autoFocus
                placeholder="Acme Corp"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={innerInputStyle}
              />
            </div>
          </label>

          <div style={footerStyle}>
            <PrimaryButton type="submit" size="sm" disabled={submitting || !name.trim()}>
              {submitting ? "Creating..." : "Continue"}
            </PrimaryButton>
          </div>
        </form>
      </section>
    </main>
  );
}

const innerInputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  margin: 0,
  padding: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  lineHeight: "16px",
};

const ROUND = 8;

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: T.pageBg,
  color: T.pageText,
  fontFamily: T.pageFont,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  boxSizing: "border-box",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 380,
  background: "rgba(204, 197, 185, 0.15)",
  borderRadius: ROUND * 2,
  padding: 28,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  paddingBottom: 16,
  borderBottom: `1px solid ${T.inputBorder}`,
};

const brandLabelStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: T.textPrimary,
  letterSpacing: "0.02em",
};

const errorBannerStyle: React.CSSProperties = {
  background: "rgba(192, 64, 0, 0.08)",
  color: palette.burntOrange,
  borderRadius: ROUND,
  height: 24,
  boxSizing: "border-box",
  padding: "0 10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  lineHeight: 1,
  fontWeight: 500,
  textAlign: "center",
};

const bodyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const fieldLabelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 10,
  fontWeight: 500,
  color: T.textSecondary,
  opacity: 0.7,
  letterSpacing: "0.02em",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  paddingTop: 24,
};
