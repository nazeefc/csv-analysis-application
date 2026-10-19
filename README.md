# CSV Analysis Application

A browser-based sales CSV analysis app built with React and TypeScript. Upload a CSV to validate rows, filter sales data, view metrics and a daily sales chart, and export the filtered results.

## Requirements

- Node.js (LTS recommended)
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite in your terminal.

## CSV format

Each CSV needs columns for:

- Date
- Retailer
- Product
- Units Sold (or Quantity)
- Total Sales (or Sales Value)

Alternatively, provide **Price per Unit** (or Unit Price) instead of Total Sales. **Promotion** is optional; values such as `Yes`, `True`, or `1` count as promoted.

Rows with missing or invalid values are skipped and listed in the app. Header names are case-insensitive; common alternatives such as `Order Date`, `Store`, `Item`, `Quantity`, and `Revenue` are also recognized.

## Features

- CSV upload and validation with invalid-row details
- Date, retailer, and product filters
- Total quantity, sales value, average selling price, and promotion percentage
- Daily sales chart and validated sales table
- Export filtered rows as a CSV file
- Save and restore the uploaded analysis using browser `localStorage`

## Production build

```bash
npm run build
npm run preview
```

The production files are generated in `dist/`. For a static hosting provider such as Vercel or Netlify, use `npm run build` as the build command and `dist` as the output directory.

## Data and privacy

CSV parsing and analysis happen in the browser. Parsed sales data is stored in that browser's `localStorage`; it is not synced to another browser or device and is cleared when **Clear data** is selected.
