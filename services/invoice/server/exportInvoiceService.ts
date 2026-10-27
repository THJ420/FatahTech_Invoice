import { NextRequest, NextResponse } from "next/server";

// JSON2CSV
import { AsyncParser } from "@json2csv/node";

// XML2JS
import { Builder } from "xml2js";

// e-invoices
import { XRechnungError } from "@conformo/formats";
import {
    EInvoiceMappingError,
    buildEInvoiceXml,
    type EInvoiceXmlFormat,
} from "@/lib/einvoice";

// Validation
import { InvoiceSchema } from "@/lib/schemas";
import {
    MAX_JSON_BODY_BYTES,
    parseJsonBody,
} from "@/lib/server/validateRequest";

// Types
import { ExportTypes, type InvoiceType } from "@/types";

/**
 * RFC 6266 download header.
 *
 * A Content-Disposition header must be ASCII, but invoice numbers are not
 * always ASCII. The fallback name is transliterated down to safe characters and
 * the real name travels in `filename*`, which every current browser honours.
 */
function contentDisposition(filename: string): string {
    const fallback =
        filename
            .replace(/[^\x20-\x7E]/g, "-")
            .replace(/["\\]/g, "-")
            .slice(0, 120) || "invoice";

    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
        filename
    )}`;
}

/**
 * Shared error mapping for the e-invoice XML paths. XRechnung's precondition
 * failure is a user-fixable problem (missing VAT ID, contact phone, …), so it
 * is a 422 with the list of fields rather than a generic 500.
 */
function eInvoiceErrorResponse(error: unknown): NextResponse | null {
    if (error instanceof XRechnungError) {
        return NextResponse.json(
            {
                error: "This invoice is missing information XRechnung requires.",
                issues: error.issues,
            },
            { status: 422 }
        );
    }

    if (error instanceof EInvoiceMappingError) {
        return NextResponse.json({ error: error.message }, { status: 422 });
    }

    return null;
}

function xmlResponse(invoice: InvoiceType, format: EInvoiceXmlFormat) {
    try {
        const { xml, filename } = buildEInvoiceXml(invoice, format);
        return new NextResponse(xml, {
            headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Content-Disposition": contentDisposition(filename),
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        const mapped = eInvoiceErrorResponse(error);
        if (mapped) return mapped;
        throw error;
    }
}

/**
 * Export an invoice in selected format.
 *
 * @param {NextRequest} req - The Next.js request object.
 * @returns {NextResponse} A response object containing the exported data in the requested format.
 */
export async function exportInvoiceService(req: NextRequest) {
    const format = req.nextUrl.searchParams.get("format");

    /*
     * The parsed body is handed to xml2js and json2csv, both of which walk the
     * whole structure. Validating first means they only ever see an
     * invoice-shaped object, rather than arbitrary deeply-nested JSON.
     */
    const parsed = await parseJsonBody(req, InvoiceSchema);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data;

    try {
        switch (format) {
            case ExportTypes.JSON: {
                const jsonData = JSON.stringify(body);
                return new NextResponse(jsonData, {
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Disposition":
                            "attachment; filename=invoice.json",
                    },
                    status: 200,
                });
            }
            case ExportTypes.CSV: {
                //? Can pass specific fields to async parser. Empty = All
                const parser = new AsyncParser();
                const csv = await parser.parse(body).promise();
                return new NextResponse(csv, {
                    headers: {
                        "Content-Type": "text/csv",
                        "Content-Disposition":
                            "attachment; filename=invoice.csv",
                    },
                });
            }
            case ExportTypes.XML: {
                // Convert JSON to XML
                const builder = new Builder();
                const xml = builder.buildObject(body);
                return new NextResponse(xml, {
                    headers: {
                        "Content-Type": "application/xml",
                        "Content-Disposition":
                            "attachment; filename=invoice.xml",
                    },
                });
            }
            case ExportTypes.XRECHNUNG_UBL:
                return xmlResponse(body, "XRECHNUNG_UBL");
            case ExportTypes.XRECHNUNG_CII:
                return xmlResponse(body, "XRECHNUNG_CII");
            case ExportTypes.ZUGFERD_CII:
                return xmlResponse(body, "ZUGFERD_CII");
            /*
             * ExportTypes.XLSX is intentionally unimplemented. The original
             * case was commented out, so the UI's "Export as XLSX" button only
             * ever errored; that button has been removed rather than left
             * broken. Restoring it needs a spreadsheet library — note the
             * `xlsx` package was dropped here because the 0.18.5 line on npm
             * carries unpatched advisories and SheetJS now publishes from its
             * own registry.
             */
            default:
                /*
                 * Previously absent: an unknown format fell out of the switch
                 * and returned undefined, which Next surfaces as an opaque
                 * "no response returned" 500 rather than a usable error.
                 */
                return NextResponse.json(
                    { error: `Unsupported export format: ${format ?? "none"}` },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error("Export error:", error);

        return NextResponse.json(
            { error: "Failed to export invoice" },
            { status: 500 }
        );
    }
}
