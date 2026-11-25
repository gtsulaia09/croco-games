import { expect, test } from "./fixtures";

/**
 * Low-end office PC & responsive performance checks:
 *  - Reference profile: 1366x768, 4x CPU throttling via CDP.
 *  - Verifies lazy game-engine loading (opening Joker does not download Poker/Backgammon).
 *  - Measures initial load timing, JS heap memory, frame pacing, long tasks, and zero
 *    horizontal overflow across desktop (1366x768), tablet (768x1024), and mobile (390x844).
 */
test.describe("performance and responsiveness", () => {
  test.use({ serviceWorkers: "block" });

  test("lazy-loads only the selected game engine and stays responsive under 4x CPU throttle", async ({ guarded: page, context }, testInfo) => {
    // Only run CDP throttling on desktop project to avoid double-running heavy profiling.
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

    // Initial page must NOT download any game engine or Firebase SDK chunk.
    expect(loadedScripts.some((s) => /^(poker|joker|bura3|bura5|dominoes|backgammon|japanese_joker|esm)-/.test(s))).toBe(false);

    // Navigate to Joker: only the Joker engine + JokerBoard chunks should load (not Poker/Backgammon/Dominoes).
    const beforeJoker = loadedScripts.length;
    await page.goto("./#/practice/joker");
    await expect(page.getByText("Your turn").or(page.getByText(/Waiting for/))).toBeVisible({ timeout: 20_000 });
    const afterJoker = loadedScripts.slice(beforeJoker);
    expect(afterJoker.some((s) => /^joker-/.test(s))).toBe(true);
    expect(afterJoker.some((s) => /^JokerBoard-/.test(s))).toBe(true);
    expect(afterJoker.some((s) => /^(poker|backgammon|dominoes|bura3|bura5)-/.test(s))).toBe(false);

    // Measure frame rate over ~1 second under 4x CPU throttle while bots/UI are active.
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

  test("has no horizontal overflow on desktop, tablet, and mobile viewports", async ({ guarded: page }) => {
    await page.addInitScript(() => localStorage.setItem("croco.locale", "en"));
    const viewports = [
      { name: "office-laptop", width: 1366, height: 768 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile-portrait", width: 390, height: 844 },
      { name: "mobile-landscape", width: 844, height: 390 },
    ];
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of ["./#/practice", "./#/practice/joker", "./#/practice/holdem", "./#/practice/backgammon"]) {
        await page.goto(route);
        await expect(page.locator("main")).toBeVisible();
        if (route !== "./#/practice") {
          await expect(page.getByText("Your turn", { exact: true }).or(page.getByText(/Waiting for/))).toBeVisible({ timeout: 20_000 });
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${vp.name} ${route} overflow`).toBeLessThanOrEqual(1);
      }
    }
  });
});
