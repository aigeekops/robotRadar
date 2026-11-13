import { test, expect } from "@playwright/test";
const diagnostics = async (page: import("@playwright/test").Page) =>
  JSON.parse(
    (await page.getByTestId("drive-scene").getAttribute("data-camera-state"))!,
  );
test("heading camera follows rendered body through turn and view toggle preserves paused course", async ({
  page,
}) => {
  await page.goto("/?robot=g1&experience=drive&lang=zh");
  await expect(page.getByTestId("drive-scene")).toHaveAttribute(
    "data-camera-state",
    /.+/,
  );
  await expect(page.getByTestId("drive-camera-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.down("d");
  try {
    await expect
      .poll(async () => (await diagnostics(page)).heading, { timeout: 20000 })
      .toBeGreaterThan(1.5);
  } finally {
    await page.keyboard.up("d");
  }
  await page.waitForTimeout(700);
  await expect
    .poll(async () => {
      const d = await diagnostics(page);
      const forward = [Math.cos(d.renderedYaw), -Math.sin(d.renderedYaw)];
      return (
        (d.eye[0] - d.robot[0]) * forward[0] +
        (d.eye[2] - d.robot[2]) * forward[1]
      );
    })
    .toBeLessThan(-1.8);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".drive-paused")).toBeVisible();
  await expect
    .poll(
      async () =>
        JSON.parse(
          (await page
            .getByTestId("drive-scene")
            .getAttribute("data-drive-state"))!,
        ).angularSpeed,
    )
    .toBe(0);
  const state = await page
    .getByTestId("drive-scene")
    .getAttribute("data-drive-state");
  // Programmatic click avoids a modal overlay intercept; this checks state isolation, not hit targets.
  await page
    .getByTestId("drive-camera-toggle")
    .evaluate((el: HTMLButtonElement) => el.click());
  await expect(page.getByTestId("drive-camera-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.waitForTimeout(400);
  expect(
    await page.getByTestId("drive-scene").getAttribute("data-drive-state"),
  ).toBe(state);
  const d = await diagnostics(page);
  expect(
    Math.hypot(d.eye[0] - d.robot[0], d.eye[2] - d.robot[2]),
  ).toBeGreaterThanOrEqual(2);
});
test("camera responds to reduced motion preference and remains a reachable mobile control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?robot=g1&experience=drive&lang=zh");
  await expect(page.getByTestId("drive-scene")).toHaveAttribute(
    "data-camera-state",
    /.+/,
  );
  const toggle = page.getByTestId("drive-camera-toggle");
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeInViewport();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => {
    document.documentElement.dataset.reducedMotion = "true";
    window.dispatchEvent(new Event("robot-radar-motion-preference"));
  });
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(async () => (await diagnostics(page)).reducedMotion)
    .toBe(true);
  await page.evaluate(() => {
    document.documentElement.dataset.reducedMotion = "false";
    window.dispatchEvent(new Event("robot-radar-motion-preference"));
  });
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});
