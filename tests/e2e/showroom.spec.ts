import { test, expect } from "@playwright/test";

test("immersive showroom persists, explores, separates and returns without stale hidden parts", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".hero-briefing")).toBeVisible();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  const catalog = await (
    await page.request.get("/robots/manifest.json")
  ).json();
  await expect(page.locator(".fleet-thumbnail")).toHaveCount(catalog.length);
  await page.reload();
  await expect(page.locator(".hero-briefing")).toBeVisible();
  await page
    .getByRole("button", { name: "探索部件与系统", exact: true })
    .click();
  await expect(page.locator(".inspector")).toBeVisible();
  await expect(page.locator(".part-row").first()).toBeVisible();
  await page.getByRole("button", { name: "拆分观察", exact: true }).click();
  await expect
    .poll(async () => Number(await page.locator("#explode").inputValue()))
    .toBeCloseTo(0.7, 1);
  await page.getByRole("button", { name: "合拢模型", exact: true }).click();
  await expect
    .poll(async () => Number(await page.locator("#explode").inputValue()))
    .toBe(0);
  await page.getByRole("button", { name: "运动链重建", exact: true }).click();
  await page.getByRole("button", { name: "返回展厅", exact: true }).click();
  await expect(page.locator(".hero-briefing")).toBeVisible();
  await page
    .getByRole("button", { name: "探索部件与系统", exact: true })
    .click();
  await expect(page.locator(".visibility-button .lucide-eye-off")).toHaveCount(
    0,
  );
  await page.goBack();
  await expect(page.locator(".hero-briefing")).toBeVisible();
  await page.screenshot({ path: "qa/immersive-home-final.png" });
});

test("direct motion changes real joint state, pauses, resets and stops on view dismissal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await page
    .getByRole("button", { name: "探索部件与系统", exact: true })
    .click();
  await page.getByRole("button", { name: "关节实验", exact: true }).click();
  await expect(page.getByTestId("direct-motion-panel")).toBeVisible();
  const initial = await page
    .locator(".viewer")
    .getAttribute("data-joint-state");
  await page.getByLabel("动作进度", { exact: true }).fill("0.4");
  await expect
    .poll(() => page.locator(".viewer").getAttribute("data-joint-state"))
    .not.toBe(initial);
  await page.getByTestId("direct-toggle").click();
  await expect(page.getByTestId("direct-toggle")).toHaveText("暂停动作");
  await page.getByTestId("direct-toggle").click();
  const paused = await page
    .getByLabel("动作进度", { exact: true })
    .inputValue();
  await page.waitForTimeout(300);
  await expect(page.getByLabel("动作进度", { exact: true })).toHaveValue(
    paused,
  );
  await page.getByTestId("direct-reset").click();
  await expect(page.getByLabel("动作进度", { exact: true })).toHaveValue("0");
  await page.getByTestId("direct-toggle").click();
  await page.getByRole("button", { name: "返回展厅", exact: true }).click();
  await expect(page.getByTestId("direct-motion-panel")).toHaveCount(0);
  await page.waitForTimeout(300);
  const stopped = await page
    .locator(".viewer")
    .getAttribute("data-joint-state");
  await page.waitForTimeout(300);
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-joint-state",
    stopped!,
  );
});

test("showroom responsive desktop and bilingual controls retain usable layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/?showroom=1&robot=g1&lang=en");
  await expect(page.locator(".hero-briefing")).toBeVisible();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "qa/immersive-home-en-1100.png" });
  await page
    .getByRole("button", { name: "EXPLORE PARTS & SYSTEMS", exact: true })
    .click();
  await expect(page.locator(".inspector")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "qa/immersive-explore-en-1100.png" });
});

test("browser history interrupts active separation and direct motion without stale frames", async ({
  page,
}) => {
  await page.goto("/?robot=g1&mode=parts");
  await expect(page.locator(".part-row").first()).toBeVisible();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await page.getByRole("button", { name: "正面", exact: true }).click();
  await page.getByRole("button", { name: "拆分观察", exact: true }).click();
  await page.waitForTimeout(150);
  await page.goBack();
  await page.waitForTimeout(1100);
  await expect(page.locator("#explode")).toHaveValue("0");
  await page.getByRole("button", { name: "关节实验", exact: true }).click();
  await page.getByRole("button", { name: "正面", exact: true }).click();
  await page.getByTestId("direct-toggle").click();
  await expect(page.getByTestId("direct-toggle")).toHaveText("暂停动作");
  await page.goBack();
  await expect(page.getByTestId("direct-toggle")).toHaveText("播放动作");
  const state = await page.locator(".viewer").getAttribute("data-joint-state");
  await page.waitForTimeout(350);
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-joint-state",
    state!,
  );
});
