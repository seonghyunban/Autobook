import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ClarificationPage } from "./ClarificationPage";
import * as clarificationsApi from "../api/clarifications";

vi.mock("../api/realtime", () => ({
  subscribeToRealtimeUpdates: () => () => undefined,
}));

function renderClarificationPage() {
  return render(
    <MemoryRouter>
      <ClarificationPage />
    </MemoryRouter>,
  );
}

describe("clarification realtime header", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shows the queue clock alongside the pending count", async () => {
    renderClarificationPage();

    expect(await screen.findByRole("heading", { name: /clarifications/i })).toBeInTheDocument();
    expect(await screen.findByText(/2 pending/i)).toBeInTheDocument();
    expect(screen.getByText(/queue synced/i)).toBeInTheDocument();
  });

  test("lets the reviewer edit journal lines before posting", async () => {
    renderClarificationPage();

    const codeInput = await screen.findByLabelText(/account code 1/i);
    fireEvent.change(codeInput, { target: { value: "1100" } });

    expect(screen.getByRole("button", { name: /save changes & post/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset draft/i })).toBeEnabled();
  });

  test("disables approval when no proposed entry was generated", async () => {
    vi.spyOn(clarificationsApi, "getClarifications").mockResolvedValue({
      count: 1,
      items: [
        {
          clarification_id: "cl-no-entry",
          status: "pending",
          source_text: "Transferred money",
          explanation: "Clarification required before a journal entry can be built.",
          confidence: { overall: 0.12 },
          proposed_entry: null,
        },
      ],
    });

    renderClarificationPage();

    expect(await screen.findByText(/cannot be approved from this screen/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve & post/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reject/i })).toBeEnabled();
  });
});
