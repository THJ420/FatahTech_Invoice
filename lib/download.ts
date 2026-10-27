/**
 * Trigger a browser download for a Blob.
 *
 * The old code revoked the object URL immediately after `a.click()` and never
 * attached the anchor to the document. Desktop Chrome tolerates both, but
 * Android Chrome (and iOS Safari) resolve the URL asynchronously after the
 * click: revoking it first leaves the download with nothing to read, so the
 * tap appeared to do nothing. An anchor that is not in the document can also
 * be ignored by mobile browsers.
 *
 * Keeping the URL alive for a short window fixes that without leaking it for
 * the lifetime of the page. The anchor is removed immediately.
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";

    // Must be in the document for mobile Chrome to honour `download`.
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    /*
     * 30s is deliberately generous. A large PDF over a slow mobile connection
     * can still be reading the blob when a 1s timer fires, and the user sees a
     * failed download with no error. The blob is released when the page is
     * closed in any case.
     */
    window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
    }, 30_000);
}
