import { SectionSubheader } from "../../shared/SectionSubheader";

export function ReviewSubsection({ title, gap = 8, children }: {
  title: string;
  gap?: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      <SectionSubheader>{title}</SectionSubheader>
      {children}
    </div>
  );
}
