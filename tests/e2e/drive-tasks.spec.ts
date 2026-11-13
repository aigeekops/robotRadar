import { test, expect, type Page } from "@playwright/test";
import { DRIVE_GATES, type DriveState } from "../../src/core/drive";
import { DOCK_TARGET } from "../../src/core/driveTasks";
async function state(page: Page): Promise<DriveState> {
  return JSON.parse(
    (await page.getByTestId("drive-scene").getAttribute("data-drive-state"))!,
  );
}
test("wheel-legged and wheeled tasks show docking instead of invented jumping", async ({
  page,
}) => {
  for (const id of ["turtlebot3", "go2w"]) {
    await page.goto(`/?robot=${id}&experience=drive&lang=zh`);
    await expect(page.getByTestId("drive-experience")).toHaveAttribute(
      "data-task-kind",
      "wheel-docking",
    );
    await expect(page.getByTestId("drive-scene")).toHaveAttribute(
      "data-drive-state",
      /.+/,
    );
    await expect(page.getByTestId("drive-docking")).toContainText("精确停靠");
    await expect(
      page.getByRole("button", { name: "跳跃演示", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    expect((await state(page)).jump).toBe(-1);
    expect((await state(page)).bestJump).toBe(0);
    await page.keyboard.press("r");
    expect((await state(page)).complete).toBe(false);
  }
});
test("actual wheel keyboard route remains incomplete until aligned and stopped in dock", async ({
  page,
}) => {
  test.setTimeout(300000);
  await page.goto("/?robot=turtlebot3&experience=drive&lang=zh");
  await expect(page.getByTestId("drive-scene")).toHaveAttribute(
    "data-drive-state",
    /.+/,
  );
  let held = "";
  const hold = async (key: string) => {
    if (key !== held) {
      if (held) await page.keyboard.up(held);
      if (key) await page.keyboard.down(key);
      held = key;
    }
  };
  const begin = Date.now();
  await page.keyboard.down("Shift");
  try {
    while ((await state(page)).gate < 7 && Date.now() - begin < 200000) {
      const s = await state(page),
        g = DRIVE_GATES[s.gate],
        prev = s.gate ? DRIVE_GATES[s.gate - 1] : { x: 0, z: 0 };
      const len = Math.hypot(g.x - prev.x, g.z - prev.z),
        x = g.x + ((g.x - prev.x) / len) * 0.6,
        z = g.z + ((g.z - prev.z) / len) * 0.6;
      const target = Math.atan2(x - s.x, -(z - s.z));
      const diff = Math.atan2(
        Math.sin(target - s.heading),
        Math.cos(target - s.heading),
      );
      await hold(Math.abs(diff) > 0.12 ? (diff > 0 ? "d" : "a") : "w");
      await page.waitForTimeout(80);
    }
    await hold("");
    await page.keyboard.up("Shift");
    expect((await state(page)).gate).toBe(7);
    // Crossing the final route plane is not sufficient for wheel completion.
    const crossed = await state(page);
    if (crossed.dockingHold < DOCK_TARGET.holdSeconds)
      expect(crossed.complete).toBe(false);
    const dockStart = Date.now();
    while (!(await state(page)).complete && Date.now() - dockStart < 65000) {
      const s = await state(page);
      const angle = Math.atan2(
        Math.sin(DOCK_TARGET.heading - s.heading),
        Math.cos(DOCK_TARGET.heading - s.heading),
      );
      if (Math.abs(angle) > 0.07) await hold(angle > 0 ? "d" : "a");
      else if (Math.abs(s.speed) > 0.08) await hold("");
      else if (s.x < DOCK_TARGET.x - 0.3) {
        await hold("w");
        await page.waitForTimeout(180);
        await hold("");
      } else if (s.x > DOCK_TARGET.x + 0.3) {
        await hold("s");
        await page.waitForTimeout(180);
        await hold("");
      } else await hold("");
      await page.waitForTimeout(100);
    }
  } finally {
    await hold("");
    await page.keyboard.up("Shift");
  }
  const done = await state(page);
  expect(done.complete).toBe(true);
  expect(done.dockingHold).toBe(1.2);
  expect(
    Math.hypot(done.x - DOCK_TARGET.x, done.z - DOCK_TARGET.z),
  ).toBeLessThanOrEqual(0.45);
  expect(Math.abs(done.speed)).toBeLessThanOrEqual(0.08);
  await expect(page.locator(".drive-complete")).toContainText("精确停靠完成");
  await page.getByRole("button", { name: "再试一次", exact: true }).click();
  await expect.poll(async () => (await state(page)).gate).toBe(0);
  expect((await state(page)).dockingHold).toBe(0);
});
