import { expect, test as base, type Page } from "@playwright/test";

/** Fails a test on any page error, console error, or request leaving the app's origin. */
export const test = base.extend<{ guarded: Page }>({
  guarded: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`console: ${m.text()}`);
    });
    page.on("request", (r) => {
      const url = r.url();
      if (!url.startsWith(origin) && !url.startsWith("data:")) problems.push(`external request: ${url}`);
    });
    await use(page);
    expect(problems, problems.join("\n")).toEqual([]);
  },
});
export { expect };
