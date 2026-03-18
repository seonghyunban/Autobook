import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TransactionPage } from "./TransactionPage";

function renderTransactionPage() {
  return render(
    <MemoryRouter>
      <TransactionPage />
    </MemoryRouter>,
  );
}

describe("transaction csv upload", () => {
  test("accepts a csv file and shows upload processing feedback", async () => {
    renderTransactionPage();

    const file = new File(
      ["date,description,amount\n2026-03-17,Bank payment,2400"],
      "march-bank.csv",
      { type: "text/csv" },
    );

    fireEvent.change(screen.getByLabelText(/upload bank csv/i), {
      target: { files: [file] },
    });

    expect(screen.getByText(/selected file: march-bank\.csv/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /upload csv/i }));

    expect(
      await screen.findByText(/processed march-bank\.csv through the csv intake path/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /posting recommendation/i }),
    ).toBeInTheDocument();
  });
});
