import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
});
