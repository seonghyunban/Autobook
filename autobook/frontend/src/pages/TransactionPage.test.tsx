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

describe("transaction file upload", () => {
  test("accepts a csv file and shows upload processing feedback", async () => {
    renderTransactionPage();

    const file = new File(
      ["date,description,amount\n2026-03-17,Bank payment,2400"],
      "march-bank.csv",
      { type: "text/csv" },
    );

    fireEvent.change(screen.getByLabelText(/upload transaction file/i), {
      target: { files: [file] },
    });

    expect(screen.getByText(/selected file: march-bank\.csv/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /upload file/i }));

    expect(
      await screen.findByText(/processed march-bank\.csv through the uploaded file intake path/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /posting recommendation/i }),
    ).toBeInTheDocument();
  });

  test("accepts a pdf file and routes it through the mocked pdf intake path", async () => {
    renderTransactionPage();

    const file = new File(["Invoice text for software subscription"], "invoice-demo.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(screen.getByLabelText(/upload transaction file/i), {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByRole("button", { name: /upload file/i }));

    expect(
      await screen.findByText(/processed invoice-demo\.pdf through the uploaded file intake path/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/pdf intake path and normalized the extracted text/i),
    ).toBeInTheDocument();
  });

  test("accepts an image file and routes it through the mocked image intake path", async () => {
    renderTransactionPage();

    const file = new File(["mock image bytes"], "receipt-demo.png", {
      type: "image/png",
    });

    fireEvent.change(screen.getByLabelText(/upload transaction file/i), {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByRole("button", { name: /upload file/i }));

    expect(
      await screen.findByText(/processed receipt-demo\.png through the uploaded file intake path/i),
    ).toBeInTheDocument();
    expect(await screen.findByText(/image receipt demo path/i)).toBeInTheDocument();
    expect(await screen.findByText(/human review needed/i)).toBeInTheDocument();
  });
});
