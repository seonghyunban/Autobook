import { SectionSubheader } from "../../shared/SectionSubheader";
import { T } from "../../shared/tokens";

export function ReviewSubsection({ title, explanation, gap = 8, children }: {
  title: string;
  explanation?: string;
  gap?: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      <SectionSubheader>{title}</SectionSubheader>
      {explanation && (
        <div style={{ fontSize: 11, color: T.textSecondary, textAlign: "center", lineHeight: 1.6 }}>
          {explanation}
        </div>
      )}
      {children}
    </div>
  );
}
