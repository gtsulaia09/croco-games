import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Plays every game in local practice mode against bots for a number of human turns,
 * through the real UI. A turn counts when "Your turn" disappears after our input.
 */
const GAMES = ["joker", "japanese_joker", "bura3", "bura5", "holdem", "shortdeck", "omaha", "omaha_hilo", "dominoes", "backgammon"] as const;
const HUMAN_TURNS = 6;

async function firstEnabled(scope: Locator): Promise<Locator | null> {
  const all = await scope.all();
  for (const el of all) if ((await el.isVisible()) && (await el.isEnabled())) return el;
  return null;
}

async function clickFirst(scope: Locator): Promise<boolean> {
  const el = await firstEnabled(scope);
  if (!el) return false;
  await el.click();
  return true;
}

const hand = (page: Page) => page.getByRole("group", { name: "Your hand" });

async function step(page: Page, game: (typeof GAMES)[number]): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) {
    await clickFirst(dialog.locator("button:not([aria-label=close])"));
    return;
  }
  switch (game) {
    case "joker":
      if (await clickFirst(page.getByRole("group", { name: /Choose trump|Declare trump/ }).getByRole("button"))) return;
      if (await clickFirst(page.getByRole("group", { name: "How many tricks will you take?" }).getByRole("button"))) return;
      await clickFirst(hand(page).locator("button.pcard"));
      return;
    case "japanese_joker":
      if (await clickFirst(page.getByRole("group", { name: "Choose trump" }).getByRole("button"))) return;
      if (await clickFirst(hand(page).locator("button.pcard"))) return;
      await clickFirst(page.getByRole("group", { name: "My table cards" }).locator("button.pcard"));
      return;
    case "bura3":
    case "bura5": {
      // Decisions that interrupt the normal flow: var after a won trick, or an opponent's raise.
      if (await clickFirst(page.getByRole("button", { name: "Continue", exact: true }))) return;
      if (await clickFirst(page.getByRole("button", { name: "Accept", exact: true }))) return;
      const lead = page.getByRole("button", { name: "Lead", exact: true });
      if (await lead.isVisible()) {
        await clickFirst(hand(page).locator("button.pcard"));
        await lead.click();
        return;
      }
      const respond = page.getByText(/Select (\d+) card\(s\) to answer/);
      const need = Number((await respond.textContent())?.match(/\d+/)?.[0] ?? 1);
      const cards = await hand(page).locator("button.pcard").all();
      for (const c of cards.slice(0, need)) await c.click();
      // Throwing cards face down is always legal; beating may not be.
      await page.getByRole("button", { name: "Throw face down" }).click();
      return;
    }
    case "holdem":
    case "shortdeck":
    case "omaha":
    case "omaha_hilo":
      if (await clickFirst(page.getByRole("button", { name: "Check", exact: true }))) return;
      await clickFirst(page.getByRole("button", { name: /^Call \d+$/ }));
      return;
    case "dominoes":
      if (await page.getByText("Which end?").isVisible()) {
        await clickFirst(page.getByRole("button", { name: /^(Left|Right|Up|Down) \(/ }));
        return;
      }
      if (await clickFirst(hand(page).getByRole("button"))) return;
      if (await clickFirst(page.getByRole("button", { name: "Draw", exact: true }))) return;
      await clickFirst(page.getByRole("button", { name: "Pass", exact: true }));
      return;
    case "backgammon": {
      if (await clickFirst(page.getByRole("button", { name: "Take", exact: true }))) return;
      if (await clickFirst(page.getByRole("button", { name: "Roll", exact: true }))) return;
      const confirm = page.getByRole("button", { name: "Confirm move" });
      for (let i = 0; i < 4 && !(await confirm.isEnabled()); i++) {
        await page.locator("[data-source]").first().dispatchEvent("click");
        await page.locator("[data-target]").first().dispatchEvent("click");
      }
      await confirm.click();
      return;
    }
  }
}

test.describe("practice mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("croco.locale", "en"));
  });

  for (const game of GAMES) {
    test(`plays ${game} against bots`, async ({ guarded: page }) => {
      await page.goto(`./#/practice/${game}`);
      await expect(page.getByText("Practice mode: runs entirely in your browser")).toBeVisible();
      if (game === "joker") {
        const start = page.getByRole("button", { name: "Start game" });
        if (await start.isVisible()) await start.click();
      }
      const yourTurn = page.getByText("Your turn", { exact: true });
      const finished = page.getByText(/Match finished|You are out of chips/).first();
      let turns = 0;
      for (let guard = 0; turns < HUMAN_TURNS && guard < 60; guard++) {
        await expect(yourTurn.or(finished)).toBeVisible({ timeout: 20_000 });
        if (await finished.isVisible()) break;
        await step(page, game);
        // Our input either ends the turn or (multi-step turns) keeps it; give the UI a moment.
        await page.waitForTimeout(150);
        if (!(await yourTurn.isVisible())) turns++;
      }
      expect(turns).toBeGreaterThan(0);
      await expect(page.getByText("invalid_action")).toHaveCount(0);
    });
  }

  test("new game restarts the table", async ({ guarded: page }) => {
    await page.goto("./#/practice/dominoes");
    await expect(page.getByText("Round 1")).toBeVisible();
    await page.getByRole("button", { name: "New game" }).click();
    await expect(page.getByText("Round 1")).toBeVisible();
  });
});

test.describe("offline (PWA)", () => {
  test("practice keeps working offline after one visit", async ({ guarded: page, context }) => {
    await page.addInitScript(() => localStorage.setItem("croco.locale", "en"));
    await page.goto("./#/practice/bura3");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    // Second visit runs through the now-controlling service worker and fills its cache.
    await page.reload();
    await expect(page.getByText("Your turn", { exact: true }).or(page.getByText(/Waiting for/))).toBeVisible();
    await page.evaluate(() => (navigator.serviceWorker.controller ? true : Promise.reject(new Error("not controlled"))));
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("Practice mode: runs entirely in your browser")).toBeVisible();
    await expect(page.getByText("Your turn", { exact: true }).or(page.getByText(/Waiting for/))).toBeVisible();
    await context.setOffline(false);
  });
});
