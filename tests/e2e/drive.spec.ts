import { test, expect, type Page } from "@playwright/test";
import { DRIVE_GATES, type DriveState } from "../../src/core/drive";
async function ready(page: Page, id = "g1") {
  await page.goto(`/?robot=${id}&experience=drive`);
  await expect(page.locator(".drive-scene[data-drive-state]")).toBeVisible();
  await expect(page.locator(".drive-overlay")).toHaveCount(0);
  if (await page.locator(".drive-paused").count())
    await page.getByRole("button", { name: "继续试驾", exact: true }).click();
}
async function state(page: Page): Promise<DriveState> {
  return JSON.parse(
    (await page.locator(".drive-scene").getAttribute("data-drive-state"))!,
  );
}
async function pose(page: Page) {
  return JSON.parse(
    (await page.locator(".drive-scene").getAttribute("data-rendered-pose"))!,
  );
}

test("drive actual keyboard course, rendered displacement, jump, blur, seven ordered gates and restart", async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.keyboard.down("w");
  await expect
    .poll(async () => (await state(page)).z, { timeout: 15000 })
    .toBeLessThan(-0.8);
  await page.keyboard.up("w");
  await page.waitForTimeout(400);
  let s = await state(page);
  const p = await pose(page);
  expect(s.z).toBeLessThan(-0.8);
  expect(p.x).toBe(s.x);
  expect(p.z).toBe(s.z);
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await pose(page)).y, { timeout: 15000 })
    .toBeGreaterThan(0.2);
  await expect
    .poll(async () => (await pose(page)).y, { timeout: 15000 })
    .toBe(0);
  await page.keyboard.down("w");
  await page.waitForTimeout(200);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(250);
  s = await state(page);
  await page.waitForTimeout(350);
  expect((await state(page)).z).toBe(s.z);
  expect((await state(page)).elapsed).toBe(s.elapsed);
  await page.keyboard.up("w");
  await page.getByRole("button", { name: "继续试驾", exact: true }).click();
  await page.waitForTimeout(300);
  expect((await state(page)).z).toBe(s.z);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("r");
    await expect.poll(async () => (await state(page)).distance).toBe(0);
    expect((await state(page)).gate).toBe(0);
  }
  let held = "";
  await page.keyboard.down("Shift");
  const started = Date.now();
  while ((s = await state(page)).gate < 7 && Date.now() - started < 170000) {
    const g = DRIVE_GATES[s.gate],
      prev = s.gate ? DRIVE_GATES[s.gate - 1] : { x: 0, z: 0 };
    const len = Math.hypot(g.x - prev.x, g.z - prev.z);
    const x = g.x + ((g.x - prev.x) / len) * 0.6,
      z = g.z + ((g.z - prev.z) / len) * 0.6;
    const heading = Math.atan2(x - s.x, -(z - s.z));
    const diff = Math.atan2(
      Math.sin(heading - s.heading),
      Math.cos(heading - s.heading),
    );
    const key = Math.abs(diff) > 0.12 ? (diff > 0 ? "d" : "a") : "w";
    if (key !== held) {
      if (held) await page.keyboard.up(held);
      await page.keyboard.down(key);
      held = key;
    }
    await page.waitForTimeout(80);
  }
  if (held) await page.keyboard.up(held);
  await page.keyboard.up("Shift");
  s = await state(page);
  expect(s.gate).toBe(7);
  expect(s.complete).toBe(true);
  await expect(page.locator(".drive-complete")).toBeVisible();
  await expect(page.locator(".drive-gate-dots .done")).toHaveCount(7);
  await page.screenshot({ path: "qa/drive-main-complete.png" });
  const stopped = { ...s };
  await page.keyboard.down("w");
  await page.waitForTimeout(350);
  await page.keyboard.up("w");
  expect((await state(page)).distance).toBe(stopped.distance);
  await page.getByRole("button", { name: "再试一次", exact: true }).click();
  await expect.poll(async () => (await state(page)).gate).toBe(0);
  expect((await state(page)).distance).toBe(0);
  await page.getByRole("button", { name: "退出试驾", exact: true }).click();
  await expect(page.locator(".hero-briefing")).toBeVisible();
  await expect(page.locator(".drive-scene")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("mobile source models drive while stationary assets recover old locomotion links", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const catalog = await (
    await page.request.get("/robots/manifest.json")
  ).json();
  for (const { id, form } of catalog) {
    if (["arm", "hand", "gripper"].includes(form)) {
      await page.goto(`/?robot=${id}&experience=drive&lang=zh`);
      await expect(page.getByTestId("structure-navigator")).toBeVisible();
      await expect(page).not.toHaveURL(/experience=drive/);
      await expect(page.getByTestId("drive-unavailable")).toHaveCount(0);
      await expect(page.getByTestId("drive-experience")).toHaveCount(0);
      await expect(page.locator(".drive-scene")).toHaveCount(0);
      await expect(page.locator(".viewer canvas")).toBeVisible();
      await expect(page.locator(".viewer-status")).toHaveCount(0);
      await page.keyboard.press("w");
      await page.keyboard.press("Space");
      await expect(page.getByTestId("structure-navigator")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "跳跃演示", exact: true }),
      ).toHaveCount(0);
      continue;
    }
    await ready(page, id);
    const before = (await state(page)).distance;
    await page.keyboard.down("w");
    try {
      // Keep real input held through first-frame shader compilation / slow software rendering.
      // Readiness proves assets loaded, not that a simulation frame has consumed this key.
      await expect
        .poll(async () => (await state(page)).distance, { timeout: 15000 })
        .toBeGreaterThan(before + 0.01);
    } finally {
      await page.keyboard.up("w");
    }
    const { moved, rendered } = await page
      .locator(".drive-scene")
      .evaluate((el) => ({
        moved: JSON.parse(el.getAttribute("data-drive-state")!),
        rendered: JSON.parse(el.getAttribute("data-rendered-pose")!),
      }));
    expect(rendered.x).toBe(moved.x);
    expect(rendered.z).toBe(moved.z);
    await expect(page.getByTestId("drive-boundary")).toContainText(
      "不代表实机性能或硬件控制",
    );
  }
  expect(errors).toEqual([]);
});

test("drive main entry exit reload and history restore one live scene", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".hero-briefing")).toBeVisible();
  await page.getByTestId("home-game-drive").click();
  await expect(page.locator(".drive-scene[data-drive-state]")).toBeVisible();
  await expect(page).toHaveURL(/experience=drive/);
  await page.getByRole("button", { name: "退出试驾", exact: true }).click();
  await expect(page.locator(".hero-briefing")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".drive-experience")).toBeVisible();
  await page.goForward();
  await expect(page.locator(".hero-briefing")).toBeVisible();
  await ready(page);
  await page.reload();
  await expect(page.locator(".drive-scene[data-drive-state]")).toBeVisible();
  await expect(page.locator(".drive-experience")).toHaveCount(1);
});
