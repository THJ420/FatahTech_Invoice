// Variables
import { EXPORT_INVOICE_API } from "@/lib/variables";

// Helpers
import { downloadBlob } from "@/lib/download";

// Types
import { ExportTypes, InvoiceType } from "@/types";

/**
 * Reads the download name the server chose.
 *
 * `filename*` is the UTF-8 form and wins when present; `filename` is the ASCII
 * fallback. Falls back to the old `invoice.<format>` shape for responses that
 * predate the header.
 */
function filenameFromDisposition(
    header: string | null,
    fallback: string
): string {
    if (!header) return fallback;

    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (encoded) {
        try {
            return decodeURIComponent(encoded[1]);
        } catch {
            // Malformed percent-encoding — use the plain name below.
        }
    }

    const plain = /filename="?([^";]+)"?/i.exec(header);
    return plain?.[1] || fallback;
}

/**
 * Export an invoice by sending a POST request to the server and initiating the download.
 *
 * Every supported format is a serialisation of the invoice JSON, so the request
 * is a plain JSON POST.
 *
 * @param {ExportTypes} exportAs - The format in which to export the invoice (e.g., JSON, CSV).
 * @param {InvoiceType} formValues - The invoice form data to be exported.
 * @throws {Error} If there is an error during the export process.
 * @returns {Promise<void>} A promise that resolves when the export is completed.
 */
export const exportInvoice = async (
    exportAs: ExportTypes,
    formValues: InvoiceType
) => {
    const response = await fetch(`${EXPORT_INVOICE_API}?format=${exportAs}`, {
        method: "POST",
        body: JSON.stringify(formValues),
        headers: { "Content-Type": "application/json" },
    });

    /*
     * Without this check an error response was still passed to `.blob()` and
     * downloaded as `invoice.<format>`, so the user got a file containing the
     * server's error text instead of being told the export failed.
     *
     * The server explains why an e-invoice was refused (a missing VAT ID, a
     * country it cannot resolve, …); surfacing that is the difference between
     * a fixable problem and "something went wrong".
     */
    if (!response.ok) {
        let message = `Export failed with status ${response.status}`;

        try {
            const data = await response.json();
            if (typeof data?.error === "string") message = data.error;

            if (Array.isArray(data?.issues) && data.issues.length > 0) {
                const details = data.issues
                    .slice(0, 3)
                    .map((issue: unknown) =>
                        typeof issue === "string"
                            ? issue
                            : typeof issue === "object" &&
                                issue !== null &&
                                "message" in issue
                              ? String((issue as { message: unknown }).message)
                              : ""
                    )
                    .filter(Boolean)
                    .join(" ");

                if (details) message = `${message} ${details}`;
            }
        } catch {
            // Non-JSON error body (a proxy timeout page, for example).
        }

        throw new Error(message);
    }

    const blob = await response.blob();
    const fallback = `invoice.${exportAs.toLowerCase()}`;

    downloadBlob(
        blob,
        filenameFromDisposition(
            response.headers.get("Content-Disposition"),
            fallback
        )
    );
};
