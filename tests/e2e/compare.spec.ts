import { test, expect } from "@playwright/test";

test("comparison renders two source models, compares exact URDF counts and supports observation controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "机型对比", exact: true }).click();
  await expect(page.getByTestId("compare-experience")).toBeVisible();
  await expect(page.getByLabel("对比机型 A", { exact: true })).toHaveValue(
    "g1",
  );
  await expect(page.getByLabel("对比机型 B", { exact: true })).toHaveValue(
    "h1",
  );
  await expect(page.locator(".compare-canvas canvas")).toHaveCount(2);
  await expect(page.locator(".compare-canvas .viewer-status")).toHaveCount(0);
  const frame = await page.locator(".compare-canvas").first().boundingBox();
  const viewer = await page
    .locator(".compare-canvas .viewer")
    .first()
    .boundingBox();
  expect(viewer!.x).toBeCloseTo(frame!.x, 0);
  expect(viewer!.width).toBeCloseTo(frame!.width, 0);
  const canvas = await page
    .locator(".compare-canvas canvas")
    .first()
    .boundingBox();
  expect(canvas!.x).toBeCloseTo(frame!.x, 0);
  expect(canvas!.width).toBeCloseTo(frame!.width, 0);
  const manifest = await (
    await page.request.get("/robots/manifest.json")
  ).json();
  const robots = Array.isArray(manifest) ? manifest : manifest.robots;
  await expect(
    page.getByLabel("对比机型 A", { exact: true }).locator("option"),
  ).toHaveCount(robots.length);
  for (const [index, id] of ["g1", "h1"].entries()) {
    const robot = robots.find((r: { id: string }) => r.id === id);
    const xml = await (await page.request.get(robot.urdfUrl)).text();
    await expect(
      page.locator('[data-metric="links"] td').nth(index),
    ).toHaveText(String((xml.match(/<link\s/g) || []).length));
    await expect(
      page.locator('[data-metric="joints"] td').nth(index),
    ).toHaveText(String((xml.match(/<joint\s/g) || []).length));
  }
  await page.getByRole("button", { name: "正面", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "正面", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("对比拆分幅度").fill("0.5");
  await page.getByRole("button", { name: "重置观察", exact: true }).click();
  await expect(page.getByLabel("对比拆分幅度")).toHaveValue("0");
  await page.getByLabel("仅看不同项").check();
  await expect(page.locator('[data-metric="manufacturer"]')).toHaveCount(0);
  await expect(page.locator('[data-metric="physical"]')).toContainText(
    "未在此核实",
  );
  await page.getByLabel("仅看不同项").uncheck();
  await page.getByLabel("对比机型 B", { exact: true }).selectOption("go2");
  await expect(page.locator(".compare-canvas .viewer-status")).toHaveCount(0);
  await expect(page.locator(".compare-canvas canvas")).toHaveCount(2);
  await expect(
    page.locator('[data-metric="independent"] td').nth(1),
  ).toHaveText("12");
  await page.screenshot({
    path: "qa/compare-main-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "探索此机型 →", exact: true })
    .nth(1)
    .click();
  await expect(page.getByTestId("compare-experience")).toHaveCount(0);
  await expect(page.locator(".inspector")).toBeVisible();
  expect(errors).toEqual([]);
});

test("comparison remains operable on a narrow screen without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "机型对比", exact: true }).click();
  await expect(page.locator(".compare-canvas canvas")).toHaveCount(2);
  await expect(page.locator(".compare-canvas .viewer-status")).toHaveCount(0);
  await expect(page.getByLabel("对比机型 A", { exact: true })).toBeVisible();
  await expect(page.getByLabel("对比机型 B", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("对比机型 B", { exact: true }).selectOption("so101");
  await expect(
    page.locator('[data-metric="configuration"] td').nth(1),
  ).not.toContainText("读取中");
  await page.screenshot({ path: "qa/compare-main-mobile.png", fullPage: true });
});
