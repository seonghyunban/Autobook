# Post-Hoc Evaluation Prompts

Claude Code evaluates entry accuracy and clarification relevance after experiment runs. Reads result JSONs + test case definitions, writes evaluation files to the analysis directory.

---

## 1. Entry Accuracy Evaluation

### Procedure

For each variant, for each non-ambiguous test case:

1. Read `expected_entry` from test case definition (`test_cases/`)
2. Read `journal_entry` from result JSON (`results/<variant>/<timestamp>/<test_case>.json`)
3. Compare using the criteria below

### Criteria

**Match** — ALL must hold:
- **Line count**: Same number of lines (excluding $0 lines)
- **Account equivalence**: Semantically equivalent accounts. Common equivalences:
  - "Inventory" = "Inventories — Merchandise" = "Inventories — Finished goods"
  - "Cash" = "Cash — chequing" = "Bank"
  - "AP" = "Accounts Payable" = "Trade payables"
  - "AR" = "Accounts Receivable" = "Trade receivables"
  - "Revenue" = "Revenue — Product sales" = "Sales Revenue" = "Revenue — Service revenue"
  - "COGS" = "Cost of goods sold" = "Cost of sales"
  - Any reasonable accounting synonym is acceptable
- **Type correct**: Correct debit/credit direction per line
- **Amount correct**: Exact amount per line

**Not a match** — ANY of:
- Missing or extra lines
- Wrong account category (e.g., expense instead of asset)
- Wrong amount or wrong debit/credit direction

**Edge cases:**
- Both null → match
- One null, one not → not match
- Extra tax lines (not in expected) → don't penalize if base amounts correct

### Output

```json
{
  "evaluator": "claude",
  "evaluated_at": "<ISO timestamp>",
  "prompt_version": "v1",
  "results": {
    "full_pipeline": {
      "basic_01_inventory_cash": {
        "actual": {"lines": [{"account_name": "Inventory", "type": "debit", "amount": 100}, ...]},
        "expected": {"lines": [{"account_name": "Inventories — Merchandise", "type": "debit", "amount": 100}, ...]},
        "match": true,
        "reason": "Semantically equivalent accounts (Inventory = Inventories — Merchandise). Same types and amounts."
      }
    },
    "baseline": {
      "basic_01_inventory_cash": {
        "actual": {"lines": [...]},
        "expected": {"lines": [...]},
        "match": false,
        "reason": "Missing COGS line."
      }
    }
  }
}
```

---

## 2. Clarification Relevance Evaluation

### Procedure

For each variant, for each ambiguous test case:

1. Read `expected_cases` from test case definition — the possible valid interpretations
2. Read `final_decision` and pipeline state from result JSON
3. Evaluate using the criteria below

### Criteria

**Relevant** — ALL must hold:
- Pipeline output `final_decision: "INCOMPLETE_INFORMATION"`
- At least one clarification question was produced
- The question **distinguishes between the listed interpretations** — answering it determines which `expected_case` applies
- The question is **about business facts**, not accounting knowledge

**Not relevant** — ANY of:
- Pipeline did not output INCOMPLETE_INFORMATION (guessed instead)
- No clarification question produced
- Question too generic ("Can you provide more details?")
- Question asks about accounting treatment ("Should this be capitalized or expensed?")

### Reference: expected_cases

**hard_01_note_discounting:**
- Derecognition (sale)
- Collateralized borrowing

**hard_02_investment_classification:**
- Short-term trading (FVTPL)
- Long-term strategic (FVOCI)
- Significant influence (Equity method)

**hard_27_meal_purpose:**
- Overtime meal (employee benefit)
- Working meeting
- Client entertainment
- Factory staff meal (production overhead)

**hard_32_grocery_purpose:**
- Client entertainment
- Employee break room supplies

**hard_16_rent_treatment:**
- Prepaid (asset recognition)
- Expense (short-term lease exemption)

### Output

```json
{
  "evaluator": "claude",
  "evaluated_at": "<ISO timestamp>",
  "prompt_version": "v1",
  "results": {
    "full_pipeline": {
      "hard_27_meal_purpose": {
        "actual_decision": "INCOMPLETE_INFORMATION",
        "actual_questions": ["What was the purpose of this meal?"],
        "expected_cases": ["Overtime meal", "Working meeting", "Client entertainment", "Factory staff meal"],
        "relevant": true,
        "reason": "Question directly targets the ambiguity — answer determines which of the four interpretations applies."
      }
    },
    "baseline": {
      "hard_27_meal_purpose": {
        "actual_decision": "APPROVED",
        "actual_questions": null,
        "expected_cases": ["Overtime meal", "Working meeting", "Client entertainment", "Factory staff meal"],
        "relevant": false,
        "reason": "Pipeline guessed instead of asking — output APPROVED, not INCOMPLETE_INFORMATION."
      }
    }
  }
}
```

---

## Workflow

1. `./run_experiment.sh` — runs pipeline, saves results
2. `./run_analysis.sh` — computes automated metrics (decision, tuple, tokens, cost)
3. Claude reads results + test cases, evaluates using prompts above
4. Claude writes `entry_accuracy.json` + `clarification_relevance.json` to `analysis/<timestamp>/`
5. `./run_present.sh recent` — merges evaluation files, generates report
