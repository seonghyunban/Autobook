import { useState } from "react";
import { RiArrowUpSLine, RiArrowDownSLine } from "react-icons/ri";
import { T } from "./tokens";
import { SectionSubheader } from "./SectionSubheader";
import s from "../panels.module.css";

export function TransactionDisplay({ text }: { text: string }) {
  const [open, setOpen] = useState(true);

  if (!text) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, cursor: "pointer", userSelect: "none" }}
      >
        <SectionSubheader>Transaction</SectionSubheader>
        <span style={{ fontSize: 14, lineHeight: 1, color: T.textSecondary, display: "flex" }}>
          {open ? <RiArrowUpSLine /> : <RiArrowDownSLine />}
        </span>
      </div>
      <div className={`${s.collapsibleWrapper} ${open ? s.collapsibleWrapperOpen : ""}`}>
        <div className={s.collapsibleInner}>
          <div style={{
            background: "rgba(255, 252, 242, 0.3)",
            borderRadius: 6,
            padding: "10px 14px",
          }}>
            <span style={{ fontSize: 12, color: T.textPrimary, lineHeight: 1.5 }}>{text}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
