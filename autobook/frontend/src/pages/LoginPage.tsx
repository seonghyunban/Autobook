import { useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { BrandIcon } from "../components/BrandIcon";
import { PrimaryButton } from "../components/panels/shared/PrimaryButton";
import { FIELD_BASE_STYLE, palette, T } from "../components/panels/shared/tokens";
import s from "../components/panels/panels.module.css";

/**
 * Custom email/password login page. Stands outside the app shell — no
 * sidebar, no header, no footer. Just a centered card on a plain page
 * background with three vertically stacked sections:
 *
 *   ┌──────────────────────────┐
 *   │  [icon]  Autobook        │  ← header (icon placeholder + label,
 *   │  Invalid email or pwd    │     overlay error message when login fails)
 *   ├──────────────────────────┤
 *   │  Email     [_________]   │  ← body (email + password inputs)
 *   │  Password  [_________]   │
 *   ├──────────────────────────┤
 *   │              [ Enter ]   │  ← footer (single submit button)
 *   └──────────────────────────┘
 *
 * Submitting the form calls AuthProvider.signInWithPassword, which posts
 * to the backend /auth/password-login route. On a 401 we collapse to a
 * single overlay message ("Invalid email or password.") so the page
 * doesn't leak whether the email exists.
 *
 * Color tokens come from the shared palette/T tokens. Borders are
 * rounded everywhere per the simple v1 design.
 */
export function LoginPage() {
  const { isAuthenticated, signInWithPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Bounce to the original destination (or home).
  if (isAuthenticated) {
    const from = searchParams.get("from");
    return <Navigate to={from && from.startsWith("/") ? from : "/"} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await signInWithPassword(email.trim(), password);
      // On success the AuthProvider flips status; the next render bounces
      // via the isAuthenticated guard above.
    } catch (nextError) {
      const message =
        nextError instanceof Error
          ? nextError.message
          : "Invalid email or password.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        {/* ── Header ── brand icon + brand label ── */}
        <div style={headerStyle}>
          <BrandIcon size={40} gap={4} />
          <span style={brandLabelStyle}>Autobook</span>
        </div>

        {/* ── Body ── error banner (always reserved) + email + password ── */}
        <form onSubmit={handleSubmit} style={bodyStyle}>
          {/* Reserved slot so the layout doesn't shift when an error appears.
              When `error` is null the div is present but its contents are
              hidden via visibility: hidden — still takes vertical space. */}
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
            Email
            <ReviewStyleInput
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label style={fieldLabelStyle}>
            Password
            <ReviewStyleInput
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {/* ── Footer ── single Enter button ── */}
          <div style={footerStyle}>
            <PrimaryButton type="submit" size="sm" disabled={submitting}>
              {submitting ? "Signing in…" : "Enter"}
            </PrimaryButton>
          </div>
        </form>
      </section>
    </main>
  );
}

// ── Review-style input ────────────────────────────────────
// Mirrors `ReviewTextField`'s visual structure: a styled wrapper carries
// the box (charcoalBrown bg, padding, rounded corners, opacity hover)
// and a transparent native <input> sits inside. Used here so the email
// and password fields feel identical to every editable field in the
// review panel. We can't reuse `ReviewTextField` directly because it's
// a textarea internally — passwords need a real <input type="password">.

type ReviewStyleInputProps = React.InputHTMLAttributes<HTMLInputElement>;

function ReviewStyleInput(props: ReviewStyleInputProps) {
  const { style, ...rest } = props;
  const wrapperStyle: React.CSSProperties = {
    ...FIELD_BASE_STYLE,
    ...T.fieldBg,
    cursor: "text",
    ...style,
  };
  return (
    <div className={s.fieldHighlight} style={wrapperStyle}>
      <input {...rest} style={INNER_INPUT_STYLE} />
    </div>
  );
}

const INNER_INPUT_STYLE: React.CSSProperties = {
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

// ── Styles ────────────────────────────────────────────────
// Inline objects keep the page self-contained — no global CSS to leak
// the layout into the rest of the app. All borders are rounded per v1.

const ROUND = 8; // shared corner radius

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
  // Subtle: no border, muted background tint, burnt-orange text.
  // Forced to exactly 16px tall via explicit height + flex centering so
  // browser font metrics can't inflate it. The reserved slot always
  // occupies 16px whether the error is visible or hidden.
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

