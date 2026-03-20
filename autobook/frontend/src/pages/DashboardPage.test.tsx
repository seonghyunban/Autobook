import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { parseTransaction } from "../api/parse";
import { DashboardPage } from "./DashboardPage";

function renderDashboardPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("dashboard key balance cards", () => {
  test("shows cash position, revenue, and amounts owing cards", async () => {
    renderDashboardPage();

    expect(await screen.findByText("Cash Position")).toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Amounts Owing")).toBeInTheDocument();
    expect(await screen.findByText("$-2400.00")).toBeInTheDocument();
    expect(screen.getAllByText("$1500.00")).toHaveLength(2);
  });

  test("refreshes recent activity after a journal entry is posted", async () => {
    renderDashboardPage();

    expect(await screen.findByText("Bought laptop for $2400")).toBeInTheDocument();

    await act(async () => {
      await parseTransaction({
        input_text: "Paid annual insurance premium",
        source: "manual",
        currency: "CAD",
      });
    });

    expect(await screen.findByText("Paid annual insurance premium")).toBeInTheDocument();
  });
});
