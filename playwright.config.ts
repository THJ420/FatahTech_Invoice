import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke-test configuration.
 *
 * These tests exist because round 2 shipped an infinite render loop that both
 * `tsc` and ESLint passed cleanly — the page was dead and nothing in CI knew.
 * The goal here is not coverage; it is a tripwire for "the app still runs".
 *
 * It builds and serves the production bundle rather than running `next dev`,
 * so the tests exercise what actually ships.
 */
/*
 * Port 3000 is the default, but it is often already taken by a local preview
 * server — in which case `reuseExistingServer` would hand the suite a server
 * that is not this app. PLAYWRIGHT_PORT lets a run pick a free one.
 */
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
    testDir: "./e2e",
    // The suite is small; running it serially keeps the single dev server sane
    // and makes failures easier to read.
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? "github" : "list",

    use: {
        baseURL,
        trace: "on-first-retry",
    },

    projects: [
        {
            name: "desktop",
            use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
        },
        {
            /*
             * The mobile layout is signed off and must not regress, so it is a
             * first-class target rather than an afterthought.
             *
             * Chromium with an explicit 375x812 viewport rather than a named
             * iPhone device: the iPhone presets run on WebKit, which is a second
             * browser download for everyone and for CI, and 375 is the width the
             * existing overflow audit is specified against.
             */
            name: "mobile",
            use: {
                ...devices["Desktop Chrome"],
                viewport: { width: 375, height: 812 },
                isMobile: true,
                hasTouch: true,
                deviceScaleFactor: 2,
            },
        },
    ],

    webServer: {
        command: `npm run build && npm run start -- -p ${port}`,
        url: `${baseURL}/`,
        // An explicit PLAYWRIGHT_PORT means the caller has chosen a port to
        // isolate this run; never reuse whatever else happens to answer there.
        reuseExistingServer: !process.env.CI && !process.env.PLAYWRIGHT_PORT,
        // A cold build plus a Chromium launch is slow on a cold cache.
        timeout: 5 * 60 * 1000,
        stdout: "pipe",
        stderr: "pipe",
    },
});
