import { fireEvent, render, screen } from "@testing-library/react";
import { StatementsPage } from "./StatementsPage";
import { downloadStatementsCsv, exportStatementsPdf } from "../utils/statementsExport";

vi.mock("../utils/statementsExport", () => ({
  downloadStatementsCsv: vi.fn(),
  exportStatementsPdf: vi.fn(),
}));

describe("statement export controls", () => {
  test("triggers csv and pdf export actions after the statement loads", async () => {
    render(<StatementsPage />);

    expect(
      await screen.findByText(/isolates the financial statement view/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    expect(vi.mocked(downloadStatementsCsv)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(exportStatementsPdf)).toHaveBeenCalledTimes(1);
  });
});
