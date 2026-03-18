import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseTransaction, uploadTransactionsCsv } from "../api/parse";
import type { ParseResponse } from "../api/types";
import { ParseResultCard } from "../components/ParseResultCard";
import { TransactionForm } from "../components/TransactionForm";

const sampleTransactions = [
  "Bought a laptop for $2400",
  "Transferred money",
  "Paid contractor 600 for website work",
];

export function TransactionPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("Bought a laptop for $2400");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const isMockMode = import.meta.env.VITE_USE_MOCK_API !== "false";

  function handleInputChange(value: string) {
    setInput(value);
    setResult(null);
    setError(null);
    setUploadNotice(null);
  }

  function applyExample(value: string) {
    handleInputChange(value);
  }

  function handleFileChange(file: File | null) {
    setSelectedFile(file);
    setResult(null);
    setError(null);
    setUploadNotice(null);
  }

  async function handleSubmit() {
    try {
      setIsLoading(true);
      setError(null);
      setUploadNotice(null);
      const response = await parseTransaction({
        input_text: input,
        source: "manual",
        currency: "CAD",
      });
      setResult(response);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to parse transaction.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCsvUpload() {
    if (!selectedFile) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const response = await uploadTransactionsCsv(selectedFile);
      setResult(response);
      setUploadNotice(`Processed ${selectedFile.name} through the CSV intake path.`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to process uploaded CSV.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="panel hero-panel">
        <div className="hero-copy">
          <div>
            <p className="eyebrow">Workflow</p>
            <h2>Translate plain language into ledger-ready journal entries.</h2>
          </div>
          <p className="body-copy">
            Start with a clean purchase or try an ambiguous transfer to exercise the clarification queue.
          </p>
        </div>
        <div className="hero-meta">
          {isMockMode ? (
            <span className="hero-pill">Mock API Active</span>
          ) : (
            <span className="hero-pill">Live API Mode</span>
          )}
          <span className="hero-pill hero-pill-muted">
            Demo user: {import.meta.env.VITE_DEMO_USER_ID}
          </span>
        </div>
      </section>

      <section className="panel compact-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Examples</p>
            <h2>Quick Prompts</h2>
          </div>
        </div>
        <div className="chip-row">
          {sampleTransactions.map((sample) => (
            <button key={sample} className="prompt-chip" onClick={() => applyExample(sample)}>
              {sample}
            </button>
          ))}
        </div>
      </section>

      <TransactionForm
        value={input}
        onChange={handleInputChange}
        selectedFileName={selectedFile?.name ?? null}
        onFileChange={handleFileChange}
        onSubmit={handleSubmit}
        onUploadCsv={handleCsvUpload}
        isLoading={isLoading}
      />

      {error ? <section className="panel error-panel">{error}</section> : null}
      {uploadNotice ? (
        <section className="panel outcome-panel outcome-success compact-panel">
          <p className="success-copy upload-notice">{uploadNotice}</p>
        </section>
      ) : null}

      {!result && !error ? (
        <section className="panel empty-state-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Ready</p>
              <h2>What to Try First</h2>
            </div>
          </div>
          <div className="empty-state-grid">
            <div className="empty-state-card">
              <strong>Clear purchase</strong>
              <p className="body-copy">
                Use a concrete transaction like a laptop or software subscription to exercise the auto-post path.
              </p>
            </div>
            <div className="empty-state-card">
              <strong>Ambiguous transfer</strong>
              <p className="body-copy">
                Use wording like "Transferred money" to send the item into the clarification queue.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {result ? (
        <>
          <ParseResultCard result={result} />
          <section
            className={
              result.status === "auto_posted"
                ? "panel outcome-panel outcome-success"
                : "panel outcome-panel outcome-warning"
            }
          >
            <div className="panel-header">
              <div>
                <p className="eyebrow">Next Step</p>
                <h2>{result.status === "auto_posted" ? "Entry Posted" : "Human Review Needed"}</h2>
              </div>
            </div>
            <p className="body-copy">
              {result.status === "auto_posted"
                ? "This transaction cleared the confidence threshold and can be inspected in the ledger."
                : "This transaction should be reviewed before posting to the ledger."}
            </p>
            <div className="panel-actions">
              <button
                className="primary-button"
                onClick={() =>
                  navigate(result.status === "auto_posted" ? "/ledger" : "/clarifications")
                }
              >
                {result.status === "auto_posted" ? "View Ledger" : "Open Clarifications"}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
