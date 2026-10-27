import fs from "node:fs";

import { test, expect, type Frame, type Page } from "@playwright/test";
import JSZip from "jszip";

// App constants
import { LOCALES } from "@/lib/variables";

/**
 * Smoke tests — a tripwire, not coverage.
 *
 * Each of these asserts something a type checker cannot: that the app renders,
 * that state changes do not loop, that the layout does not overflow, and that
 * printing produces a clean document without leaving the browser.
 */

/**
 * Requests that legitimately fail outside a Vercel deployment.
 *
 * The analytics script is injected by @vercel/analytics and is only served by
 * Vercel's edge, so it 404s on any local or CI run. Allow-listing it by URL
 * keeps the assertion strict about everything else, rather than the easier and
 * much worse option of ignoring 404s in general.
 */
const EXPECTED_FAILING_REQUESTS = [/\/_vercel\/insights\//];

/**
 * Records console errors and failed requests.
 *
 * This is the check that would have caught round 2's render loop: React logs
 * "Maximum update depth exceeded" as a console error while the page is
 * otherwise still serving HTML, so an HTTP-level check sees nothing wrong.
 *
 * "Failed to load resource" console messages are dropped because the browser
 * reports them without a URL — the network listener below catches the same
 * failures and can say which request it was.
 */
function collectProblems(page: Page, problems: string[]) {
    page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (text.includes("Failed to load resource")) return;
        problems.push(`console: ${text}`);
    });

    page.on("pageerror", (err) => problems.push(`pageerror: ${err}`));

    page.on("response", (res) => {
        if (res.status() < 400) return;
        const url = res.url();
        if (EXPECTED_FAILING_REQUESTS.some((re) => re.test(url))) return;

        problems.push(`http ${res.status()}: ${url}`);
    });
}

/**
 * Opens the app's encrypted store inside the page and returns its handles.
 *
 * A test can no longer read these keys with JSON.parse — everything the app
 * persists about people is encrypted at rest. This pulls the origin's key back
 * out of IndexedDB and uses it, which is exactly the point: the key is
 * non-extractable so nothing can copy it out, but anything running on the
 * origin can still use it.
 */
const VAULT_SETUP = `
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("fatahtech-secure", 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const idbGet = (store, id) => new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
`;

/** Decrypts one stored value, or reads a legacy plaintext one. */
async function readStored<T>(
    page: Page,
    storageKey: string
): Promise<T | null> {
    return page.evaluate<T | null, string>(
        new Function(
            "key",
            `return (async () => {
        ${VAULT_SETUP}
        const stored = await idbGet("values", key);
        if (!stored) {
          const raw = window.localStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        }
        const cryptoKey = await idbGet("keys", "storage-key");
        const bytes = new Uint8Array(stored);
        const plaintext = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: bytes.subarray(0, 12) },
          cryptoKey,
          bytes.subarray(12)
        );
        return JSON.parse(new TextDecoder().decode(plaintext));
      })();`
        ) as (key: string) => Promise<T | null>,
        storageKey
    );
}

/**
 * Everything on disk for one key, as text, for asserting what is *not* legible
 * in it: the ciphertext bytes plus whatever localStorage still holds.
 */
async function rawStored(page: Page, storageKey: string): Promise<string> {
    return page.evaluate<string, string>(
        new Function(
            "key",
            `return (async () => {
        ${VAULT_SETUP}
        const stored = await idbGet("values", key);
        const bytes = stored ? Array.from(new Uint8Array(stored)) : [];
        const asText = bytes.map((b) => String.fromCharCode(b)).join("");
        return (window.localStorage.getItem(key) || "") + asText;
      })();`
        ) as (key: string) => Promise<string>,
        storageKey
    );
}

/** True when the key has ciphertext in the encrypted store. */
async function isEncrypted(page: Page, storageKey: string): Promise<boolean> {
    return page.evaluate<boolean, string>(
        new Function(
            "key",
            `return (async () => {
        ${VAULT_SETUP}
        const stored = await idbGet("values", key);
        return Boolean(stored && stored.byteLength > 12);
      })();`
        ) as (key: string) => Promise<boolean>,
        storageKey
    );
}

/**
 * The language popover, wherever it is portalled to.
 *
 * Scoped by the BETA badge in its own header rather than by `role="dialog"`
 * alone: on a phone the switcher lives inside the settings Sheet, which is
 * also a dialog, and an unscoped locator matches both.
 */
function languageMenu(page: Page) {
    return page.getByRole("dialog").filter({ has: page.getByText("BETA") });
}

/**
 * Opens the language switcher on either layout. Below sm the navbar has no
 * room for it beside the logo, so it moves into the settings sheet.
 */
async function openLanguageMenu(page: Page) {
    if (page.viewportSize()!.width < 640) {
        await page.getByRole("button", { name: /open settings/i }).click();
    }
    await page.getByRole("button", { name: "Languages" }).click();
}

/**
 * Pre-populates the saved draft so a test starts from a filled invoice.
 *
 * Deliberately not the dev-only "Fill in the form" button: these tests run
 * against the production build, where that button does not exist. Providers
 * hydrates the form from this key on mount.
 *
 * Writes plaintext on purpose: that is the shape an older build left behind,
 * so every test that seeds also exercises the migration path.
 */
async function seedDraft(page: Page) {
    await page.addInitScript((invoice) => {
        window.localStorage.setItem(
            "fatahtech:invoiceDraft",
            JSON.stringify(invoice)
        );
    }, SAMPLE_INVOICE);
}

/**
 * Replaces `print` with a counter — on the page and on any frame it inserts.
 *
 * The native dialog is modal and cannot be dismissed from Playwright, and the
 * invoice is printed from a frame the service creates and writes synchronously.
 * An `addInitScript` on the page alone never reaches that frame's window, so a
 * MutationObserver patches it the moment it is inserted — which is before the
 * service calls `print` on it.
 *
 * `fail` makes the frame's `print` throw instead. That is the only remaining way
 * to reach the in-app fallback, now that printing no longer opens a popup that a
 * blocker could refuse.
 */
async function stubPrint(page: Page, { fail = false } = {}) {
    await page.context().addInitScript(
        ({ shouldFail }) => {
            const state = window as unknown as { __printCalls: number };
            state.__printCalls = 0;

            window.print = () => {
                state.__printCalls += 1;
            };

            const observer = new MutationObserver((records) => {
                for (const record of records) {
                    for (const node of Array.from(record.addedNodes)) {
                        if (!(node instanceof HTMLIFrameElement)) continue;

                        try {
                            node.contentWindow!.print = () => {
                                if (shouldFail)
                                    throw new Error("print blocked");
                                state.__printCalls += 1;
                            };
                        } catch {
                            // Cross-origin frame; not one of ours.
                        }
                    }
                }
            });

            observer.observe(document, { childList: true, subtree: true });
        },
        { shouldFail: fail }
    );
}

/** Every @font-face rule a document can read, as CSS text. */
function fontFaceRules(target: Frame): Promise<string> {
    return target.evaluate(() => {
        const rules: string[] = [];

        for (const sheet of Array.from(document.styleSheets)) {
            try {
                for (const rule of Array.from(sheet.cssRules)) {
                    if (rule instanceof CSSFontFaceRule) {
                        rules.push(rule.cssText);
                    }
                }
            } catch {
                // Cross-origin stylesheet; cannot be introspected.
            }
        }

        return rules.join("\n");
    });
}

/** Measures every element that sticks out past the viewport horizontally. */
async function horizontalOverflow(page: Page) {
    return page.evaluate(() => {
        const docWidth = document.documentElement.clientWidth;
        const offenders: { tag: string; cls: string; right: number }[] = [];

        document.querySelectorAll<HTMLElement>("*").forEach((el) => {
            // Elements that scroll horizontally on purpose are allowed to be
            // wider than the viewport — that is what the scroller is for.
            const style = getComputedStyle(el);
            if (style.overflowX === "auto" || style.overflowX === "scroll")
                return;
            if (el.closest("[data-allow-x-overflow]")) return;

            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            if (rect.right > docWidth + 1) {
                offenders.push({
                    tag: el.tagName.toLowerCase(),
                    cls: el.className?.toString().slice(0, 80) ?? "",
                    right: Math.round(rect.right - docWidth),
                });
            }
        });

        return {
            docWidth,
            scrollWidth: document.documentElement.scrollWidth,
            offenders,
        };
    });
}

test.describe("invoice builder", () => {
    test("renders without page problems", async ({ page }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await page.goto("/en");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator('input[name="sender.name"]')).toBeVisible();

        // Give any render loop a chance to announce itself.
        await page.waitForTimeout(1500);
        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("typing persists a draft without errors", async ({ page }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await page.goto("/en");
        const name = page.locator('input[name="sender.name"]');
        await name.fill("Alexandria Consulting Group");
        await expect(name).toHaveValue("Alexandria Consulting Group");

        // Past the autosave debounce.
        await page.waitForTimeout(1200);
        const draft = await readStored<{ sender: { name: string } }>(
            page,
            "fatahtech:invoiceDraft"
        );
        expect(
            draft,
            "draft should be written after the debounce"
        ).toBeTruthy();
        expect(draft!.sender.name).toBe("Alexandria Consulting Group");

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("every wizard step renders without horizontal overflow", async ({
        page,
    }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await page.goto("/en");

        const dots = page.locator("nav[aria-label] ol button");
        const count = await dots.count();
        expect(count).toBe(5);

        for (let i = 0; i < count; i++) {
            await dots.nth(i).click();
            await page.waitForTimeout(250);

            const { offenders, scrollWidth, docWidth } =
                await horizontalOverflow(page);
            expect(
                offenders,
                `step ${i + 1} overflows horizontally: ${JSON.stringify(offenders, null, 2)}`
            ).toEqual([]);
            expect(
                scrollWidth,
                `step ${i + 1} document scrolls sideways`
            ).toBeLessThanOrEqual(docWidth + 1);
        }

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("template gallery opens and switches template", async ({ page }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await page.goto("/en");
        await page.locator("nav[aria-label] ol button").nth(1).click();

        /*
         * Two entry points by design: the chip row above the invoice on
         * desktop, the labelled thumbnail inside the Details step below xl.
         * Both open the same dialog.
         *
         * `.or()` rather than sampling `count()`, because count does not
         * auto-wait and useIsDesktop is false on its first render — a bare
         * count can observe the moment before the chips mount.
         */
        const chip = page.getByRole("button", { name: /^Template/ });
        const thumbnail = page.getByRole("button", {
            name: /change template/i,
        });
        await chip.or(thumbnail).first().click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();

        // 15 layouts, each a pressable card.
        const cards = dialog
            .locator("button[aria-pressed]")
            .filter({ hasText: /./ });
        await expect(cards.first()).toBeVisible();

        await dialog.getByText("Sidebar", { exact: true }).click();
        await expect(dialog).toBeHidden();

        await page.waitForTimeout(500);
        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("step is reflected in the URL and survives reload", async ({
        page,
    }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await page.goto("/en");

        // Navigating updates the URL...
        await page.locator("nav[aria-label] ol button").nth(3).click();
        await expect(page).toHaveURL(/[?&]step=payment/);

        // ...and a reload lands back on the same step rather than step 1.
        await page.reload();
        await expect(
            page.locator("nav[aria-label] ol button").nth(3)
        ).toHaveAttribute("aria-current", "step");

        // Deep link straight to a step.
        await page.goto("/en?step=items");
        await expect(
            page.locator("nav[aria-label] ol button").nth(2)
        ).toHaveAttribute("aria-current", "step");

        // Back returns to the previous step rather than leaving the app.
        await page.goBack();
        await expect(page).toHaveURL(/[?&]step=payment/);

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("clicking the preview jumps to the field behind it", async ({
        page,
    }) => {
        test.skip(
            page.viewportSize()!.width < 1280,
            "the live preview is behind a sheet on mobile"
        );

        const problems: string[] = [];
        collectProblems(page, problems);

        await seedDraft(page);
        await page.goto("/en?step=summary");

        const region = page
            .locator('.invoice-live-preview [data-edit-field="receiver.name"]')
            .first();

        // Wait for the preview to actually render the seeded invoice rather
        // than guessing at a timeout.
        await expect(region).toBeVisible({ timeout: 15_000 });
        await region.click();

        await expect(page).toHaveURL(/[?&]step=from-and-to/);
        await expect(page.locator('input[name="receiver.name"]')).toBeFocused();

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("desktop shell pins the app and gives each pane its own scroll", async ({
        page,
    }) => {
        test.skip(
            page.viewportSize()!.width < 1280,
            "the shell is a desktop-only layout"
        );

        const problems: string[] = [];
        collectProblems(page, problems);

        await seedDraft(page);
        await page.goto("/en");
        await page.waitForTimeout(1200);

        const shell = await page.evaluate(() => {
            const de = document.documentElement;
            const panes = Array.from(document.querySelectorAll("div")).filter(
                (el) => {
                    const style = getComputedStyle(el);
                    return (
                        (style.overflowY === "auto" ||
                            style.overflowY === "scroll") &&
                        el.clientHeight > 200
                    );
                }
            );
            /*
             * The app region must fit the viewport without scrolling. The
             * document itself is much taller — the marketing section and the
             * footer sit below the fold on purpose — so measuring document
             * height would test the wrong thing.
             */
            const main = document.querySelector("main");
            const mainBottom = main
                ? main.getBoundingClientRect().bottom
                : Infinity;

            return {
                paneCount: panes.length,
                horizontal: de.scrollWidth > de.clientWidth + 1,
                mainBottom: Math.round(mainBottom),
                viewportHeight: de.clientHeight,
            };
        });

        expect(shell.paneCount, "form and preview should each scroll").toBe(2);
        expect(shell.horizontal).toBe(false);
        expect(
            shell.mainBottom,
            "the builder should fit the viewport without scrolling"
        ).toBeLessThanOrEqual(shell.viewportHeight + 1);

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("nothing overflows the narrow form rail", async ({ page }) => {
        test.skip(
            page.viewportSize()!.width < 1280,
            "the rail only exists in the desktop shell"
        );

        const problems: string[] = [];
        collectProblems(page, problems);

        await seedDraft(page);
        await page.goto("/en");

        /*
         * The mirror of the 375px audit, scoped to the form column. The rail is
         * ~420px inside a 1440px viewport, so a viewport breakpoint like `sm:`
         * would fire there and lay out for a width the column does not have.
         * The line-items step is the one that breaks first.
         */
        const dots = page.locator("nav[aria-label] ol button");
        const count = await dots.count();

        for (let i = 0; i < count; i++) {
            await dots.nth(i).click();
            await page.waitForTimeout(250);

            const result = await page.evaluate(() => {
                // Found by computed style: `.@container` is not a valid
                // CSS selector without escaping, and the escape differs
                // between the DOM API and Playwright's parser.
                const pane = [
                    ...document.querySelectorAll<HTMLElement>("div"),
                ].find(
                    (el) => getComputedStyle(el).containerType === "inline-size"
                );
                if (!pane)
                    return {
                        paneWidth: 0,
                        offenders: ["no @container pane found"],
                    };

                const right = pane.getBoundingClientRect().right;
                const offenders: string[] = [];

                pane.querySelectorAll<HTMLElement>("*").forEach((el) => {
                    const style = getComputedStyle(el);
                    if (
                        style.overflowX === "auto" ||
                        style.overflowX === "scroll"
                    )
                        return;
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return;
                    if (rect.right > right + 1) {
                        offenders.push(
                            `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 50)} +${Math.round(rect.right - right)}px`
                        );
                    }
                });

                return { paneWidth: Math.round(pane.clientWidth), offenders };
            });

            expect(
                result.offenders,
                `step ${i + 1} overflows the ${result.paneWidth}px rail`
            ).toEqual([]);
        }

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test.describe("printing", () => {
        test("print renders the invoice into an off-screen frame", async ({
            page,
        }) => {
            const problems: string[] = [];
            collectProblems(page, problems);

            await stubPrint(page);
            await seedDraft(page);
            await page.goto("/en");

            // The draft is applied after hydration; printing an empty form would
            // fail validation and never reach the print service.
            await expect(page.locator('input[name="sender.name"]')).toHaveValue(
                "John Doe"
            );

            const started = Date.now();

            await page
                .getByRole("button", { name: "Print invoice", exact: true })
                .click();

            /*
             * The button reads "Preparing…" for exactly as long as the service
             * is working, so waiting for its label to come back is the
             * user-visible measure of the whole operation. It used to sit there
             * for the better part of a minute while the service waited on fonts
             * and images it did not need.
             */
            await expect(
                page.getByRole("button", { name: "Print invoice", exact: true })
            ).toBeEnabled();

            expect(
                Date.now() - started,
                "the print dialog should open in well under a second"
            ).toBeLessThan(2000);

            // One frame, off-screen, holding the document.
            const frameEl = page.locator('iframe[title="Invoice print view"]');
            await expect(frameEl).toHaveCount(1);

            // A real Frame, not a FrameLocator: the @font-face audit has to run
            // inside the frame's own document.
            const printFrame = await (
                await frameEl.elementHandle()
            )!.contentFrame();
            expect(printFrame, "the print frame should be reachable").not.toBeNull();

            const paper = printFrame!.locator(".invoice-print-page");
            await expect(paper).toContainText("INV0001");
            await expect(paper).toContainText("John Doe");

            // No app chrome travels into the document.
            await expect(paper.getByText("Load Invoice")).toHaveCount(0);

            /*
             * The app's stylesheets are inlined, including the @font-face rules
             * the invoice templates name. Without these the printed page falls
             * back to whatever the OS happens to have.
             */
            const fontFaces = await fontFaceRules(printFrame!);
            expect(fontFaces).toContain("Outfit");
            expect(fontFaces).toContain("Noto Sans SC");

            expect(
                await page.evaluate(
                    () =>
                        (window as unknown as { __printCalls: number })
                            .__printCalls
                ),
                "printing should start as soon as the document is ready"
            ).toBeGreaterThan(0);

            expect(problems, `page problems://n${problems.join("//n")}`).toEqual(
                []
            );
        });

        test("printing falls back to an in-app view when the frame refuses", async ({
            page,
        }) => {
            const problems: string[] = [];
            collectProblems(page, problems);

            await stubPrint(page, { fail: true });
            await seedDraft(page);
            await page.goto("/en");

            // Wait for hydration before printing; see the test above.
            await expect(page.locator('input[name="sender.name"]')).toHaveValue(
                "John Doe"
            );

            await page
                .getByRole("button", { name: "Print invoice", exact: true })
                .click();

            const overlay = page.locator("#invoice-print-fallback");
            await expect(overlay).toBeVisible({ timeout: 30_000 });
            await expect(overlay.locator("[data-print-paper]")).toContainText(
                "INV0001"
            );

            /*
             * The fallback is an interactive view: it does not print the moment it
             * opens, because the user may want to check it first. Pressing its
             * button is what hides the app and starts the print.
             */
            await overlay
                .getByRole("button", { name: "Print / Save as PDF" })
                .click();

            await expect
                .poll(() =>
                    page.evaluate(() =>
                        document.documentElement.classList.contains(
                            "invoice-printing"
                        )
                    )
                )
                .toBe(true);

            await overlay.getByRole("button", { name: "Close" }).click();
            await expect(overlay).toHaveCount(0);
            await expect
                .poll(() =>
                    page.evaluate(() =>
                        document.documentElement.classList.contains(
                            "invoice-printing"
                        )
                    )
                )
                .toBe(false);

            /*
             * The service logs why it gave up on the frame. That line is the
             * expected outcome of this test, not a page problem.
             */
            expect(
                problems.filter((p) => !p.includes("in-app view")),
                `page problems://n${problems.join("//n")}`
            ).toEqual([]);
        });
    });

    test.describe("bulk export", () => {
        test("turns a CSV into a ZIP of styled PDFs", async ({ page }) => {
            test.skip(
                page.viewportSize()!.width < 1280,
                "the mobile test below covers the same wizard; this one also inspects the ZIP"
            );

            const problems: string[] = [];
            collectProblems(page, problems);

            await page.goto("/en");

            await page
                .getByRole("button", { name: "Bulk Export", exact: true })
                .first()
                .click();

            const dialog = page
                .getByRole("dialog")
                .filter({ hasText: "Bulk export" });
            await expect(dialog).toBeVisible({ timeout: 30_000 });

            await dialog
                .locator('input[type="file"]')
                .setInputFiles("public/templates/sample_invoices.csv");

            await expect(
                dialog.getByText(/Grouping by Invoice Number/)
            ).toContainText("3");

            await dialog.getByRole("button", { name: "Continue" }).click();
            await expect(dialog.getByText("Choose the look")).toBeVisible();

            // A non-default template, face and accent prove Step 3 reaches the render.
            await dialog.getByRole("button", { name: /Sidebar/ }).click();
            await dialog.getByRole("button", { name: /Source Serif/ }).click();
            await dialog.getByRole("button", { name: "Teal" }).click();

            await dialog.getByRole("button", { name: "Continue" }).click();
            await expect(
                dialog.getByText("Check the first invoice")
            ).toBeVisible();
            await expect(dialog.getByText("Ready to export")).toBeVisible();

            const preview = dialog.locator(
                'iframe[title="Bulk invoice preview"]'
            );
            await expect(preview).toBeVisible({ timeout: 60_000 });

            const frame = preview.contentFrame();
            await expect(frame.locator("body")).toContainText("INV-1001", {
                timeout: 60_000,
            });
            await expect(frame.locator("body")).toContainText(
                "January 15, 2026"
            );
            await expect(frame.locator("aside")).toBeVisible();

            expect(
                await frame
                    .locator("aside")
                    .evaluate(
                        (element) => getComputedStyle(element).backgroundColor
                    )
            ).toBe("rgb(15, 118, 110)");

            expect(
                await frame
                    .locator("section")
                    .first()
                    .evaluate((element) => getComputedStyle(element).fontFamily)
            ).toContain("Source Serif 4");

            const downloadPromise = page.waitForEvent("download", {
                timeout: 240_000,
            });
            await dialog
                .getByRole("button", { name: "Start Bulk Export" })
                .click();

            const download = await downloadPromise;
            expect(download.suggestedFilename()).toBe(
                "invoices_bulk_export.zip"
            );

            const zip = await JSZip.loadAsync(
                fs.readFileSync((await download.path())!)
            );
            const pdfs = Object.keys(zip.files)
                .filter((name) => name.endsWith(".pdf"))
                .sort();

            expect(pdfs).toEqual([
                "INV-1001.pdf",
                "INV-1002.pdf",
                "INV-1003.pdf",
            ]);

            for (const name of pdfs) {
                const bytes = await zip.file(name)!.async("nodebuffer");
                expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
                expect(bytes.length).toBeGreaterThan(20_000);
            }

            expect(problems, `page problems:\n${problems.join("\n")}`).toEqual(
                []
            );
        });

        test("parses an Excel file and previews the batch on mobile", async ({
            page,
        }) => {
            test.skip(
                page.viewportSize()!.width >= 1280,
                "desktop runs the full ZIP flow in the test above"
            );

            const problems: string[] = [];
            collectProblems(page, problems);

            await page.goto("/en");

            const trigger = page
                .locator("button:visible")
                .filter({ hasText: "Bulk Export" })
                .first();
            await trigger.scrollIntoViewIfNeeded();
            await trigger.click();

            const dialog = page
                .getByRole("dialog")
                .filter({ hasText: "Bulk export" });
            await expect(dialog).toBeVisible({ timeout: 30_000 });

            await dialog
                .locator('input[type="file"]')
                .setInputFiles("public/templates/sample_invoices.xlsx");

            await expect(
                dialog.getByText(/Grouping by Invoice Number/)
            ).toContainText("3");

            await dialog.getByRole("button", { name: "Continue" }).click();
            await expect(dialog.getByText("Choose the look")).toBeVisible();
            await dialog.getByRole("button", { name: "Continue" }).click();
            await expect(
                dialog.getByText("Check the first invoice")
            ).toBeVisible();

            const preview = dialog.locator(
                'iframe[title="Bulk invoice preview"]'
            );
            await expect(preview).toBeVisible({ timeout: 60_000 });
            await expect(preview.contentFrame().locator("body")).toContainText(
                "INV-1001",
                { timeout: 60_000 }
            );

            const overflow = await dialog.evaluate(
                (element) => element.scrollWidth > element.clientWidth + 1
            );
            expect(
                overflow,
                "the wizard should not overflow a 375px viewport"
            ).toBe(false);

            expect(problems, `page problems:\n${problems.join("\n")}`).toEqual(
                []
            );
        });
    });

    test("every locale home and guide route renders", async ({
        page,
        request,
    }) => {
        test.skip(
            page.viewportSize()!.width < 1280,
            "locale rendering is server-side; one project is enough"
        );

        for (const { code } of LOCALES) {
            const home = await request.get(`/${code}`);
            expect(home.status(), `/${code} should render`).toBe(200);

            const body = await home.text();
            expect(body, `/${code} returned an error page`).not.toContain(
                "Internal Server Error"
            );
            expect(body).toContain("FatahTech");

            const guide = await request.get(`/${code}/guide`);
            expect(guide.status(), `/${code}/guide should render`).toBe(200);
        }
    });

    test("each locale advertises itself correctly to crawlers", async ({
        request,
    }) => {
        const en = await request.get("/en");
        const az = await request.get("/az");
        expect(en.status()).toBe(200);
        expect(az.status()).toBe(200);

        const enHtml = await en.text();
        const azHtml = await az.text();

        const titleOf = (html: string) =>
            html.match(/<title>(.*?)<\/title>/i)?.[1] ?? "";
        const canonicalOf = (html: string) =>
            html.match(/rel="canonical"[^>]*href="([^"]+)"/i)?.[1] ?? "";

        // Every locale served one English title and one canonical before this.
        expect(titleOf(enHtml)).not.toBe(titleOf(azHtml));
        expect(canonicalOf(enHtml)).toMatch(/\/en$/);
        expect(canonicalOf(azHtml)).toMatch(/\/az$/);

        // hreflang: one per locale plus x-default. Next serialises the
        // attribute as `hrefLang`, which HTML parses case-insensitively.
        const alternates =
            enHtml.match(/rel="alternate"[^>]*hreflang=/gi) ?? [];
        expect(alternates.length).toBeGreaterThanOrEqual(18);
        expect(enHtml).toMatch(/hreflang="x-default"/i);

        // Open Graph and Twitter, neither of which existed.
        expect(enHtml).toMatch(/property="og:image"/i);
        expect(enHtml).toMatch(/name="twitter:card"/i);

        // Exactly one h1 — the invoice templates used to render their own
        // inside the live preview, out of the user's data.
        expect((enHtml.match(/<h1/g) ?? []).length).toBe(1);

        /*
         * Structured data: the application description. The FAQ schema is not
         * here any more — it moved to /guide with the copy, and is asserted in
         * the guide test below.
         */
        const blocks = [
            ...enHtml.matchAll(
                /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs
            ),
        ].map((m) => JSON.parse(m[1]));
        const types = blocks.map((b) => b["@type"]);
        expect(types).toContain("WebApplication");
        expect(types).not.toContain("FAQPage");
    });

    test("sitemap, robots and manifest are served", async ({ request }) => {
        const sitemap = await request.get("/sitemap.xml");
        expect(sitemap.status()).toBe(200);
        const xml = await sitemap.text();
        // One entry per locale, plus one per locale for /guide.
        expect((xml.match(/<url>/g) ?? []).length).toBeGreaterThanOrEqual(34);
        expect(
            (xml.match(/\/guide<\/loc>/g) ?? []).length
        ).toBeGreaterThanOrEqual(17);
        expect(xml).toContain("xhtml:link");

        const robots = await request.get("/robots.txt");
        expect(robots.status()).toBe(200);
        const txt = await robots.text();
        // The static robots.txt it replaced named no sitemap at all.
        expect(txt).toMatch(/Sitemap:\s*https?:\/\/\S+\/sitemap\.xml/);
        expect(txt).toMatch(/Disallow:\s*\/api\//);

        const manifest = await request.get("/manifest.webmanifest");
        expect(manifest.status()).toBe(200);
        expect((await manifest.json()).icons.length).toBeGreaterThan(0);

        const favicon = await request.get("/favicon.ico");
        expect(favicon.status()).toBe(200);

        const og = await request.get("/en/opengraph-image");
        expect(og.status()).toBe(200);
        expect(og.headers()["content-type"]).toContain("image/png");
    });

    test("clients can be saved and reused", async ({ page }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await seedDraft(page);
        await page.goto("/en");

        // Save the seeded receiver.
        await page.getByRole("button", { name: /save client/i }).click();
        await expect(
            page.getByRole("button", { name: /^clients/i })
        ).toBeEnabled();

        // Wipe the receiver, then restore it from the address book.
        await page.locator('input[name="receiver.name"]').fill("");
        await page.locator('input[name="receiver.city"]').fill("");

        await page.getByRole("button", { name: /^clients/i }).click();
        // The row and its delete button both carry the client's name, so match
        // the row's full accessible name rather than a substring.
        await page
            .getByRole("button", { name: "Jane Smith Other Town, Canada" })
            .click();

        await expect(page.locator('input[name="receiver.name"]')).toHaveValue(
            "Jane Smith"
        );
        // The whole address comes back, not just the name.
        await expect(page.locator('input[name="receiver.city"]')).toHaveValue(
            "Other Town"
        );

        // Survives a reload — it is in storage, not in component state.
        await page.reload();
        await expect(
            page.getByRole("button", { name: /^clients/i })
        ).toBeEnabled();

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("a new invoice suggests the next number but leaves it editable", async ({
        page,
    }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await page.addInitScript(() => {
            window.localStorage.setItem(
                "savedInvoices",
                JSON.stringify([{ details: { invoiceNumber: "INV0042" } }])
            );
        });
        await page.goto("/en");

        /*
         * Desktop hides the secondary actions behind an overflow menu; below xl
         * they are a plain column under the form.
         */
        const overflow = page.getByRole("button", { name: /more actions/i });
        if (await overflow.count()) await overflow.click();

        await page
            .getByRole("button", { name: /^new invoice$/i })
            .first()
            .click();
        // Confirm the alert.
        await page
            .getByRole("button", { name: /^(continue|ok|new invoice)$/i })
            .last()
            .click()
            .catch(() => undefined);

        /*
         * Wait for the new number to reach storage before navigating away.
         *
         * The draft is written on a 600ms debounce and the write is async now
         * that it is encrypted, so a hard navigation issued immediately can
         * outrun it. This used to pass on a synchronous setItem; polling for
         * the state the next assertion depends on is what it should have been
         * doing either way.
         */
        await expect
            .poll(
                async () =>
                    (
                        await readStored<{
                            details?: { invoiceNumber?: string };
                        }>(page, "fatahtech:invoiceDraft")
                    )?.details?.invoiceNumber ?? null,
                { timeout: 5000 }
            )
            .toBe("INV0043");

        // A fresh invoice opens on step 1; the number lives on step 2.
        await page.goto("/en?step=details");

        const field = page.locator('input[name="details.invoiceNumber"]');
        await expect(field).toHaveValue("INV0043");

        // Prefilled, never locked.
        await expect(field).toBeEditable();
        await field.fill("2026-01");
        await expect(field).toHaveValue("2026-01");

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("payment term presets fill the field", async ({ page }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await seedDraft(page);
        await page.goto("/en?step=summary");

        const terms = page.locator('textarea[name="details.paymentTerms"]');
        await expect(terms).toBeVisible();

        await page.getByRole("button", { name: "Net 60", exact: true }).click();
        await expect(terms).toHaveValue("Net 60");

        // Still free text underneath.
        await terms.fill("Payable in 45 days");
        await expect(terms).toHaveValue("Payable in 45 days");

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("the autosave indicator reports a saved draft", async ({ page }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await page.goto("/en");
        await page
            .locator('input[name="sender.name"]')
            .fill("Northwind Studio");

        /*
         * Poll for the write rather than racing the 600ms debounce, and assert
         * on the draft itself — several controls in this form have "save" in
         * their label, so a text match would be ambiguous.
         */
        await expect
            .poll(
                async () =>
                    (
                        await readStored<{ sender?: { name?: string } }>(
                            page,
                            "fatahtech:invoiceDraft"
                        )
                    )?.sender?.name ?? null,
                { timeout: 5000 }
            )
            .toBe("Northwind Studio");

        // Then the indicator reports it.
        await expect(page.locator("form").getByText(/^Saved ·/)).toBeVisible();

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("right-to-left locales mirror and do not overflow", async ({
        page,
    }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await seedDraft(page);

        /*
         * The mirror check reads positions out of the live preview, which only
         * exists inline above xl — below it the preview lives in a sheet that
         * is not mounted until opened. `dir` and the overflow audit apply at
         * every width; only the position comparison is desktop-only.
         */
        const hasInlinePreview = page.viewportSize()!.width >= 1280;

        const read = async (locale: string) => {
            await page.goto(`/${locale}`);

            if (hasInlinePreview) {
                /*
                 * Wait for the element being measured, not a guessed number of
                 * milliseconds — a fixed wait reports on machine load rather
                 * than on the layout.
                 */
                await expect(
                    page.locator(
                        '.invoice-live-preview [data-edit-field="sender.name"]'
                    )
                ).toBeVisible({ timeout: 15_000 });
            } else {
                await expect(
                    page.locator('input[name="sender.name"]')
                ).toBeVisible({ timeout: 15_000 });
            }

            return page.evaluate(() => {
                const paper = document.querySelector(".invoice-live-preview");
                const left = (sel: string) => {
                    const el = paper?.querySelector(sel);
                    return el
                        ? Math.round(el.getBoundingClientRect().left)
                        : null;
                };
                return {
                    dir: document.documentElement.getAttribute("dir"),
                    sender: left('[data-edit-field="sender.name"]'),
                    receiver: left('[data-edit-field="receiver.name"]'),
                };
            });
        };

        const ltr = await read("en");
        expect(ltr.dir).toBe("ltr");

        for (const locale of ["he", "ar"]) {
            const rtl = await read(locale);

            // `dir` was missing entirely before this: Arabic shipped for
            // months rendering right-to-left text in a left-to-right document.
            expect(rtl.dir, `${locale} should be rtl`).toBe("rtl");

            // The parties swap sides, which is what proves the logical
            // properties resolved rather than the page merely claiming rtl.
            if (hasInlinePreview) {
                expect(
                    ltr.sender,
                    "no sender in the ltr preview"
                ).not.toBeNull();
                expect(ltr.sender!).toBeLessThan(ltr.receiver!);
                expect(rtl.sender!).toBeGreaterThan(rtl.receiver!);
            }

            const { offenders } = await horizontalOverflow(page);
            expect(
                offenders,
                `${locale} overflows: ${JSON.stringify(offenders, null, 2)}`
            ).toEqual([]);
        }

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("no template filters the logo away", async ({ page }) => {
        test.skip(
            page.viewportSize()!.width < 1280,
            "below xl the preview lives in a sheet that is not mounted until opened"
        );

        /*
         * Sidebar and BoldHeader used to wrap the logo in
         * `filter: brightness(0) invert(1)` to make a dark monochrome mark
         * legible on a dark accent. It is not a contrast fix: brightness(0)
         * zeroes all three colour channels and invert(1) then raises every
         * pixel to white, so a logo exported on an opaque canvas — the common
         * case — painted as a solid white rectangle. Measured before the fix:
         * one distinct colour, #ffffff.
         *
         * Asserting on computed style rather than pixels because it is the
         * filter that is the bug, and because reading the image back through a
         * canvas bypasses filters entirely — which is how this got missed the
         * first time.
         */
        const LOGO =
            "data:image/svg+xml;base64," +
            Buffer.from(
                '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60">' +
                    '<rect width="120" height="60" fill="#ffffff"/>' +
                    '<rect width="60" height="60" fill="#e11d48"/></svg>'
            ).toString("base64");

        // Every template that renders a logo (Minimal, 5, deliberately does not).
        for (const id of [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13]) {
            await page.addInitScript(
                ({ invoice, logo, template }) => {
                    window.localStorage.setItem(
                        "fatahtech:invoiceDraft",
                        JSON.stringify({
                            ...invoice,
                            details: {
                                ...invoice.details,
                                invoiceLogo: logo,
                                pdfTemplate: template,
                            },
                        })
                    );
                },
                { invoice: SAMPLE_INVOICE, logo: LOGO, template: id }
            );

            await page.goto("/en");

            const logo = page.locator('.invoice-live-preview img[alt*="Logo"]');
            await expect(
                logo,
                `template ${id} did not render a logo`
            ).toBeVisible({
                timeout: 10_000,
            });

            const filters = await page.evaluate(() => {
                const img = document.querySelector(
                    '.invoice-live-preview img[alt*="Logo"]'
                );
                const found: string[] = [];
                let node: Element | null = img;
                while (
                    node &&
                    !node.classList.contains("invoice-live-preview")
                ) {
                    const f = getComputedStyle(node).filter;
                    if (f && f !== "none") found.push(f);
                    node = node.parentElement;
                }
                return found;
            });

            expect(
                filters,
                `template ${id} filters its logo: ${filters.join(", ")}`
            ).toEqual([]);
        }
    });

    test("the guide owns the copy and the FAQ, the homepage owns the tool", async ({
        request,
    }) => {
        const home = await request.get("/en");
        const guide = await request.get("/en/guide");
        expect(guide.status()).toBe(200);

        const homeHtml = await home.text();
        const guideHtml = await guide.text();

        const h1 = (html: string) =>
            html.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1] ?? "";
        const canonical = (html: string) =>
            html.match(/rel="canonical"[^>]*href="([^"]+)"/i)?.[1] ?? "";
        const blocks = (html: string) =>
            [
                ...html.matchAll(
                    /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs
                ),
            ].map((m) => JSON.parse(m[1]));

        // Distinct heading and canonical, or the two pages compete.
        expect(h1(guideHtml)).not.toBe(h1(homeHtml));
        expect(canonical(guideHtml)).toMatch(/\/en\/guide$/);

        // One h1 each — the homepage's is visually hidden, but present.
        expect((guideHtml.match(/<h1/g) ?? []).length).toBe(1);
        expect((homeHtml.match(/<h1/g) ?? []).length).toBe(1);

        /*
         * The FAQ moved here with the rest of the copy; the homepage is now the
         * builder and nothing below it. One URL owns the schema, and it is the
         * one that renders the answers — which is what Google's guidance
         * actually requires.
         */
        const faq = blocks(guideHtml).find((b) => b["@type"] === "FAQPage");
        expect(faq, "the guide should carry the FAQ schema").toBeTruthy();
        expect(blocks(homeHtml).map((b) => b["@type"])).not.toContain(
            "FAQPage"
        );

        const rendered = (guideHtml.match(/<dt[^>]*>/g) ?? []).length;
        expect(faq.mainEntity.length).toBe(rendered);

        // The guide carries the prose; the homepage no longer has to.
        const prose = (html: string) =>
            html
                .replace(/<script[\s\S]*?<\/script[^>]*>/gi, " ")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim().length;
        expect(prose(guideHtml)).toBeGreaterThan(1200);
        expect(prose(homeHtml)).toBeLessThan(prose(guideHtml));
    });

    test("the navbar help button opens a two-tab panel", async ({ page }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await page.goto("/en");

        /*
         * Two triggers exist in the markup — one in the desktop controls, one in
         * the mobile cluster — and CSS decides which is on screen. Filtering by
         * visibility picks the one a user could actually press.
         */
        await page
            .getByRole("button", { name: /help & faq/i })
            .filter({ visible: true })
            .click();

        const dialog = page
            .getByRole("dialog")
            .filter({ hasText: "Help & FAQ" });
        await expect(dialog).toBeVisible();

        // Tab 1: the description, then the questions.
        await expect(
            dialog.getByRole("tab", { name: /about & faqs/i })
        ).toHaveAttribute("data-state", "active");
        await expect(dialog.getByText("Free invoice generator")).toBeVisible();

        const question = dialog.getByText("Is FatahTech Invoice really free?");
        await expect(question).toBeVisible();
        await question.click();
        await expect(dialog.getByText(/There is no paid tier/)).toBeVisible();

        // Tab 2: the step-by-step guide.
        await dialog.getByRole("tab", { name: /user guide/i }).click();
        await expect(
            dialog.getByText("How to use FatahTech Invoice")
        ).toBeVisible();
        await expect(dialog.getByText("Fill in both parties")).toBeVisible();
        await expect(dialog.getByText("Print, export or go bulk")).toBeVisible();

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("the first visit is light, and the choice is remembered", async ({
        page,
    }) => {
        await page.goto("/en");

        /*
         * Light is the product's default, not a guess at the operating system's
         * — the subject of the page is a white sheet of paper. Nothing is
         * written to storage until the user actually chooses a mode.
         */
        await expect(page.locator("html")).not.toHaveClass(/dark/);
        expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(
            null
        );

        await page.getByRole("button", { name: "Toggle theme" }).click();
        await expect(page.locator("html")).toHaveClass(/dark/);
        expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(
            "dark"
        );

        // A returning visitor gets the mode they last picked.
        await page.reload();
        await expect(page.locator("html")).toHaveClass(/dark/);
    });

    test("the quick actions fill the form and clear it again", async ({
        page,
    }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await page.goto("/en");

        const form = page.getByRole("main");
        const sender = page.locator('input[name="sender.name"]');
        const receiver = page.locator('input[name="receiver.name"]');

        await expect(sender).toHaveValue("");

        /*
         * Scoped to <main>: in development the navbar carries a debug panel of
         * its own, and this action must be the one in the form.
         */
        await form.getByRole("button", { name: "Fill in the form" }).click();

        await expect(sender).toHaveValue("Northwind Studio");
        await expect(receiver).toHaveValue("Contoso Retail");
        await expect(page.locator('input[name="sender.city"]')).toHaveValue(
            "Amsterdam"
        );

        await form.getByRole("button", { name: "Clear all" }).click();

        await expect(sender).toHaveValue("");
        await expect(receiver).toHaveValue("");

        /*
         * Clearing has to drop the autosaved draft as well, or the next reload
         * restores exactly what the user just cleared. The debounce means the
         * draft is written a moment after the reset, so reload on the far side
         * of it.
         */
        await page.waitForTimeout(1200);
        await page.reload();
        await expect(page.locator('input[name="sender.name"]')).toHaveValue("");

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("appearance chips drop down instead of opening the gallery", async ({
        page,
    }) => {
        test.skip(
            page.viewportSize()!.width < 1280,
            "the chip row is part of the desktop preview toolbar"
        );

        const problems: string[] = [];
        collectProblems(page, problems);

        await page.goto("/en");

        /*
         * The regression this guards: all four chips used to call the same
         * handler, so "Density · Comfortable" opened a modal whose main
         * content was thirteen template thumbnails.
         */
        await page.getByRole("button", { name: /^Font/ }).click();

        const menu = page
            .getByRole("dialog")
            .filter({ hasText: "IBM Plex Sans" });
        await expect(menu).toBeVisible();
        await expect(page.getByText("Choose a template")).toHaveCount(0);

        // Picking dismisses the menu and the chip reports the new value.
        await menu.getByRole("button", { name: "Source Serif" }).click();
        await expect(menu).toBeHidden();
        await expect(page.getByRole("button", { name: /^Font/ })).toContainText(
            "Source Serif"
        );

        // The template chip is the one that still needs the room.
        await page.getByRole("button", { name: /^Template/ }).click();
        await expect(page.getByText("Choose a template")).toBeVisible();

        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("bill from and bill to sit side by side in the rail", async ({
        page,
    }) => {
        test.skip(
            page.viewportSize()!.width < 1280,
            "phones keep the single stacked column"
        );

        await page.goto("/en");

        const boxes = await page.evaluate(() => {
            const sections = [...document.querySelectorAll("section")].filter(
                (s) => s.querySelector("input")
            );
            return sections.slice(0, 2).map((s) => {
                const r = s.getBoundingClientRect();
                return { top: Math.round(r.top), width: Math.round(r.width) };
            });
        });

        expect(boxes).toHaveLength(2);
        // Same row, not stacked.
        expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThanOrEqual(2);

        /*
         * Each half is far too narrow for a 7rem label beside its input, so
         * the rows inside must fall back to stacking — `shell:@[20rem]:` in
         * fieldStyles.ts. A paired row here would leave a ~76px field.
         */
        const rowDisplay = await page.evaluate(() => {
            const input = document.querySelector<HTMLElement>(
                'input[name="sender.name"]'
            );
            const row = input?.closest<HTMLElement>('[class*="@[20rem]"]');
            return row ? getComputedStyle(row).display : null;
        });
        expect(rowDisplay).toBe("flex");

        /*
         * And the two halves start at the same line.
         *
         * They did not: the address book existed on the receiver side only, so
         * its two buttons pushed Bill To's first field ~84px below Bill From's
         * and the columns read as misaligned. Giving the sender the same
         * feature — which it wanted on its own merits — squares them up.
         */
        const firstFields = await page.evaluate(() => {
            const top = (name: string) =>
                Math.round(
                    document
                        .querySelector(`input[name="${name}"]`)!
                        .getBoundingClientRect().top
                );
            return {
                sender: top("sender.name"),
                receiver: top("receiver.name"),
            };
        });
        expect(
            Math.abs(firstFields.sender - firstFields.receiver)
        ).toBeLessThanOrEqual(1);
    });

    test("the sender has its own address book", async ({ page }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await seedDraft(page);
        await page.goto("/en");

        await page.getByRole("button", { name: /save sender/i }).click();
        await expect(
            page.getByRole("button", { name: /^senders/i })
        ).toBeEnabled();

        // Wipe the sender, then restore it from its own book.
        await page.locator('input[name="sender.name"]').fill("");
        await page.locator('input[name="sender.city"]').fill("");

        await page.getByRole("button", { name: /^senders/i }).click();
        await page
            .getByRole("dialog")
            .getByRole("button", { name: /^John Doe/ })
            .click();

        await expect(page.locator('input[name="sender.name"]')).toHaveValue(
            "John Doe"
        );
        await expect(page.locator('input[name="sender.city"]')).toHaveValue(
            "Anytown"
        );

        /*
         * Separate books, not one shared list: saving a sender must not put
         * your own company into the client picker.
         */
        const senders =
            (await readStored<{ name: string }[]>(page, "fatahtech:senders")) ??
            [];
        const clients =
            (await readStored<{ name: string }[]>(page, "fatahtech:clients")) ??
            [];
        expect(senders.map((p) => p.name)).toEqual(["John Doe"]);
        expect(clients).toEqual([]);

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("stored personal data is not legible on disk", async ({ page }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        await seedDraft(page);
        await page.goto("/en");

        await page.getByRole("button", { name: /save client/i }).click();
        await expect(
            page.getByRole("button", { name: /^clients/i })
        ).toBeEnabled();

        // Give the draft debounce time to write too.
        await page.waitForTimeout(1500);

        /*
         * The point of the whole exercise: someone reading the browser profile
         * off disk gets ciphertext. Checked against the actual values in the
         * seeded invoice rather than a token string, because a partial
         * encryption would still leak exactly these.
         */
        for (const key of ["fatahtech:clients", "fatahtech:invoiceDraft"]) {
            expect(await isEncrypted(page, key), `${key} ciphertext`).toBe(
                true
            );

            /*
             * Everything on disk for this key — the ciphertext bytes and
             * anything localStorage still holds. Checked against the real
             * values in the seeded invoice rather than a token string, because
             * a partial encryption would leak exactly these.
             */
            const onDisk = await rawStored(page, key);
            for (const secret of [
                "Jane Smith",
                "janesmith@example.com",
                "987-654-3210",
                "456 Elm St",
            ]) {
                expect(onDisk.includes(secret), `${key} leaks ${secret}`).toBe(
                    false
                );
            }
        }

        // And it is genuinely the data, not just scrambled beyond use.
        const clients = await readStored<{ name: string }[]>(
            page,
            "fatahtech:clients"
        );
        expect(clients?.map((c) => c.name)).toEqual(["Jane Smith"]);

        /*
         * The key must be non-extractable. This is the property that makes the
         * IndexedDB record worthless on its own: the browser will hand out a
         * usable handle and refuse to ever produce the bytes.
         */
        const keyState = await page.evaluate(async () => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                // Must match the app's DB_VERSION; opening with a lower one
                // throws VersionError rather than downgrading.
                const request = indexedDB.open("fatahtech-secure", 2);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            const key = await new Promise<CryptoKey>((resolve, reject) => {
                const request = db
                    .transaction("keys", "readonly")
                    .objectStore("keys")
                    .get("storage-key");
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            let exported = "did not throw";
            try {
                await crypto.subtle.exportKey("raw", key);
            } catch {
                exported = "refused";
            }
            return {
                algorithm: (key.algorithm as AesKeyAlgorithm).name,
                length: (key.algorithm as AesKeyAlgorithm).length,
                extractable: key.extractable,
                exported,
            };
        });

        expect(keyState).toEqual({
            algorithm: "AES-GCM",
            length: 256,
            extractable: false,
            exported: "refused",
        });

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("a plaintext address book from an older build is migrated", async ({
        page,
    }) => {
        const problems: string[] = [];
        collectProblems(page, problems);

        // Exactly what the previous release wrote.
        await page.addInitScript(() => {
            window.localStorage.setItem(
                "fatahtech:clients",
                JSON.stringify([
                    {
                        id: "legacy-1",
                        name: "Legacy Client",
                        address: "1 Old Road",
                        zipCode: "00001",
                        city: "Oldtown",
                        country: "Nowhere",
                        email: "legacy@example.com",
                        phone: "555-0000",
                        customInputs: [],
                    },
                ])
            );
        });
        await page.goto("/en");

        // Still there, and usable.
        await page.getByRole("button", { name: /^clients/i }).click();
        await page
            .getByRole("dialog")
            .getByRole("button", { name: /^Legacy Client/ })
            .click();
        await expect(page.locator('input[name="receiver.name"]')).toHaveValue(
            "Legacy Client"
        );

        // And rewritten encrypted, rather than left as it was found.
        await expect
            .poll(() => isEncrypted(page, "fatahtech:clients"))
            .toBe(true);

        /*
         * And the plaintext copy is gone, not merely superseded. Leaving it
         * beside the ciphertext would encrypt nothing in practice.
         */
        expect(
            await page.evaluate(() =>
                window.localStorage.getItem("fatahtech:clients")
            )
        ).toBeNull();
        expect(
            (await rawStored(page, "fatahtech:clients")).includes(
                "legacy@example.com"
            )
        ).toBe(false);

        expect(problems, `page problems:\n${problems.join("\n")}`).toEqual([]);
    });

    test("languages list English and Azerbaijani first, then alphabetically", async ({
        page,
    }) => {
        await page.goto("/en");
        await openLanguageMenu(page);

        const names = await languageMenu(page)
            .locator("button span.truncate")
            .allTextContents();

        expect(names.slice(0, 4)).toEqual([
            "English",
            "Azərbaycanca",
            "Bahasa Indonesia",
            "Català",
        ]);

        /*
         * Latin-script names sort among themselves and the other scripts group
         * after them — Intl.Collator's root order, which is what makes a
         * mixed-script list readable rather than arbitrary.
         */
        expect(names.slice(-5)).toEqual([
            "Српски",
            "עברית",
            "العربية",
            "日本語",
            "简体中文",
        ]);
    });

    test("switching language shows progress and keeps what was typed", async ({
        page,
    }) => {
        await page.goto("/en");

        const name = page.locator('input[name="sender.name"]');
        await name.fill("Persisted Ltd");

        /*
         * Hold the German payload back for a moment.
         *
         * Without this the assertion below is a race against the network: on a
         * warm production server the navigation can land before Playwright
         * looks, and the test would then pass or fail on timing rather than on
         * whether the pending state exists at all.
         */
        await page.route("**/de**", async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 800));
            await route.continue();
        });

        await openLanguageMenu(page);
        await languageMenu(page)
            .getByRole("button", { name: /Deutsch/ })
            .click();

        /*
         * The point of the whole change: a locale switch is a server
         * navigation, and until this landed nothing on screen said so.
         */
        await expect(
            page.getByRole("button", { name: "Languages" }).first()
        ).toHaveAttribute("aria-busy", "true");

        await expect(page).toHaveURL(/\/de/);
        // The draft is restored, so an in-progress invoice survives the switch.
        await expect(page.locator('input[name="sender.name"]')).toHaveValue(
            "Persisted Ltd"
        );
    });
});

const SAMPLE_INVOICE = {
    sender: {
        name: "John Doe",
        address: "123 Main St",
        zipCode: "12345",
        city: "Anytown",
        country: "USA",
        email: "johndoe@example.com",
        phone: "123-456-7890",
    },
    receiver: {
        name: "Jane Smith",
        address: "456 Elm St",
        zipCode: "54321",
        city: "Other Town",
        country: "Canada",
        email: "janesmith@example.com",
        phone: "987-654-3210",
    },
    details: {
        invoiceLogo: "",
        invoiceNumber: "INV0001",
        invoiceDate: "2026-01-15T00:00:00.000Z",
        dueDate: "2026-02-15T00:00:00.000Z",
        items: [
            {
                name: "Product 1",
                description: "A thing",
                quantity: 4,
                unitPrice: 50,
                total: 200,
            },
        ],
        currency: "USD",
        language: "English",
        taxDetails: {
            amount: 15,
            amountType: "percentage",
            taxID: "987654321",
        },
        discountDetails: { amount: 5, amountType: "percentage" },
        shippingDetails: { cost: 5, costType: "percentage" },
        paymentInformation: {
            bankName: "Bank Inc.",
            accountName: "John Doe",
            accountNumber: "445566998877",
        },
        additionalNotes: "Thank you for your business",
        paymentTerms: "Net 30",
        subTotal: 200,
        totalAmount: 200,
        totalAmountInWords: "Two Hundred",
        pdfTemplate: 1,
        theme: {
            accentColor: "#4F46E5",
            fontId: "outfit",
            density: "comfortable",
        },
    },
};
