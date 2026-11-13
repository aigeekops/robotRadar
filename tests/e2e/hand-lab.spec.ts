import { test, expect } from "@playwright/test";
import { leapHandDefinition } from "../../src/core/handLabData";

test("LEAP hand source controls highlight four fingers, animate bounded poses above floor and reset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?robot=leap_hand&mode=hand&showroom=0");
  const panel = page.getByTestId("hand-lab-panel"),
    viewer = page.locator(".viewer");
  await expect(panel).toBeVisible();
  await expect(page.getByLabel("手部关节 0", { exact: true })).toBeEnabled();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await expect(viewer).toHaveAttribute(
    "data-presentation",
    "hand-upright-suspended",
  );
  await expect(panel.locator(".hand-joint")).toHaveCount(16);
  const zeroBounds = JSON.parse(
    (await viewer.getAttribute("data-hand-pose-bounds"))!,
  );
  expect(zeroBounds.min[1]).toBeGreaterThan(0);
  await page.getByRole("button", { name: "拇指链", exact: true }).click();
  await expect(panel.locator(".hand-joint")).toHaveCount(4);
  await page.getByLabel("手部关节 12", { exact: true }).fill("0.5");
  await expect
    .poll(
      async () =>
        JSON.parse((await viewer.getAttribute("data-joint-state"))!)["12"],
    )
    .toBeCloseTo(0.5, 2);
  await page.getByRole("button", { name: "握拳示意", exact: true }).click();
  await expect(panel).toHaveAttribute("data-playing", "false");
  const pose = JSON.parse((await viewer.getAttribute("data-joint-state"))!);
  expect(pose["2"]).toBeGreaterThan(0.5);
  for (const joint of leapHandDefinition.joints) {
    expect(pose[joint.name]).toBeGreaterThanOrEqual(joint.lower);
    expect(pose[joint.name]).toBeLessThanOrEqual(joint.upper);
  }
  expect(
    JSON.parse((await viewer.getAttribute("data-hand-pose-bounds"))!).min[1],
  ).toBeGreaterThan(0);
  await page.screenshot({ path: "qa/leap-main-curl.png" });
  await page.getByRole("button", { name: "捏合示意", exact: true }).click();
  await page.getByLabel("手部动作进度", { exact: true }).fill("0.5");
  const paused = await viewer.getAttribute("data-joint-state");
  await page.waitForTimeout(180);
  await expect(viewer).toHaveAttribute("data-joint-state", paused!);
  await page.getByRole("button", { name: "继续姿态", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(panel).toHaveAttribute("data-playing", "false");
  await page.evaluate(() => {
    document.documentElement.dataset.reducedMotion = "true";
    window.dispatchEvent(new Event("robot-radar-motion-preference"));
  });
  await page.getByRole("button", { name: "捏合示意", exact: true }).click();
  await expect(panel).toHaveAttribute("data-playing", "false");
  await expect(page.getByLabel("手部动作进度", { exact: true })).toHaveValue(
    "1",
  );
  await page.getByRole("button", { name: "复位到源零位", exact: true }).click();
  await expect
    .poll(async () =>
      JSON.parse((await viewer.getAttribute("data-hand-pose-bounds"))!),
    )
    .toEqual(zeroBounds);
  expect(
    Object.values(
      JSON.parse((await viewer.getAttribute("data-joint-state"))!),
    ).every((v) => v === 0),
  ).toBe(true);
  await page.screenshot({ path: "qa/leap-main-reset.png" });
  await page.getByRole("button", { name: "手掌", exact: true }).click();
  await expect(panel.locator(".hand-joint")).toHaveCount(0);
  await expect(panel).toContainText("不验证碰撞");
  expect(errors).toEqual([]);
});

test("LEAP hand panel stays usable on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?robot=leap_hand&mode=hand&showroom=0");
  const panel = page.getByTestId("hand-lab-panel");
  await expect(page.getByLabel("手部关节 0", { exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "拇指链", exact: true }).click();
  await expect(panel.locator(".hand-joint")).toHaveCount(4);
  await page.getByLabel("手部关节 15", { exact: true }).fill("0.3");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "qa/leap-main-mobile.png", fullPage: true });
});

test("LEAP independent finger coordination preserves other chains and sequences remain user-controlled", async ({
  page,
}) => {
  await page.goto("/?robot=leap_hand&mode=hand&showroom=0");
  const panel = page.getByTestId("hand-lab-panel"),
    viewer = page.locator(".viewer");
  const state = async () =>
    JSON.parse((await viewer.getAttribute("data-joint-state"))!);
  await expect(
    page.getByLabel("长指链 A 独立开合", { exact: true }),
  ).toBeEnabled();
  await page.getByLabel("长指链 A 独立开合", { exact: true }).fill("0.8");
  await expect.poll(async () => (await state())["1"]).toBeGreaterThan(0.6);
  const a = (await state())["1"];
  expect((await state())["5"]).toBe(0);
  expect((await state())["9"]).toBe(0);
  await page.getByLabel("拇指链 独立开合", { exact: true }).fill("0.6");
  expect((await state())["1"]).toBe(a);
  expect((await state())["12"]).toBeGreaterThan(0.3);
  await page.getByLabel("手部播放速度", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "逐指波浪", exact: true }).click();
  await expect(panel).toHaveAttribute("data-sequence", "wave");
  await page.getByLabel("手部动作进度", { exact: true }).fill("0.4");
  const paused = await viewer.getAttribute("data-joint-state");
  await page.waitForTimeout(150);
  await expect(viewer).toHaveAttribute("data-joint-state", paused!);
  await page.getByRole("button", { name: "继续姿态", exact: true }).click();
  await expect(page.getByLabel("手部动作进度", { exact: true })).toHaveValue(
    "1",
  );
  expect(Object.values(await state()).every((v) => v === 0)).toBe(true);
  await page.evaluate(() => {
    document.documentElement.dataset.reducedMotion = "true";
    window.dispatchEvent(new Event("robot-radar-motion-preference"));
  });
  await page.getByRole("button", { name: "拇指逐指配合", exact: true }).click();
  await expect(panel).toHaveAttribute("data-playing", "false");
  await expect(page.getByLabel("手部动作进度", { exact: true })).toHaveValue(
    "0.5",
  );
  const pose = await state();
  for (const joint of leapHandDefinition.joints) {
    expect(pose[joint.name]).toBeGreaterThanOrEqual(joint.lower);
    expect(pose[joint.name]).toBeLessThanOrEqual(joint.upper);
  }
  await expect(panel.locator(".hand-research-card")).toContainText(
    "未接入接触物理或训练策略",
  );
  await page.screenshot({ path: "qa/leap-independent-coordination.png" });
});
