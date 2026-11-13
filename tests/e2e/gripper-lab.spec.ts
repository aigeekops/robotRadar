import { test, expect } from "@playwright/test";
const url = "?robot=franka-hand&mode=gripper&view=iso&lang=en";
async function pose(page: any, q: number) {
  await expect
    .poll(async () => {
      const s = JSON.parse(
        (await page.locator(".viewer").getAttribute("data-joint-state")) ||
          "{}",
      );
      return (
        Math.abs(s.fr3_finger_joint1 - q) < 0.00001 &&
        Math.abs(s.fr3_finger_joint2 - q) < 0.00001
      );
    })
    .toBe(true);
}
test("parallel gripper real source mimic, 0/40/80mm, animated open/pause/reset and pinned source", async ({
  page,
}) => {
  await page.goto(url);
  const lab = page.getByTestId("gripper-lab");
  await expect(lab).toBeVisible();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  const slider = lab.getByRole("slider");
  for (const [width, q] of [
    [0, 0],
    [0.04, 0.02],
    [0.08, 0.04],
  ]) {
    await slider.fill(String(width));
    await pose(page, q);
    await expect(lab.locator("output")).toHaveText(
      (width * 1000).toFixed(1) + " mm",
    );
  }
  await lab.getByRole("button", { name: "Reset", exact: true }).click();
  await pose(page, 0);
  await lab.getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForTimeout(150);
  await lab.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await slider.inputValue();
  expect(Number(paused)).toBeGreaterThan(0);
  expect(Number(paused)).toBeLessThan(0.08);
  await page.waitForTimeout(750);
  await expect(slider).toHaveValue(paused);
  await lab.getByRole("button", { name: "Open", exact: true }).click();
  await pose(page, 0.04);
  await expect(
    lab.getByRole("button", { name: "Pause", exact: true }),
  ).toBeDisabled();
  await lab.getByRole("button", { name: "Close", exact: true }).click();
  await pose(page, 0);
  await slider.fill("0.06");
  const response = await page.request.get("robots/franka-hand/provenance.json");
  expect(response.ok()).toBe(true);
  const provenance = await response.json();
  expect(provenance.sourceFile).toBe("robots/fr3/fr3.urdf.xacro");
  expect(provenance.license).toBe("Apache-2.0");
  await page.screenshot({ path: "qa/franka-hand-lab.png" });
  if (process.env.GENERATE_GRIPPER_PREVIEW === "1")
    await page.screenshot({
      path: "public/previews/franka-hand.png",
      clip: { x: 150, y: 150, width: 1000, height: 700 },
    });
});
test("parallel gripper controls reachable at 390px and reduced motion immediate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  const lab = page.getByTestId("gripper-lab");
  await expect(lab).toBeVisible();
  await lab.getByRole("button", { name: "Open", exact: true }).click();
  await pose(page, 0.04);
  await lab.getByRole("button", { name: "Reset", exact: true }).click();
  await pose(page, 0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const button of await lab.getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(40);
    expect(box?.width).toBeGreaterThanOrEqual(40);
  }
  await lab.locator(".gripper-opening").scrollIntoViewIfNeeded();
  await expect(lab.locator(".gripper-opening output")).toHaveCSS(
    "font-size",
    "30px",
  );
  await page.screenshot({ path: "qa/franka-hand-mobile.png" });
  await lab.screenshot({ path: "qa/franka-hand-mobile-panel.png" });
});
