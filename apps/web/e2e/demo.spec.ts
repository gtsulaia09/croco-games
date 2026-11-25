import { expect, test } from "./fixtures";

test.describe("demo deployment", () => {
  // The service worker would answer the test's own framing page; routing needs it out of the way.
  test.use({ serviceWorkers: "block" });

  test("is labelled as local practice and never fakes login or multiplayer", async ({ guarded: page }) => {
    await page.addInitScript(() => localStorage.setItem("croco.locale", "en"));
    await page.goto("./");
    await expect(page.getByText("This deployment has no game server configured")).toBeVisible();
    // Without a backend there is no login form and every online route redirects to practice.
    for (const route of ["#/login", "#/setup", "#/games/joker", "#/leaderboards", "#/friends", "#/admin", "#/room/r_aaaaaaaaaaaaaaaa", "#/invite/abc"]) {
      await page.goto(`./${route}`);
      await expect(page).toHaveURL(/#\/(practice|)$/);
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
    }
    await page.goto("./#/practice");
    await expect(page.getByText("Practice mode: runs entirely in your browser").first()).toBeVisible();
  });

  test("ships a strict CSP and refuses to render inside a frame", async ({ guarded: page }) => {
    await page.goto("./");
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");

    // A page that frames the app (served by the test itself, no CSP of its own).
    const appUrl = page.url();
    await page.route("**/framer.html", (route) => route.fulfill({ contentType: "text/html", body: `<iframe src="${appUrl}" width="400" height="300"></iframe>` }));
    await page.goto("./framer.html");
    // The framed app wipes its own document instead of rendering (frame-ancestors cannot be
    // delivered by a meta tag on GitHub Pages).
    const body = page.frameLocator("iframe").locator("body");
    await expect(body).toBeAttached();
    await expect(body).toBeEmpty();
    await expect(page.frameLocator("iframe").locator("#root")).toHaveCount(0);
  });

  test("switches between Georgian and English", async ({ guarded: page }) => {
    await page.goto("./#/practice");
    await expect(page.locator("html")).toHaveAttribute("lang", "ka");
    await page.getByRole("button", { name: "language" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Choose a game to practise against bots")).toBeVisible();
  });
});
