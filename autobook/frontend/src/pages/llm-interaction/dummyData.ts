import type { AgentResult } from "../../api/types";

export const EMPTY_AGENT_RESULT: AgentResult = {
  decision: "PROCEED",
  entry: { reason: "", currency: "", lines: [] },
  pipeline_state: {
    transaction_text: "",
    transaction_graph: null,
    output_decision_maker: null,
    output_debit_classifier: null,
    output_credit_classifier: null,
    output_tax_specialist: null,
    output_entry_drafter: null,
  },
};

export const DUMMY_AGENT_RESULT: AgentResult = {
  decision: "PROCEED",
  entry: {
    reason: "Standard laptop purchase for business use, paid by company credit card.",
    currency: "CAD",
    currency_symbol: "$",
    lines: [
      { account_code: "", account_name: "Computer Equipment", type: "debit", amount: 2400 },
      { account_code: "", account_name: "Accounts Payable - Credit Card", type: "credit", amount: 2400 },
    ],
  },
  proceed_reason: "The transaction clearly describes a laptop purchase from Apple with an explicit amount. No ambiguity remains after applying conventional defaults.",
  resolved_ambiguities: [
    {
      aspect: "Payment method unclear",
      ambiguous: true,
      input_contextualized_conventional_default: "Credit card payment assumed based on typical retail purchase patterns.",
      input_contextualized_ifrs_default: "Accounts Payable recognized at transaction date per IAS 37.",
      clarification_question: "Was this paid by cash, credit card, or bank transfer?",
      cases: [
        { case: "If paid by credit card → Credit Card Payable (liability)" },
        { case: "If paid by cash → Cash (asset reduction)" },
        { case: "If paid by bank transfer → Bank Account (asset reduction)" },
      ],
    },
    {
      aspect: "Asset vs expense classification",
      ambiguous: true,
      input_contextualized_conventional_default: "Items under $500 are typically expensed immediately.",
      input_contextualized_ifrs_default: "Capitalize if future economic benefits are probable and cost is reliably measurable (IAS 16).",
      clarification_question: "Is this a capital expenditure or an operating expense?",
      cases: [
        { case: "If capital expenditure → Property, Plant & Equipment (asset)" },
        { case: "If operating expense → Expense in current period" },
      ],
    },
    {
      aspect: "Tax treatment uncertainty",
      ambiguous: false,
      input_contextualized_conventional_default: "Standard HST rate of 13% applied for Ontario purchases.",
      input_contextualized_ifrs_default: "Input tax credit recoverable per IAS 12 / local tax legislation.",
      clarification_question: "Is this purchase subject to GST/HST?",
    },
  ],
  pipeline_state: {
    transaction_text: "Bought a laptop from Apple for $2,400 with company credit card, includes tax",
    transaction_graph: {
      nodes: [
        // Reporting entity (1)
        { index: 0, name: "My Company", role: "reporting_entity" as const },
        // Counterparties (5)
        { index: 1, name: "Apple Inc.", role: "counterparty" as const },
        { index: 2, name: "Visa Corp", role: "counterparty" as const },
        { index: 3, name: "FedEx", role: "counterparty" as const },
        { index: 4, name: "Samsung", role: "counterparty" as const },
        { index: 5, name: "AWS", role: "counterparty" as const },
        // Indirect parties (10) — some shared
        { index: 6, name: "CRA", role: "indirect_party" as const },           // shared: Apple + Samsung
        { index: 7, name: "Customs Agency", role: "indirect_party" as const }, // shared: FedEx + Samsung
        { index: 8, name: "Insurance Co.", role: "indirect_party" as const },  // Apple only
        { index: 9, name: "Recycling Corp", role: "indirect_party" as const }, // Apple only
        { index: 10, name: "Payment Processor", role: "indirect_party" as const }, // Visa only
        { index: 11, name: "Freight Broker", role: "indirect_party" as const },   // FedEx only
        { index: 12, name: "Warranty Provider", role: "indirect_party" as const }, // Samsung only
        { index: 13, name: "Data Center Co.", role: "indirect_party" as const },   // AWS only
        { index: 14, name: "Power Utility", role: "indirect_party" as const },     // AWS only
        { index: 15, name: "Cloud Reseller", role: "indirect_party" as const },    // AWS only
      ],
      edges: [
        // Operational (reporting ↔ counterparty)
        // Apple: 3 edges
        { source: "My Company", source_index: 0, target: "Apple Inc.", target_index: 1, nature: "purchased laptop", amount: 2400, currency: "CAD", kind: "reciprocal_exchange" },
        { source: "Apple Inc.", source_index: 1, target: "My Company", target_index: 0, nature: "delivered goods", amount: 2400, currency: "CAD", kind: "reciprocal_exchange" },
        { source: "My Company", source_index: 0, target: "Apple Inc.", target_index: 1, nature: "AppleCare warranty", amount: 199, currency: "CAD", kind: "non_exchange" },
        // Samsung: 4 edges
        { source: "My Company", source_index: 0, target: "Samsung", target_index: 4, nature: "purchased monitors", amount: 1800, currency: "CAD", kind: "reciprocal_exchange" },
        { source: "Samsung", source_index: 4, target: "My Company", target_index: 0, nature: "delivered monitors", amount: 1800, currency: "CAD", kind: "reciprocal_exchange" },
        { source: "My Company", source_index: 0, target: "Samsung", target_index: 4, nature: "extended warranty", amount: 150, currency: "CAD", kind: "non_exchange" },
        { source: "Samsung", source_index: 4, target: "My Company", target_index: 0, nature: "cashback rebate", amount: 50, currency: "CAD", kind: "non_exchange" },
        // AWS: 5 edges
        { source: "My Company", source_index: 0, target: "AWS", target_index: 5, nature: "cloud subscription", amount: 450, currency: "USD", kind: "non_exchange" },
        { source: "AWS", source_index: 5, target: "My Company", target_index: 0, nature: "service credits", amount: 100, currency: "USD", kind: "non_exchange" },
        { source: "My Company", source_index: 0, target: "AWS", target_index: 5, nature: "data transfer fees", amount: 75, currency: "USD", kind: "non_exchange" },
        { source: "My Company", source_index: 0, target: "AWS", target_index: 5, nature: "support plan", amount: 29, currency: "USD", kind: "non_exchange" },
        { source: "AWS", source_index: 5, target: "My Company", target_index: 0, nature: "reserved instance refund", amount: 200, currency: "USD", kind: "non_exchange" },
        // Visa: 1 edge
        { source: "My Company", source_index: 0, target: "Visa Corp", target_index: 2, nature: "credit card charge", amount: 2400, currency: "CAD", kind: "chained_exchange" },
        // FedEx: 1 edge
        { source: "My Company", source_index: 0, target: "FedEx", target_index: 3, nature: "shipping payment", amount: 85, currency: "CAD", kind: "non_exchange" },

        // Contextual (counterparty ↔ counterparty)
        { source: "Visa Corp", source_index: 2, target: "Apple Inc.", target_index: 1, nature: "payment processed", amount: 2400, currency: "CAD", kind: "chained_exchange" },
        { source: "FedEx", source_index: 3, target: "Samsung", target_index: 4, nature: "logistics partnership", amount: null, currency: null, kind: "relationship" },

        // Deep (counterparty ↔ indirect)
        { source: "Apple Inc.", source_index: 1, target: "CRA", target_index: 6, nature: "HST remittance", amount: 276, currency: "CAD", kind: "non_exchange" },
        { source: "Apple Inc.", source_index: 1, target: "Insurance Co.", target_index: 8, nature: "product insurance", amount: 50, currency: "CAD", kind: "non_exchange" },
        { source: "Apple Inc.", source_index: 1, target: "Recycling Corp", target_index: 9, nature: "e-waste disposal", amount: 15, currency: "CAD", kind: "non_exchange" },
        { source: "Visa Corp", source_index: 2, target: "Payment Processor", target_index: 10, nature: "transaction routing", amount: 12, currency: "CAD", kind: "chained_exchange" },
        { source: "FedEx", source_index: 3, target: "Customs Agency", target_index: 7, nature: "customs clearance", amount: 35, currency: "CAD", kind: "non_exchange" },
        { source: "FedEx", source_index: 3, target: "Freight Broker", target_index: 11, nature: "brokerage fee", amount: 20, currency: "CAD", kind: "non_exchange" },
        { source: "Samsung", source_index: 4, target: "CRA", target_index: 6, nature: "import duty", amount: 180, currency: "CAD", kind: "non_exchange" },
        { source: "Samsung", source_index: 4, target: "Customs Agency", target_index: 7, nature: "import clearance", amount: 40, currency: "CAD", kind: "non_exchange" },
        { source: "Samsung", source_index: 4, target: "Warranty Provider", target_index: 12, nature: "warranty registration", amount: null, currency: null, kind: "relationship" },
        { source: "AWS", source_index: 5, target: "Data Center Co.", target_index: 13, nature: "hosting fee", amount: 200, currency: "USD", kind: "non_exchange" },
        { source: "AWS", source_index: 5, target: "Power Utility", target_index: 14, nature: "electricity", amount: 80, currency: "USD", kind: "non_exchange" },
        { source: "AWS", source_index: 5, target: "Cloud Reseller", target_index: 15, nature: "reseller commission", amount: 45, currency: "USD", kind: "non_exchange" },

        // Deep contextual (indirect ↔ indirect) — within same counterparty's indirects
        { source: "Insurance Co.", source_index: 8, target: "Recycling Corp", target_index: 9, nature: "recycling coverage", amount: null, currency: null, kind: "relationship" },
        { source: "Data Center Co.", source_index: 13, target: "Power Utility", target_index: 14, nature: "power supply agreement", amount: null, currency: null, kind: "relationship" },

        // Deep contextual — across counterparties
        { source: "CRA", source_index: 6, target: "Customs Agency", target_index: 7, nature: "tax-customs data sharing", amount: null, currency: null, kind: "relationship" },
      ],
    },
    output_decision_maker: {
      decision: "PROCEED",
      rationale: "The transaction clearly describes a laptop purchase from Apple with an explicit amount. No ambiguity remains after applying conventional defaults.",
      ambiguities: [
        {
          aspect: "Payment method unclear",
          ambiguous: true,
          input_contextualized_conventional_default: "Credit card payment assumed based on typical retail purchase patterns.",
          input_contextualized_ifrs_default: "Accounts Payable recognized at transaction date per IAS 37.",
          clarification_question: "Was this paid by cash, credit card, or bank transfer?",
          cases: [
            { case: "If paid by credit card → Credit Card Payable (liability)" },
            { case: "If paid by cash → Cash (asset reduction)" },
            { case: "If paid by bank transfer → Bank Account (asset reduction)" },
          ],
        },
        {
          aspect: "Asset vs expense classification",
          ambiguous: true,
          input_contextualized_conventional_default: "Items under $500 are typically expensed immediately.",
          input_contextualized_ifrs_default: "Capitalize if future economic benefits are probable and cost is reliably measurable (IAS 16).",
          clarification_question: "Is this a capital expenditure or an operating expense?",
          cases: [
            { case: "If capital expenditure → Property, Plant & Equipment (asset)" },
            { case: "If operating expense → Expense in current period" },
          ],
        },
        {
          aspect: "Tax treatment uncertainty",
          ambiguous: false,
          input_contextualized_conventional_default: "Standard HST rate of 13% applied for Ontario purchases.",
          input_contextualized_ifrs_default: "Input tax credit recoverable per IAS 12 / local tax legislation.",
          clarification_question: "Is this purchase subject to GST/HST?",
        },
      ],
    },
    output_tax_specialist: {
      reasoning: "Text states 13% HST on a $2,000 laptop purchase for business use",
      tax_mentioned: true,
      classification: "taxable" as const,
      itc_eligible: true,
      amount_tax_inclusive: false,
      tax_rate: 0.13,
      tax_context: "13% HST on the full purchase amount. ITC claimable as business expense.",
    },
    output_debit_classifier: null,
    output_credit_classifier: null,
    output_entry_drafter: {
      reason: "Standard laptop purchase for business use, paid by company credit card.",
      currency: "CAD",
      currency_symbol: "$",
      lines: [
        { account_code: "", account_name: "Computer Equipment", type: "debit" as const, amount: 2400 },
        { account_code: "", account_name: "Accounts Payable - Credit Card", type: "credit" as const, amount: 2400 },
      ],
    },
  },
};
