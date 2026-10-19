import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

type SavedAnalysis = {
  version: 1;
  parsed: ParsedSales;
  fileName: string;
};

const STORAGE_KEY = "sales-csv-analysis";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isParsedSales(value: unknown): value is ParsedSales {
  if (!isRecord(value)) return false;
  const rows = value.rows;
  const invalidRows = value.invalidRows;
  const headers = value.headers;
  return (
    Array.isArray(rows) &&
    rows.every(
      (row) =>
        isRecord(row) &&
        typeof row.date === "string" &&
        typeof row.retailer === "string" &&
        typeof row.product === "string" &&
        typeof row.quantity === "number" &&
        typeof row.sales === "number" &&
        typeof row.promoted === "boolean" &&
        isRecord(row.raw) &&
        Object.values(row.raw).every((cell) => typeof cell === "string"),
    ) &&
    Array.isArray(invalidRows) &&
    invalidRows.every(
      (row) =>
        isRecord(row) &&
        typeof row.rowNumber === "number" &&
        Array.isArray(row.reasons) &&
        row.reasons.every((reason) => typeof reason === "string"),
    ) &&
    Array.isArray(headers) &&
    headers.every((header) => typeof header === "string") &&
    typeof value.hasPromotion === "boolean"
  );
}

function loadSavedAnalysis(): { parsed: ParsedSales | null; fileName: string; error: string } {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return { parsed: null, fileName: "", error: "" };

    const value: unknown = JSON.parse(saved);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      typeof value.fileName !== "string" ||
      !isParsedSales(value.parsed)
    ) {
      return {
        parsed: null,
        fileName: "",
        error: "Saved analysis data is invalid. Upload the CSV again to continue.",
      };
    }

    return { parsed: value.parsed, fileName: value.fileName, error: "" };
  } catch (caught) {
    return {
      parsed: null,
      fileName: "",
      error: `Could not restore saved analysis: ${
        caught instanceof Error ? caught.message : "local storage is unavailable"
      }`,
    };
  }
}

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
  const [savedAnalysis] = useState(loadSavedAnalysis);
  const fileInput = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedSales | null>(savedAnalysis.parsed);
  const [fileName, setFileName] = useState(savedAnalysis.fileName);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [storageError, setStorageError] = useState(savedAnalysis.error);
  const [dateFilter, setDateFilter] = useState("");
  const [retailerFilter, setRetailerFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [showInvalidRows, setShowInvalidRows] = useState(false);

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

  const filteredRows = (parsed?.rows ?? []).filter(
    (row) =>
      (!dateFilter || row.date === dateFilter) &&
      (!retailerFilter || row.retailer === retailerFilter) &&
      (!productFilter || row.product === productFilter),
  );
  const totalQuantity = filteredRows.reduce((sum, row) => sum + row.quantity, 0);
  const totalSales = filteredRows.reduce((sum, row) => sum + row.sales, 0);
  const averagePrice = totalQuantity === 0 ? 0 : totalSales / totalQuantity;
  const promotionPercentage =
    filteredRows.length === 0 || !parsed?.hasPromotion
      ? 0
      : (filteredRows.filter((row) => row.promoted).length / filteredRows.length) * 100;
  const retailerOptions = [...new Set((parsed?.rows ?? []).map((row) => row.retailer))].sort();
  const productOptions = [...new Set((parsed?.rows ?? []).map((row) => row.product))].sort();

  useEffect(() => {
    if (!parsed || !fileName) return;
    try {
      const saved: SavedAnalysis = { version: 1, parsed, fileName };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setStorageError("");
    } catch (caught) {
      setStorageError(
        `Could not save analysis: ${
          caught instanceof Error ? caught.message : "local storage is unavailable"
        }`,
      );
    }
  }, [parsed, fileName]);

  function downloadFilteredCsv() {
    if (!parsed) return;
    const csv = Papa.unparse(filteredRows.map((row) => row.raw), {
      columns: parsed.headers,
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "filtered-sales.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const productSales = Object.values(
    filteredRows.reduce<Record<string, { product: string; sales: number }>>((groups, row) => {
      groups[row.product] ??= { product: row.product, sales: 0 };
      groups[row.product].sales += row.sales;
      return groups;
    }, {}),
  );

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
              {storageError && <div className="error-message" role="alert">{storageError}</div>}
            </section>
          ) : (
            <>
              <section className="file-banner">
                <div className="file-info">
                  <div>
                    <strong>{fileName}</strong>
                    <span>{parsed.rows.length.toLocaleString()} valid rows</span>
                  </div>
                </div>
                <div className="file-actions">
                  <button className="button button-primary" onClick={downloadFilteredCsv}>
                    Download filtered CSV
                  </button>
                </div>
              </section>
              {storageError && <div className="error-message inline-error" role="alert">{storageError}</div>}
              {parsed.invalidRows.length > 0 && (
                <section className="validation-warning">
                  <div className="warning-copy">
                    <span className="warning-mark">!</span>
                    <span>
                      <strong>{parsed.invalidRows.length} invalid rows skipped</strong>
                      <small>Invalid rows are excluded from your analysis.</small>
                    </span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setShowInvalidRows((visible) => !visible)}
                  >
                    {showInvalidRows ? "Hide details" : "View details"}
                  </button>
                </section>
              )}
              {showInvalidRows && parsed.invalidRows.length > 0 && (
                <section className="invalid-panel">
                  <strong>Invalid rows</strong>
                  <div className="invalid-list">
                    {parsed.invalidRows.map((row) => (
                      <div className="invalid-row" key={row.rowNumber}>
                        <span>Row {row.rowNumber}</span>
                        <span>{row.reasons.join(" · ")}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section className="filter-panel">
                <div className="filter-heading">
                  <span className="filter-label">Filter sales data</span>
                  <span className="filter-count">
                    {filteredRows.length} of {parsed.rows.length} valid rows
                  </span>
                </div>
                <div className="filter-controls">
                  <label className="filter-control">
                    <span>Date</span>
                    <input
                      type="date"
                      value={dateFilter}
                      onChange={(event) => setDateFilter(event.target.value)}
                    />
                  </label>
                  <label className="filter-control">
                    <span>Retailer</span>
                    <select value={retailerFilter} onChange={(event) => setRetailerFilter(event.target.value)}>
                      <option value="">All retailers</option>
                      {retailerOptions.map((retailer) => <option key={retailer}>{retailer}</option>)}
                    </select>
                  </label>
                  <label className="filter-control">
                    <span>Product</span>
                    <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
                      <option value="">All products</option>
                      {productOptions.map((product) => <option key={product}>{product}</option>)}
                    </select>
                  </label>
                  {(dateFilter || retailerFilter || productFilter) && (
                    <button
                      className="reset-button"
                      onClick={() => {
                        setDateFilter("");
                        setRetailerFilter("");
                        setProductFilter("");
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </section>

              <section className="metrics-grid">
                <article className="metric-card">
                  <div className="metric-top">Total quantity</div>
                  <strong>{totalQuantity.toLocaleString()}</strong>
                  <small>Units sold in selected data</small>
                </article>
                <article className="metric-card">
                  <div className="metric-top">Total sales value</div>
                  <strong>{totalSales.toLocaleString(undefined, { style: "currency", currency: "USD" })}</strong>
                  <small>Revenue in selected data</small>
                </article>
                <article className="metric-card">
                  <div className="metric-top">Average selling price</div>
                  <strong>{averagePrice.toLocaleString(undefined, { style: "currency", currency: "USD" })}</strong>
                  <small>Sales value per unit</small>
                </article>
                <article className="metric-card">
                  <div className="metric-top">Promotion percentage</div>
                  <strong>{parsed.hasPromotion ? `${promotionPercentage.toFixed(1)}%` : "N/A"}</strong>
                  <small>{parsed.hasPromotion ? "Rows marked as promoted" : "No promotion column"}</small>
                </article>
              </section>
              <section className="chart-card">
                <div className="section-heading"><h2>Sales by product</h2></div>
                {productSales.length > 0 ? (
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={productSales}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="product" />
                        <YAxis />
                        <Tooltip
                          formatter={(value) =>
                            Number(value).toLocaleString(undefined, {
                              style: "currency",
                              currency: "USD",
                            })
                          }
                        />
                        <Bar dataKey="sales" fill="#66806b" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="empty-chart">No sales data matches the selected filters.</div>
                )}
              </section>
              <section className="table-card">
                <div className="section-heading"><h2>Validated sales rows</h2></div>
                <div className="table-scroll">
                  {filteredRows.length > 0 ? (
                    <table>
                      <thead><tr><th>Date</th><th>Retailer</th><th>Product</th><th>Quantity</th><th>Sales</th></tr></thead>
                      <tbody>
                        {filteredRows.map((row, index) => (
                          <tr key={`${row.date}-${row.retailer}-${index}`}>
                            <td>{row.date}</td><td>{row.retailer}</td><td>{row.product}</td><td>{row.quantity}</td><td>{row.sales.toLocaleString(undefined, { style: "currency", currency: "USD" })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="table-empty">No rows match the selected filters.</div>
                  )}
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
