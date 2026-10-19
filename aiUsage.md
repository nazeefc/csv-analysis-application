# AI Usage

## AI Tools Used

- ChatGPT
- GitHub Copilot

## Overview

AI was used as a development assistant throughout this project, especially for TypeScript concepts, CSV parsing workflows, data validation approaches, chart implementation, and code refactoring.

The final implementation was manually reviewed, tested, and modified before submission.

## Five Important Prompts

1. **CSV parsing:** How can I parse CSV files in a React TypeScript application using PapaParse?
2. **CSV row validation:** Show an example of validating uploaded CSV rows and separating invalid records from valid records.
3. **Local storage validation:** How can I create a reusable TypeScript type guard for validating parsed localStorage data?
4. **Sales metrics:** How can I calculate sales metrics such as total sales value, average selling price, and promotion percentage in React?
5. **Chart creation:** Create a responsive bar chart using Recharts to visualize filtered sales data.

## AI-Generated Code Parts

AI assistance was used for:

- PapaParse integration examples
- TypeScript type definitions
- Type guards
- LocalStorage persistence patterns
- Analytics calculation examples
- CSV export approach
- React hook optimization ideas
- Recharts implementation examples
- Form and validation logic
- Error handling structure

Examples:

```ts
type Sale = {
  date: string;
  retailer: string;
  product: string;
  quantity: number;
  sales: number;
  promoted: boolean;
};
```

```ts
function isParsedSales(value: unknown): value is ParsedSales
```

```ts
const metrics = useMemo(() => {
  // Calculate metrics from the filtered rows.
}, [filteredRows]);
```

## Mistakes Found

### 1. LocalStorage Validation

An early AI-generated approach directly trusted data loaded from localStorage:

```ts
const value = JSON.parse(stored);
```

**Problem:** Corrupted or unexpected data could cause the application to fail.

**Correction:** Added runtime validation using a type guard:

```ts
function isParsedSales(value: unknown): value is ParsedSales
```

Only validated data is restored into the application.

### 2. CSV Sales Calculation

An early AI suggestion assumed every CSV would provide a `Total Sales` column.

**Problem:** Some datasets may contain `Price Per Unit` instead of `Total Sales`.

**Correction:** Added support for both formats:

```ts
const totalSales = columns.sales
  ? parseNumber(raw[columns.sales])
  : columns.price
    ? parseNumber(raw[columns.price]) * quantity
    : Number.NaN;
```

This improved compatibility with multiple CSV formats.

## Corrections Made

1. Added runtime validation for stored analysis data.
2. Added fallback sales calculation using `Price Per Unit`.
3. Improved date parsing and validation.
4. Added invalid-row reporting instead of rejecting the entire file.
5. Tested chart rendering with different datasets and filter combinations.
6. Added CSV export functionality for filtered records.

## What I Learned

During this project, AI helped me learn about:

- CSV parsing with PapaParse
- TypeScript type guards
- Data validation techniques
- React memoization with `useMemo`
- Browser `localStorage` handling
- Recharts integration
- CSV export generation

## Verification Process

Before submission, the application was tested for:

- CSV upload functionality
- CSV validation rules
- Invalid-row detection
- Retailer filtering
- Product filtering
- Date-range filtering
- Sales metric calculations
- Chart rendering
- CSV export functionality
- LocalStorage persistence

## Summary

AI was used as a learning and development assistant, particularly for TypeScript, CSV processing, and chart implementation. All AI-generated code was reviewed, tested, and adjusted before being included in the final project.
