import { test, expect } from "@playwright/test";
test("Go2 exploded observation stays outward, framed and restores after repeated cycles and camera changes", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/?robot=go2&mode=parts&lang=zh");
  await expect(page.locator(".part-row").first()).toBeVisible();
  const viewer = page.locator(".viewer");
  const evidence = async () =>
    JSON.parse((await viewer.getAttribute("data-explode-evidence"))!);
  await expect
    .poll(async () => !!(await viewer.getAttribute("data-explode-evidence")))
    .toBe(true);
  const base = await evidence();
  for (let i = 0; i < 3; i++) {
    await page.locator(".explode-control input").fill("1");
    await expect.poll(async () => (await evidence()).amount).toBe(1);
    const expanded = await evidence();
    expect(expanded.minY).toBeGreaterThanOrEqual(expanded.floor - 1e-7);
    expect(expanded.positions).not.toEqual(base.positions);
    for (const name of ["正面", "侧面", "顶部"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(viewer).toHaveAttribute("data-camera-transition", "false");
      // The click intentionally occurs immediately after expand. Check the settled
      // geometry too, so a small intermediate layout cannot falsely pass framing.
      await page.waitForTimeout(400);
      await expect
        .poll(async () => {
          const points = JSON.parse(
            (await viewer.getAttribute("data-explode-projection")) || "[]",
          );
          return (
            points.length === 8 &&
            points.every(
              (p: number[]) => Math.abs(p[0]) < 1.01 && Math.abs(p[1]) < 1.01,
            )
          );
        })
        .toBe(true);
      if (i === 0 && name === "正面")
        await page.screenshot({ path: "qa/explode-go2-fast-front-fixed.png" });
    }
    if (i === 0)
      await page.screenshot({ path: "qa/explode-go2-top-regression.png" });
    await page.locator(".explode-control input").fill("0");
    await expect.poll(async () => (await evidence()).amount).toBe(0);
    expect((await evidence()).positions).toEqual(base.positions);
  }
  await page.getByRole("button", { name: "关节实验", exact: true }).click();
  const slider = page.locator(".joint-control input[type=range]").first();
  await slider.fill("0.3");
  await page.getByRole("button", { name: "结构探索", exact: true }).click();
  await page.locator(".explode-control input").fill("0.7");
  await expect.poll(async () => (await evidence()).amount).toBe(0.7);
  expect((await evidence()).minY).toBeGreaterThanOrEqual(
    (await evidence()).floor - 1e-7,
  );
  await page.locator(".explode-control input").fill("0");
  await expect.poll(async () => (await evidence()).amount).toBe(0);
  expect((await evidence()).positions).toEqual(base.positions);
  await page.screenshot({ path: "qa/explode-go2-posed-reset.png" });
});
test("G1 staged branches remain selectable, animate and return exactly to assembly", async ({
  page,
}) => {
  await page.goto("/?robot=g1&mode=parts&lang=zh");
  await expect(page.locator(".part-row").first()).toBeVisible();
  const viewer = page.locator(".viewer");
  await expect
    .poll(async () => !!(await viewer.getAttribute("data-explode-evidence")))
    .toBe(true);
  const original = JSON.parse(
    (await viewer.getAttribute("data-explode-evidence"))!,
  ).positions;
  await page.locator(".explode-control input").fill("1");
  await page.waitForTimeout(600);
  await expect(
    page.getByText("虚线：源模型连杆父子关系 · 非线束 / 非拆卸步骤", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(viewer).toHaveAttribute("data-camera-transition", "false");
  const expanded = JSON.parse(
    (await viewer.getAttribute("data-explode-evidence"))!,
  );
  expect(expanded.minY).toBeGreaterThanOrEqual(expanded.floor - 1e-7);
  await page
    .locator(".part-row")
    .filter({ has: page.getByText("left_elbow_link", { exact: true }) })
    .locator("button")
    .first()
    .click();
  await expect(page.getByTestId("evidence-link-id")).toHaveText(
    "left_elbow_link",
  );
  await page.screenshot({ path: "qa/explode-g1-selected-regression.png" });
  await page.locator(".explode-control input").fill("0");
  await page.waitForTimeout(500);
  await expect(
    page.getByText("虚线：源模型连杆父子关系 · 非线束 / 非拆卸步骤", {
      exact: true,
    }),
  ).toHaveCount(0);
  expect(
    JSON.parse((await viewer.getAttribute("data-explode-evidence"))!).positions,
  ).toEqual(original);
});

test("Go2 rapid consecutive presets during separation fit final geometry", async ({
  page,
}) => {
  await page.goto("/?robot=go2&mode=parts&lang=zh");
  const viewer = page.locator(".viewer");
  await expect
    .poll(() => viewer.getAttribute("data-explode-evidence"))
    .not.toBeNull();
  for (const amount of ["1", "0.4", "1"]) {
    await page.locator(".explode-control input").fill(amount);
    // No transition waits between these user actions: this is the regression path.
    for (const name of ["顶部", "侧面", "正面"])
      await page.getByRole("button", { name, exact: true }).click();
    await expect(viewer).toHaveAttribute("data-camera-transition", "false");
    await page.waitForTimeout(450);
    await expect
      .poll(async () => {
        const points = JSON.parse(
          (await viewer.getAttribute("data-explode-projection")) || "[]",
        );
        return (
          points.length === 8 &&
          points.every(
            (p: number[]) => Math.abs(p[0]) < 1.01 && Math.abs(p[1]) < 1.01,
          )
        );
      })
      .toBe(true);
  }
  await page.screenshot({ path: "qa/explode-go2-rapid-presets-fixed.png" });
});
