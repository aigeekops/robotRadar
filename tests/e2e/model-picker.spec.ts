import { test, expect } from "@playwright/test";
test("full-name model picker exposes every actual model and keeps selection visible", async ({
  page,
}) => {
  await page.goto("/?robot=g1&view=explore&lang=zh");
  const catalog = await (
    await page.request.get("/robots/manifest.json")
  ).json();
  const select = page.locator(".model-picker select");
  await expect(select.locator("option")).toHaveCount(catalog.length);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ["svh_hand", "open-duck-mini", "g1"]) {
      await select.selectOption(id);
      await expect(select).toHaveValue(id);
      await expect(page.locator(".viewer-status")).toHaveCount(0);
      const chip = page.locator(".robot-chip.selected");
      await expect(chip).toBeVisible();
      expect(
        await chip.evaluate((el) => {
          const r = el.getBoundingClientRect(),
            p = el.parentElement!.getBoundingClientRect();
          return r.left >= p.left - 2 && r.right <= p.right + 2;
        }),
      ).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});
