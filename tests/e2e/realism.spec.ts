import { test, expect } from "@playwright/test";
test("photographic scene sleeps when idle and redraws camera, joints, selection and resize", async ({
  page,
}) => {
  await page.goto("/?robot=g1&mode=parts&lang=zh");
  const viewer = page.locator(".viewer");
  await expect(viewer).toHaveAttribute("data-render-pipeline", "pbr-studio");
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  const frames = async () =>
    Number(await viewer.getAttribute("data-render-frames"));
  await page.waitForTimeout(2200);
  const idle = await frames();
  await page.waitForTimeout(800);
  expect((await frames()) - idle).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "正面", exact: true }).click();
  await expect.poll(frames).toBeGreaterThan(idle);
  await expect(viewer).toHaveAttribute("data-camera-transition", "false");
  const camera = await frames();
  await page.getByRole("button", { name: "关节实验", exact: true }).click();
  await page.locator(".joint-control input").first().fill("0.3");
  await expect.poll(frames).toBeGreaterThan(camera);
  await page.getByRole("button", { name: "结构探索", exact: true }).click();
  const beforeSelect = await frames();
  await page.locator(".part-row button").first().click();
  await expect.poll(frames).toBeGreaterThan(beforeSelect);
  const beforeResize = await frames();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(frames).toBeGreaterThan(beforeResize);
  await expect(viewer.locator("canvas")).toHaveCount(1);
  const resources = JSON.parse(
    (await viewer.getAttribute("data-render-resources"))!,
  );
  expect(resources.textures).toBeGreaterThan(0);
  await page.getByRole("button", { name: "聚焦此连杆", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-camera-transition", "false");
  await page.screenshot({ path: "qa/cinema-demand-render.png" });
});
