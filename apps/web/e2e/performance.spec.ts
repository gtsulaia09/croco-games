import { expect, test } from "./fixtures";

/**
 * Low-end office PC, multi-viewport responsive, zoom, and Georgian localization layout checks:
 *  - Reference profile: 1366x768, 4x CPU throttling via CDP.
 *  - Verifies lazy game-engine loading (opening Joker does not download Poker/Backgammon).
 *  - Verifies zero horizontal overflow across 1920x1080, 1366x768, 1024x768, 768x1024,
 *    390x844, 360x800, 844x390, and 125% zoom in both Georgian (ka) and English (en).
 */
test.describe("performance and responsiveness", () => {
  test.use({ serviceWorkers: "block" });

  test("lazy-loads only the selected game engine and stays responsive under 4x CPU throttle", async ({ guarded: page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Desktop reference profile benchmark");
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => localStorage.setItem("croco.locale", "en"));

    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    const loadedScripts: string[] = [];
    page.on("response", (res) => {
      if (res.url().endsWith(".js")) loadedScripts.push(res.url().split("/").pop() ?? "");
    });

    const t0 = Date.now();
    await page.goto("./#/practice");
    await expect(page.getByText("Choose a game to practise against bots")).toBeVisible();
    const initialLoadMs = Date.now() - t0;

    expect(loadedScripts.some((s) => /^(poker|joker|bura3|bura5|dominoes|backgammon|japanese_joker|esm)-/.test(s))).toBe(false);

    const beforeJoker = loadedScripts.length;
    await page.goto("./#/practice/joker");
    const startEn = page.getByRole("button", { name: "Start game" });
    if (await startEn.isVisible()) await startEn.click();
    await expect(page.getByText("Your turn", { exact: true }).or(page.getByText(/Waiting for/))).toBeVisible({ timeout: 20_000 });
    const afterJoker = loadedScripts.slice(beforeJoker);
    expect(afterJoker.some((s) => /^joker-/.test(s))).toBe(true);
    expect(afterJoker.some((s) => /^JokerBoard-/.test(s))).toBe(true);
    expect(afterJoker.some((s) => /^(poker|backgammon|dominoes|bura3|bura5)-/.test(s))).toBe(false);

    const perf = await page.evaluate(async () => {
      const deltas: number[] = [];
      await new Promise<void>((resolve) => {
        let last = performance.now();
        const start = last;
        const tick = (now: number) => {
          deltas.push(now - last);
          last = now;
          if (now - start >= 1000) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const avgDelta = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return {
        fps: Math.round((1000 / Math.max(1, avgDelta)) * 10) / 10,
        frames: deltas.length,
        maxFrameMs: Math.round(Math.max(...deltas) * 10) / 10,
        domNodes: document.querySelectorAll("*").length,
        dclMs: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      };
    });

    const metrics = (await cdp.send("Performance.getMetrics")).metrics;
    const metric = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
    const jsHeapMB = Math.round((metric("JSHeapUsedSize") / (1024 * 1024)) * 10) / 10;

    console.log(
      `[PERF 4x-CPU 1366x768] initialLoad=${initialLoadMs}ms dcl=${perf.dclMs}ms fps=${perf.fps} maxFrame=${perf.maxFrameMs}ms domNodes=${perf.domNodes} jsHeap=${jsHeapMB}MB`,
    );

    expect(initialLoadMs).toBeLessThan(10_000);
    expect(perf.fps).toBeGreaterThanOrEqual(20);
    expect(jsHeapMB).toBeLessThan(120);
    expect(perf.domNodes).toBeLessThan(1500);
  });

  test("has no horizontal overflow across desktop, tablet, and small mobile viewports in Georgian and English", async ({ guarded: page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Viewport matrix runs once across all target dimensions");
    test.setTimeout(90_000);

    // 1. Verify Georgian (ka, default) has native Georgian text, zero English tag leaks, and zero overflow across all 7 viewports.
    await page.goto("./#/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ka");
    // This phase offers only Joker, Japanese Joker and Bura; the other games stay implemented but unlisted.
    await expect(page.getByRole("heading", { name: "იაპონური ჯოკერი" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "ბურა", exact: true })).toBeVisible();
    await expect(page.getByText("ტეხას ჰოლდემი")).toHaveCount(0);
    await expect(page.getByText("MULTIPLAYER ARENA")).toHaveCount(0);
    await expect(page.getByText("4P · Trick")).toHaveCount(0);

    const viewports = [
      { name: "fhd-desktop", width: 1920, height: 1080 },
      { name: "office-laptop", width: 1366, height: 768 },
      { name: "compact-monitor", width: 1024, height: 768 },
      { name: "tablet-portrait", width: 768, height: 1024 },
      { name: "mobile-390", width: 390, height: 844 },
      { name: "mobile-small-360", width: 360, height: 800 },
      { name: "mobile-landscape", width: 844, height: 390 },
    ];

    const routes = [
      "./#/",
      "./#/practice",
      "./#/practice/joker",
      "./#/practice/japanese_joker",
      "./#/practice/bura3",
      "./#/practice/bura5",
      "./#/practice/holdem",
      "./#/practice/omaha_hilo",
      "./#/practice/dominoes",
      "./#/practice/backgammon",
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const sampleRoutes = vp.name === "office-laptop" || vp.name === "mobile-small-360" ? routes : ["./#/", "./#/practice/joker", "./#/practice/holdem", "./#/practice/dominoes", "./#/practice/backgammon"];
      for (const route of sampleRoutes) {
        await page.goto(route);
        await expect(page.locator("main")).toBeVisible();
        if (route === "./#/practice/joker") {
          const setupOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(setupOverflow, `ka ${vp.name} ${route} setup overflow`).toBeLessThanOrEqual(1);
          const startKa = page.getByRole("button", { name: "თამაშის დაწყება" });
          if (await startKa.isVisible()) await startKa.click();
        }
        if (route.startsWith("./#/practice/")) {
          await expect(page.getByText("შენი სვლაა", { exact: true }).or(page.getByText(/სვლაზეა:/))).toBeVisible({ timeout: 20_000 });
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `ka ${vp.name} ${route} overflow`).toBeLessThanOrEqual(1);
      }
    }

    // 2. Test 125% zoom on 1366x768 office laptop in English.
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("./#/practice/holdem");
    await page.getByRole("button", { name: "language" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.evaluate(() => {
      document.documentElement.style.zoom = "1.25";
    });
    const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(zoomOverflow, "en 1366x768 125% zoom overflow").toBeLessThanOrEqual(1);
  });
});
