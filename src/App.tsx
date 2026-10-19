import { useRef, useState } from "react";
import Papa from "papaparse";

type RawRow = Record<string, string>;

type Sale = {
  date: string;
  retailer: string;
  product: string;
  quantity: number;
  sales: number;
  promoted: boolean;
  raw: RawRow;
};

type InvalidRow = {
  rowNumber: number;
  reasons: string[];
};

type ParsedSales = {
  rows: Sale[];
  invalidRows: InvalidRow[];
  headers: string[];
  hasPromotion: boolean;
};

const aliases = {
  date: ["date", "sales date", "order date", "transaction date"],
  retailer: ["retailer", "retailer name", "store", "store name"],
  product: ["product", "product name", "item", "item name"],
  quantity: ["units sold", "quantity", "units", "qty", "total quantity"],
  sales: ["total sales", "sales", "sales value", "revenue", "total revenue"],
  price: ["price per unit", "unit price", "selling price", "price"],
  promotion: ["promotion", "promo", "is promo", "promotional", "promotion applied"],
};

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

function findHeader(headers: string[], candidates: string[]) {
  return headers.find((header) => candidates.includes(normalizeHeader(header)));
}

function parseNumber(value: string | undefined) {
  if (value === undefined || value.trim() === "") return Number.NaN;
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseDate(value: string | undefined) {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const date = usDate
    ? new Date(Date.UTC(Number(usDate[3]), Number(usDate[1]) - 1, Number(usDate[2])))
    : new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  if (
    usDate &&
    (date.getUTCMonth() !== Number(usDate[1]) - 1 ||
      date.getUTCDate() !== Number(usDate[2]))
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function isPromoted(value: string | undefined) {
  return ["true", "yes", "y", "1", "promo", "promoted"].includes(
    (value ?? "").trim().toLowerCase(),
  );
}

function parseSalesCsv(file: File): Promise<ParsedSales> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        const columns = {
          date: findHeader(headers, aliases.date),
          retailer: findHeader(headers, aliases.retailer),
          product: findHeader(headers, aliases.product),
          quantity: findHeader(headers, aliases.quantity),
          sales: findHeader(headers, aliases.sales),
          price: findHeader(headers, aliases.price),
          promotion: findHeader(headers, aliases.promotion),
        };
        const missing = [
          ["date", columns.date],
          ["retailer", columns.retailer],
          ["product", columns.product],
          ["quantity / units sold", columns.quantity],
        ]
          .filter(([, value]) => !value)
          .map(([label]) => label);

        if (!columns.sales && !columns.price) {
          missing.push("total sales or price per unit");
        }
        if (missing.length > 0) {
          reject(
            new Error(
              `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
            ),
          );
          return;
        }

        const rows: Sale[] = [];
        const invalidRows: InvalidRow[] = [];
        result.data.forEach((raw, index) => {
          const date = parseDate(raw[columns.date!]);
          const retailer = raw[columns.retailer!]?.trim() ?? "";
          const product = raw[columns.product!]?.trim() ?? "";
          const quantity = parseNumber(raw[columns.quantity!]);
          const totalSales = columns.sales
            ? parseNumber(raw[columns.sales])
            : columns.price
              ? parseNumber(raw[columns.price]) * quantity
              : Number.NaN;
          const reasons: string[] = [];

          if (!date) reasons.push("Invalid or missing date");
          if (!retailer) reasons.push("Missing retailer");
          if (!product) reasons.push("Missing product");
          if (!Number.isFinite(quantity) || quantity <= 0) {
            reasons.push("Quantity must be greater than zero");
          }
          if (!Number.isFinite(totalSales) || totalSales < 0) {
            reasons.push("Sales value must be zero or greater");
          }

          if (reasons.length > 0) {
            invalidRows.push({ rowNumber: index + 2, reasons });
          } else {
            rows.push({
              date: date!,
              retailer,
              product,
              quantity,
              sales: totalSales,
              promoted: isPromoted(columns.promotion ? raw[columns.promotion] : undefined),
              raw,
            });
          }
        });

        resolve({
          rows,
          invalidRows,
          headers,
          hasPromotion: Boolean(columns.promotion),
        });
      },
      error: (error) => reject(error),
    });
  });
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedSales | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a CSV file.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const result = await parseSalesCsv(file);
      if (result.rows.length === 0 && result.invalidRows.length === 0) {
        throw new Error("This CSV does not contain any data rows.");
      }
      setParsed(result);
      setFileName(file.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The CSV could not be read.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <main className="main-content">
        <header className="topbar"><strong>CSV Analysis Application</strong></header>
        <div className="page-content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">SALES CSV</p>
              <h1>Sales overview</h1>
              <p className="page-subtitle">Upload and validate a sales file to get started.</p>
            </div>
          </section>

          {!parsed ? (
            <section className="upload-card">
              <h2>{isLoading ? "Reading your CSV…" : "Start with your sales data"}</h2>
              <p>Choose a CSV file from your computer.</p>
              <button className="button button-primary" onClick={() => fileInput.current?.click()} disabled={isLoading}>
                Browse files
              </button>
              <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <p className="upload-hint">Required: Date, Retailer, Product, Units Sold, and Total Sales.</p>
              {error && <div className="error-message" role="alert">{error}</div>}
            </section>
          ) : (
            <>
              <section className="file-banner">
                <strong>{fileName} — {parsed.rows.length.toLocaleString()} valid rows</strong>
              </section>
              {parsed.invalidRows.length > 0 && (
                <section className="validation-warning">
                  {parsed.invalidRows.length} invalid rows skipped
                  <div className="invalid-list">
                    {parsed.invalidRows.map((row) => (
                      <div className="invalid-row" key={row.rowNumber}>
                        Row {row.rowNumber}: {row.reasons.join(" · ")}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section className="table-card">
                <div className="section-heading"><h2>Validated sales rows</h2></div>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Date</th><th>Retailer</th><th>Product</th><th>Quantity</th><th>Sales</th></tr></thead>
                    <tbody>
                      {parsed.rows.map((row, index) => (
                        <tr key={`${row.date}-${row.retailer}-${index}`}>
                          <td>{row.date}</td><td>{row.retailer}</td><td>{row.product}</td><td>{row.quantity}</td><td>{row.sales}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
