# FatahTech Invoice

FatahTech Invoice is a free, web-based invoice generator built with Next.js, TypeScript, React and the shadcn/ui library. Fill in a form, pick a template and print a polished invoice — or use the print dialog to save it as a PDF. For batches, upload a CSV or Excel file and download every invoice as a ZIP.

No account, no subscription, and no invoice data stored on a server.

![FatahTech Invoice](public/assets/logo_dark_no_txt.webp)

## Table of Contents

- [FatahTech Invoice](#fatahtech-invoice)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Bulk export](#bulk-export)
  - [Your data stays in your browser](#your-data-stays-in-your-browser)
  - [Languages](#languages)
  - [E-invoices](#e-invoices)
  - [Technologies](#technologies)
  - [Getting Started](#getting-started)
  - [Development](#development)
  - [License](#license)

## Features

- **15 invoice templates:** Classic, Modern, Sidebar, Bold Header, Minimal, Letterhead, Compact, Two-Tone, Bordered, Left Rail, Statement, Corner, Column, Proforma and Packing List.
- **Live preview:** edit the form and watch the invoice update as you type.
- **Print or save as PDF:** the invoice is laid out locally and handed to your browser's print engine; choose “Save as PDF” for a vector document with embedded fonts.
- **Bulk export:** turn a CSV, XLS or XLSX file into a ZIP of PDF invoices, with column mapping and multi-item invoices.
- **Save and reload:** keep invoices in your browser and load them back later.
- **Address book:** save senders and clients once, reuse them on every invoice.
- **Export:** download the invoice data as JSON, CSV or XML, or as a standards-compliant e-invoice (XRechnung UBL/CII, ZUGFeRD CII).
- **Custom header and footer:** add your own lines above and below every template.
- **Signatures, logos and custom line items,** including per-invoice tax, discount and shipping.
- **18 languages,** for both the interface and the printed invoice, including Simplified Chinese, Hebrew and Arabic glyphs.
- **Responsive:** works on a phone as well as a desktop.

## Bulk export

The toolbar's **Bulk Export** wizard runs entirely in the browser:

1. **Upload** a `.csv`, `.xls` or `.xlsx` file, or start from one of the sample files in [`public/templates`](public/templates).
2. **Map** the detected columns to invoice fields. Rows sharing an `InvoiceNumber` become one invoice with several line items.
3. **Style** the batch with one of the 15 templates, four typefaces, a density and an accent colour.
4. **Preview** the first record as a real A4 page before committing.
5. **Export**: each invoice is rendered in an off-screen 794px frame, captured at 2×, sliced onto A4 pages and packed into `invoices_bulk_export.zip` with JSZip.

The spreadsheet parser, PDF renderer and ZIP builder all load on demand. No invoice data is uploaded, and no API route is called during a batch.

> [!NOTE]
> Bulk PDFs are rasterised from the same HTML templates as the live preview, so they match the selected template and theme exactly but their text is not selectable. Browser printing (and “Save as PDF” from the print dialog) still produces vector output.

## Your data stays in your browser

FatahTech Invoice has no accounts and no database. Everything you enter (the address book, the autosave draft and your saved invoices) is stored locally, and it is encrypted at rest with AES-GCM 256 under a key the browser generates as non-extractable, so the key cannot be copied out of the origin.

Two things worth being clear about:

- This protects you against someone **reading the browser profile off disk**: a shared or stolen machine, a filesystem backup, a synced profile, another OS account.
- It does **not** protect against a script injected into the page, which holds the same key handle the app does. Defending against that would need a passphrase the app never stores.

Printing and bulk export never send invoice data anywhere: the documents are built in the page and handed to the browser. Data leaves your machine only when you explicitly export a file — JSON, CSV, XML or an e-invoice — to the export endpoint, which returns the file and retains nothing.

## Languages

Arabic, Azerbaijani, Catalan, Chinese (Simplified), English, French, German, Hebrew, Indonesian, Italian, Japanese, Norwegian (Bokmål), Norwegian (Nynorsk), Polish, Portuguese (Brazil), Serbian, Spanish and Turkish.

Right-to-left layouts are supported for Arabic and Hebrew. Some translations are still incomplete and fall back to English.

## E-invoices

The export dialog can produce EN 16931 e-invoices:

- **XRechnung 3.0** in UBL and CII syntax (German B2G/B2B).
- **ZUGFeRD CII** — the plain EN 16931 Cross-Industry Invoice XML.

The mapping is deliberately strict. A country typed as free text is resolved to its ISO 3166-1 code, dates become ISO dates, and the form's single tax rate becomes a VAT category per line. When XRechnung requires something the invoice does not have — a seller VAT/tax ID, a buyer reference, a contact phone — the export returns a 422 naming the missing fields rather than producing a file a recipient will reject.

## Technologies

**Core:** Next.js 15, TypeScript, React, Tailwind CSS, shadcn/ui, React Hook Form, Zod and next-intl.

**Client-side export:** SheetJS (`@e965/xlsx`) for CSV/XLS/XLSX parsing, jsPDF for PDF assembly, modern-screenshot for template capture and JSZip for the archive. All four are dynamically imported.

**Other:** Conformo (EN 16931 serializers), Lucide icons and Playwright (end-to-end tests).

## Getting Started

### Prerequisites

- Node.js 20 or later, and npm.

### Installation

1. Clone the repository and install dependencies:

   ```bash
   git clone <repository-url>
   cd fatahtech-invoice
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).

No environment variables are required for the invoice builder, printing or bulk export. Set `NEXT_PUBLIC_SITE_URL` if you deploy somewhere other than the default canonical origin.

## Development

### Scripts

| Command               | What it does                               |
| --------------------- | ------------------------------------------ |
| `npm run dev`         | Development server.                        |
| `npm run build`       | Production build.                          |
| `npm run start`       | Serve the production build.                |
| `npm run lint`        | ESLint.                                    |
| `npm run format`      | Prettier, writing in place.                |
| `npm run test:e2e`    | Playwright end-to-end tests.               |
| `npm run test:e2e:ui` | The same tests in Playwright's UI mode.    |
| `npm run analyze`     | Production build with the bundle analyzer. |
| `npx tsc --noEmit`    | Typecheck.                                 |

### Tests

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

The suite builds and serves the production bundle, then runs against it in a desktop and a mobile viewport. It covers printing, the bulk-export wizard, CSV→ZIP output and XLSX parsing. CI runs the same typecheck, lint and test steps on every push and pull request. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.
