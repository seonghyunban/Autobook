import type { JournalLine } from "../../../api/types";
import { RiCloseLine } from "react-icons/ri";
import { motion, AnimatePresence } from "motion/react";
import { palette, T, entryColors } from "../shared/tokens";
import type { EntryColorTheme } from "../shared/tokens";
import { HoverButton } from "../shared/HoverButton";
import { AddButton } from "../shared/AddButton";
import { DeleteButton } from "../shared/DeleteButton";
import s from "../panels.module.css";

// ── Decision Overlay (MISSING_INFO / STUCK) ──────────

type OverlayEntry = { currency_symbol?: string; lines?: JournalLine[]; reason?: string };


export function DecisionOverlay({ data, visible, onClose }: { data: Record<string, unknown>; visible: boolean; onClose: () => void }) {
  const decision = data.decision as string;
  const isMissing = decision === "MISSING_INFO";

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      zIndex: 5,
      background: "rgba(255, 252, 242, 1)",
      backdropFilter: "blur(48px)",
      WebkitBackdropFilter: "blur(48px)",
      borderRadius: T.panelRadius,
      border: "none",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1)",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(8px)",
      transition: "opacity 0.2s ease, transform 0.2s ease",
      pointerEvents: visible ? "auto" : "none",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      padding: T.panelPadding,
    }}>
    <div className={s.scrollable} style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      marginRight: -4,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: isMissing ? palette.spicyPaprika : T.errorText }}>
          {isMissing ? "Missing Information" : "Stuck"}
        </h2>
        <HoverButton
          onClick={onClose}
          bgHover="rgba(204, 197, 185, 0.3)"
          color={T.textSecondary}
          style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px", borderRadius: 4 }}
        >
          <RiCloseLine />
        </HoverButton>
      </div>

      {/* MISSING_INFO content */}
      {isMissing && (() => {
        const dm = (data.output_decision_maker || data) as Record<string, unknown>;
        const ambiguities = (dm.ambiguities as Array<Record<string, unknown>>) || [];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {ambiguities.map((a, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>
                    {String(a.aspect)}
                  </div>
                  {!!a.clarification_question && (
                    <div style={{ fontSize: 12, color: T.textSecondary, fontStyle: "italic", marginTop: 4 }}>
                      {String(a.clarification_question)}
                    </div>
                  )}
                </div>
                {((a.cases as Array<Record<string, unknown>>) || []).map((c, j) => (
                  <div key={j} style={{ paddingLeft: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: T.textPrimary, marginBottom: 2 }}>
                      If: {String(c.case)}
                    </div>
                    {(() => {
                      const pe = c.possible_entry as OverlayEntry | undefined;
                      return pe?.lines?.length
                        ? <EntryTable lines={pe.lines as JournalLine[]} currencySymbol={pe.currency_symbol || ""} minRows={0} />
                        : null;
                    })()}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {/* STUCK content */}
      {!isMissing && (() => {
        const stuckReason = data.stuck_reason as string | undefined;
        const gaps = (data.capability_gaps as Array<Record<string, unknown>>) || [];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {stuckReason && (
              <div style={{ fontSize: 13, color: T.textSecondary }}>
                {stuckReason}
              </div>
            )}
            {gaps.map((g, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>
                    {String(g.aspect)}
                  </div>
                  {!!g.gap && (
                    <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>
                      {String(g.gap)}
                    </div>
                  )}
                </div>
                {(() => {
                  const ba = g.best_attempt as OverlayEntry | undefined;
                  return ba?.lines?.length ? (
                    <div style={{ paddingLeft: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: T.textMuted, marginBottom: 2 }}>Best attempt:</div>
                      <EntryTable lines={ba.lines as JournalLine[]} currencySymbol={ba.currency_symbol || ""} minRows={0} />
                    </div>
                  ) : null;
                })()}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
    </div>
  );
}

// ── Entry building blocks ────────────────────────────

const editInputStyle: React.CSSProperties = {
  minWidth: "100%", minHeight: 28, fontSize: 13, color: "#fff",
  background: "transparent", border: "none", outline: "none", padding: 0,
  fontFamily: "monospace", textAlign: "right", boxSizing: "border-box",
  fieldSizing: "content",
};

const silverBg = "rgba(204, 197, 185, 0.15)";

type EntryRowProps = {
  line: JournalLine;
  index: number;
  currencySymbol: string;
  colors: EntryColorTheme;
  compact?: boolean;
  disabled?: boolean;
  showAccountCode?: boolean;
  editable?: boolean;
  onLineChange?: (i: number, line: JournalLine) => void;
};

export function EntryHeader({ colors, compact }: { colors: EntryColorTheme; compact?: boolean }) {
  const pad = compact ? "4px 6px" : "8px 10px";
  const cr = compact ? 3 : 4;
  const colGap = compact ? 3 : 5;
  return (
    <div style={{ display: "flex", gap: colGap }}>
      {["Account", "Debit", "Credit"].map((h, i) => (
        <div key={h} style={{ flex: i === 0 ? 5 : 2.5, padding: pad, textAlign: i === 0 ? "left" : "right", color: "rgba(37, 36, 34, 0.9)", background: colors.headerBg[i], fontWeight: 600, whiteSpace: "nowrap", borderRadius: cr, fontSize: compact ? 10 : 13 }}>
          {h}
        </div>
      ))}
    </div>
  );
}

export function EntryRow({ line, index, currencySymbol, colors, compact, disabled, showAccountCode, editable, onLineChange }: EntryRowProps) {
  const { cellBg, cellBgFilled, cellBgSolid } = colors;
  const pad = compact ? "4px 6px" : "8px 10px";
  const fs = compact ? 11 : 13;
  const cr = compact ? 3 : 4;
  const colGap = compact ? 3 : 5;
  const fontColor = disabled ? "rgba(37, 36, 34, 0.5)" : "rgba(37, 36, 34, 0.8)";
  const acctBg = disabled ? silverBg : cellBgFilled[0];
  const isDebit = line.type === "debit";
  const drBg = disabled ? silverBg : (isDebit ? cellBgFilled[1] : cellBg[1]);
  const crBg = disabled ? silverBg : (!isDebit ? cellBgFilled[2] : cellBg[2]);
  const debitVal = isDebit && line.amount > 0 ? `${currencySymbol}${line.amount.toLocaleString()}` : "";
  const creditVal = !isDebit && line.amount > 0 ? `${currencySymbol}${line.amount.toLocaleString()}` : "";
  const hasDebit = isDebit && line.amount > 0;
  const hasCredit = !isDebit && line.amount > 0;

  return (
    <div style={{ display: "flex", gap: colGap, minWidth: 0, fontSize: fs }}>
      {/* Account */}
      <div className={compact ? undefined : s.cellExpand} style={{ flex: 5, minWidth: 0, padding: pad, color: fontColor, borderRadius: cr, background: acctBg, position: "relative", transition: "background 0.15s ease, color 0.15s ease" }}>
        <span style={{ display: "flex", alignItems: "center", minHeight: compact ? undefined : 28 }}>
          <span style={{ fontSize: fs, opacity: disabled ? 0.5 : 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{line.account_name}</span>
        </span>
        {!compact && (
          <span className={`${s.cellExpandOverlay} ${s.cellExpandRight}`} style={{ background: cellBgSolid[0], color: "#fff", fontSize: fs }}>
            {editable ? (
              <input
                value={line.account_name}
                onChange={(e) => onLineChange?.(index, { ...line, account_name: e.target.value })}
                style={{ ...editInputStyle, fontFamily: "inherit", textAlign: "left", fontSize: fs }}
              />
            ) : line.account_name}
          </span>
        )}
        {showAccountCode && line.account_code && (
          <span style={{ position: "absolute", bottom: 4, right: 8, fontSize: 10, fontWeight: 600, opacity: 0.4 }}>{line.account_code}</span>
        )}
      </div>
      {/* Debit */}
      <div className={compact ? undefined : s.cellExpand} style={{ flex: 2.5, minWidth: 0, padding: pad, textAlign: "right", fontFamily: "monospace", color: fontColor, borderRadius: cr, background: drBg, transition: "background 0.15s ease, color 0.15s ease" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", minHeight: compact ? undefined : 28, lineHeight: compact ? undefined : "28px" }}>{debitVal}</span>
        {!compact && (
          <>
            {editable ? (
              <span className={`${s.cellExpandOverlay} ${s.cellExpandLeft}`} style={{ background: cellBgSolid[1], color: "#fff", fontFamily: "monospace", justifyContent: "flex-end" }}>
                <input
                  value={isDebit ? (line.amount || "") : ""}
                  onChange={(e) => { const v = Number(e.target.value) || 0; onLineChange?.(index, { ...line, type: v > 0 ? "debit" : line.type, amount: v }); }}
                  disabled={hasCredit}
                  style={{ ...editInputStyle, opacity: hasCredit ? 0.3 : 1, fontSize: fs }}
                  placeholder={hasCredit ? "—" : ""}
                />
              </span>
            ) : debitVal ? (
              <span className={`${s.cellExpandOverlay} ${s.cellExpandLeft}`} style={{ background: cellBgSolid[1], color: "#fff", fontFamily: "monospace", justifyContent: "flex-end" }}>
                {debitVal}
              </span>
            ) : null}
          </>
        )}
      </div>
      {/* Credit */}
      <div className={compact ? undefined : s.cellExpand} style={{ flex: 2.5, minWidth: 0, padding: pad, textAlign: "right", fontFamily: "monospace", color: fontColor, borderRadius: cr, background: crBg, transition: "background 0.15s ease, color 0.15s ease" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", minHeight: compact ? undefined : 28, lineHeight: compact ? undefined : "28px" }}>{creditVal}</span>
        {!compact && (
          <>
            {editable ? (
              <span className={`${s.cellExpandOverlay} ${s.cellExpandLeft}`} style={{ background: cellBgSolid[2], color: "#fff", fontFamily: "monospace", justifyContent: "flex-end" }}>
                <input
                  value={!isDebit ? (line.amount || "") : ""}
                  onChange={(e) => { const v = Number(e.target.value) || 0; onLineChange?.(index, { ...line, type: v > 0 ? "credit" : line.type, amount: v }); }}
                  disabled={hasDebit}
                  style={{ ...editInputStyle, opacity: hasDebit ? 0.3 : 1, fontSize: fs }}
                  placeholder={hasDebit ? "—" : ""}
                />
              </span>
            ) : creditVal ? (
              <span className={`${s.cellExpandOverlay} ${s.cellExpandLeft}`} style={{ background: cellBgSolid[2], color: "#fff", fontFamily: "monospace", justifyContent: "flex-end" }}>
                {creditVal}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function EntryTotalRow({ lines, currencySymbol, colors, compact }: { lines: JournalLine[]; currencySymbol: string; colors: EntryColorTheme; compact?: boolean }) {
  const { totalBg, totalBgFilled, totalBgSolid } = colors;
  const pad = compact ? "4px 6px" : "8px 10px";
  const cr = compact ? 3 : 4;
  const fs = compact ? 11 : 13;
  const colGap = compact ? 3 : 5;
  const totalDebit = lines.filter(l => l.type === "debit").reduce((acc, l) => acc + l.amount, 0);
  const totalCredit = lines.filter(l => l.type === "credit").reduce((acc, l) => acc + l.amount, 0);

  return (
    <div style={{ display: "flex", gap: colGap }}>
      <div style={{ flex: 5, padding: pad, borderRadius: cr, background: (totalDebit > 0 || totalCredit > 0) ? totalBgFilled[0] : totalBg[0], fontSize: fs, color: "rgba(37, 36, 34, 0.8)", textAlign: "right" }}>
        Total
      </div>
      <div className={compact ? undefined : s.cellExpand} style={{ flex: 2.5, minWidth: 0, padding: pad, textAlign: "right", fontFamily: "monospace", color: "rgba(37, 36, 34, 0.8)", borderRadius: cr, background: totalDebit > 0 ? totalBgFilled[1] : totalBg[1] }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {totalDebit > 0 ? `${currencySymbol}${totalDebit.toLocaleString()}` : ""}
        </span>
        {!compact && totalDebit > 0 && (
          <span className={`${s.cellExpandOverlay} ${s.cellExpandLeft}`} style={{ background: totalBgSolid[1], color: "#fff", fontFamily: "monospace", justifyContent: "flex-end" }}>
            {`${currencySymbol}${totalDebit.toLocaleString()}`}
          </span>
        )}
      </div>
      <div className={compact ? undefined : s.cellExpand} style={{ flex: 2.5, minWidth: 0, padding: pad, textAlign: "right", fontFamily: "monospace", color: "rgba(37, 36, 34, 0.8)", borderRadius: cr, background: totalCredit > 0 ? totalBgFilled[2] : totalBg[2] }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {totalCredit > 0 ? `${currencySymbol}${totalCredit.toLocaleString()}` : ""}
        </span>
        {!compact && totalCredit > 0 && (
          <span className={`${s.cellExpandOverlay} ${s.cellExpandLeft}`} style={{ background: totalBgSolid[2], color: "#fff", fontFamily: "monospace", justifyContent: "flex-end" }}>
            {`${currencySymbol}${totalCredit.toLocaleString()}`}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Unified Entry Table (composed from parts) ────────

export function EntryTable({
  lines, currencySymbol, colors = entryColors,
  showTotal = true, showAccountCode = false, minRows = 0,
  scrollable = false, compact = false, disabledRows,
  rowAppearAnimation = false,
  editable = false, lineKeys, onLineChange, onAddLine, onDeleteLine,
  scrollRef, onScroll,
}: {
  lines: JournalLine[];
  currencySymbol: string;
  colors?: EntryColorTheme;
  showTotal?: boolean;
  showAccountCode?: boolean;
  minRows?: number;
  scrollable?: boolean;
  compact?: boolean;
  disabledRows?: boolean[];
  rowAppearAnimation?: boolean;
  editable?: boolean;
  lineKeys?: string[];
  onLineChange?: (i: number, line: JournalLine) => void;
  onAddLine?: (i: number) => void;
  onDeleteLine?: (i: number) => void;
  scrollRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}) {
  const emptyRows = Math.max(0, minRows - lines.length);
  const { cellBg } = colors;
  const gap = compact ? 2 : 3;
  const colGap = compact ? 3 : 5;
  const pad = compact ? "4px 6px" : "8px 10px";
  const cr = compact ? 3 : 4;
  const fs = compact ? 11 : 13;

  const dur = 0.15;
  const outerInitial = { height: 0, overflow: "hidden" as const };
  const outerAnimate = { height: "auto", overflow: "visible" as const, transition: { duration: dur, ease: "easeOut" as const } };
  const outerExit = { height: 0, overflow: "hidden" as const, transition: { duration: dur, delay: dur, ease: "easeOut" as const } };
  const innerInitial = { opacity: 0 };
  const innerAnimate = { opacity: 1, transition: { duration: dur, delay: dur, ease: "easeOut" as const } };
  const innerExit = { opacity: 0, transition: { duration: dur, ease: "easeOut" as const } };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, fontSize: fs }}>
      <div style={{ flexShrink: 0, ...(scrollable ? { position: "sticky", top: 0, zIndex: 2, paddingRight: 12 } : {}) }}>
        <EntryHeader colors={colors} compact={compact} />
      </div>
      <div
        ref={scrollable ? scrollRef as React.Ref<HTMLDivElement> : undefined}
        onScroll={scrollable ? onScroll : undefined}
        className={scrollable ? s.scrollable : undefined}
        style={{ display: "flex", flexDirection: "column", gap, ...(scrollable ? { flex: 1, overflow: "auto", minHeight: 0 } : {}), marginTop: gap }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={editable ? "edit" : "display"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur }}
            style={{ display: "flex", flexDirection: "column", gap }}
          >
            {editable && (
              <div style={{ height: 0, position: "relative" }}>
                <div style={{ position: "absolute", right: -20, top: -7 }}>
                  <AddButton onClick={() => onAddLine?.(0)} title="Add line at top" />
                </div>
              </div>
            )}
            {editable ? (
              <AnimatePresence initial={false}>
                {lines.map((line, i) => (
                  <motion.div key={lineKeys?.[i] ?? i} initial={outerInitial} animate={outerAnimate} exit={outerExit}>
                    <motion.div initial={innerInitial} animate={innerAnimate} exit={innerExit} style={{ position: "relative" }}>
                      <EntryRow line={line} index={i} currencySymbol={currencySymbol} colors={colors} compact={compact} disabled={disabledRows?.[i]} showAccountCode={showAccountCode} editable onLineChange={onLineChange} />
                      <div style={{ position: "absolute", right: -20, top: "50%", transform: "translateY(-50%)" }}>
                        <DeleteButton onClick={() => onDeleteLine?.(i)} title="Delete line" />
                      </div>
                      <div style={{ position: "absolute", right: -20, bottom: -8, zIndex: 1 }}>
                        <AddButton onClick={() => onAddLine?.(i + 1)} title="Add line" />
                      </div>
                    </motion.div>
                  </motion.div>
                ))}
              </AnimatePresence>
            ) : (
              lines.map((line, i) => (
                <div key={i} className={rowAppearAnimation ? s.lineAppear : undefined} style={rowAppearAnimation ? { animationDelay: `${i * 60}ms` } : undefined}>
                  <EntryRow line={line} index={i} currencySymbol={currencySymbol} colors={colors} compact={compact} disabled={disabledRows?.[i]} showAccountCode={showAccountCode} />
                </div>
              ))
            )}
          </motion.div>
        </AnimatePresence>
        {Array.from({ length: emptyRows }, (_, i) => (
          <div key={`empty-${i}`} style={{ display: "flex", gap: colGap }}>
            <div style={{ flex: 5, padding: pad, borderRadius: cr, background: cellBg[0] }}>&nbsp;</div>
            <div style={{ flex: 2.5, padding: pad, borderRadius: cr, background: cellBg[1] }} />
            <div style={{ flex: 2.5, padding: pad, borderRadius: cr, background: cellBg[2] }} />
          </div>
        ))}
        {showTotal && !scrollable && <EntryTotalRow lines={lines} currencySymbol={currencySymbol} colors={colors} compact={compact} />}
      </div>
      {showTotal && scrollable && (
        <div style={{ flexShrink: 0, paddingRight: 12, marginTop: gap }}>
          <EntryTotalRow lines={lines} currencySymbol={currencySymbol} colors={colors} compact={compact} />
        </div>
      )}
    </div>
  );
}
