import { test, expect } from "@playwright/test";
for (const id of ["h1", "turtlebot3"])
  test(`${id}: source mesh loading and finite bounds`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes(`/robots/${id}/`))
        errors.push(`${r.status()} ${r.url()}`);
    });
    await page.goto(`/?robot=${id}&view=explore`);
    await expect(page.locator(".viewer-status")).toHaveCount(0);
    await expect(page.locator(".part-row").first()).toBeVisible();
    const bounds = JSON.parse(
      (await page.locator(".viewer").getAttribute("data-model-bounds")) || "{}",
    );
    expect(bounds.meshCount).toBeGreaterThan(0);
    expect(bounds.size.every((n: number) => Number.isFinite(n) && n > 0)).toBe(
      true,
    );
    await page.screenshot({ path: `qa/${id}-expanded.png` });
    await page.getByRole("button", { name: "关节实验", exact: true }).click();
    await expect(page.getByTestId("direct-motion-panel")).toBeVisible();
    const before = await page
      .locator(".viewer")
      .getAttribute("data-joint-state");
    await page.getByLabel("动作进度", { exact: true }).fill("0.4");
    await expect
      .poll(() => page.locator(".viewer").getAttribute("data-joint-state"))
      .not.toBe(before);
    await page.getByTestId("direct-reset").click();
    await expect(page.getByLabel("动作进度", { exact: true })).toHaveValue("0");
    expect(errors).toEqual([]);
  });
