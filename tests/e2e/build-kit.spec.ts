import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("SO101 sourced build kit exports, parts, assembly and print", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?robot=so101");
  await page.getByRole("button", { name: "制造资料", exact: true }).click();
  const kit = page.locator(".build-kit");
  await expect(kit).toBeVisible();
  await expect(kit.locator(".build-kit-rows article")).toHaveCount(11);
  for (const format of ["CSV", "JSON"]) {
    const next = page.waitForEvent("download");
    await kit
      .getByRole("button", { name: `BOM ${format} ↓`, exact: true })
      .click();
    const download = await next;
    expect(download.suggestedFilename()).toBe(
      `so101-follower-bom.${format.toLowerCase()}`,
    );
    const file = await download.path();
    expect(file).toBeTruthy();
    const content = await readFile(file!, "utf8");
    if (format === "JSON") {
      expect(JSON.parse(content).rows).toHaveLength(18);
      expect(
        JSON.parse(content).rows.find(
          (r: { id: string }) => r.id === "fasteners",
        ).quantity,
      ).toBeNull();
    } else {
      expect(content).toContain("UNKNOWN");
    }
  }
  const stl = page.waitForEvent("download");
  await kit
    .getByRole("link", { name: "原始 STL ↓", exact: true })
    .first()
    .click();
  const stlDownload = await stl;
  expect(stlDownload.suggestedFilename()).toBe("Base_motor_holder_SO101.stl");
  expect((await readFile((await stlDownload.path())!)).length).toBeGreaterThan(
    10000,
  );
  await kit
    .getByRole("button", { name: "非打印件采购单", exact: true })
    .click();
  await expect(kit.locator(".build-kit-rows article")).toHaveCount(7);
  await expect(kit.getByText("数量：未知", { exact: true })).toBeVisible();
  await kit.getByRole("button", { name: "装配步骤", exact: true }).click();
  await expect(kit.locator(".build-kit-steps>li")).toHaveCount(9);
  await page.evaluate(() => {
    const nativeOpen = window.open;
    window.open = ((...args: Parameters<typeof window.open>) => {
      const win = nativeOpen(...args);
      if (win) win.print = () => {};
      return win;
    }) as typeof window.open;
  });
  const popupPromise = page.waitForEvent("popup");
  await kit.getByRole("button", { name: "打印物料清单", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.locator("tbody tr")).toHaveCount(18);
  await expect(
    popup.getByText("UNKNOWN / 未知 kit", { exact: true }),
  ).toBeVisible();
  await popup.close();
  expect(errors).toEqual([]);
});

test("SO101 build kit remains reachable at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?robot=so101&mode=buildkit");
  const kit = page.locator(".build-kit");
  await expect(kit).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bounds = await kit.boundingBox();
  expect(bounds).toBeTruthy();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});
