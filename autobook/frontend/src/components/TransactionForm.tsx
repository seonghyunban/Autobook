type TransactionFormProps = {
  value: string;
  onChange: (value: string) => void;
  selectedFileName: string | null;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
  onUploadCsv: () => void;
  isLoading: boolean;
};

export function TransactionForm({
  value,
  onChange,
  selectedFileName,
  onFileChange,
  onSubmit,
  onUploadCsv,
  isLoading,
}: TransactionFormProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Input</p>
          <h2>Natural Language Transaction</h2>
        </div>
      </div>

      <label className="field-label" htmlFor="transaction-input">
        Describe a transaction in plain language
      </label>
      <p className="field-help">
        Include amount, counterparty, and action when possible. Cleaner wording should clear the
        confidence threshold faster.
      </p>
      <textarea
        id="transaction-input"
        className="text-area"
        rows={5}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Example: Bought a laptop for $2400"
      />

      <div className="file-upload-grid">
        <div>
          <label className="field-label" htmlFor="transaction-csv-upload">
            Upload bank CSV
          </label>
          <p className="field-help">
            Use this when you want to demo intake from exported bank activity instead of a single typed transaction.
          </p>
          <input
            id="transaction-csv-upload"
            className="text-input"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
          <span className="file-selection-copy">
            {selectedFileName ? `Selected file: ${selectedFileName}` : "No CSV selected yet."}
          </span>
          <div className="sample-link-row">
            <a href="/sample-csv/clean-purchase.csv" target="_blank" rel="noreferrer">
              Sample clean CSV
            </a>
            <a href="/sample-csv/ambiguous-transfer.csv" target="_blank" rel="noreferrer">
              Sample clarification CSV
            </a>
          </div>
        </div>
      </div>

      <div className="panel-actions">
        <button className="primary-button" onClick={onSubmit} disabled={isLoading || !value.trim()}>
          {isLoading ? "Parsing..." : "Parse Transaction"}
        </button>
        <button
          className="secondary-button"
          onClick={onUploadCsv}
          disabled={isLoading || !selectedFileName}
        >
          {isLoading ? "Processing..." : "Upload CSV"}
        </button>
      </div>
    </section>
  );
}
