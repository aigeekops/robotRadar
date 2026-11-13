import { test, expect } from "@playwright/test";
const route =
  process.env.CONTACT_GRASP_PATH ||
  "/?robot=leap_hand&experience=grasp&lang=zh";
test("contact grasp is real worker physics with sequential scoring and render-coordinate agreement", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(route);
  const task = page.getByTestId("contact-grasp");
  const scene = page.getByTestId("contact-grasp-scene");
  await expect(task).toHaveAttribute("data-phase", "ready");
  await expect(
    page.getByRole("button", { name: "3 · 放回原台", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "1 · 抓握", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await page.getByRole("button", { name: "1 · 抓握", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "2 · 抬起并稳持", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "2 · 抬起并稳持", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "3 · 放回原台", exact: true }),
  ).toBeEnabled();
  const mismatch = await scene.evaluate((node) => {
    const p = JSON.parse((node as HTMLElement).dataset.physicsPose!),
      r = JSON.parse((node as HTMLElement).dataset.renderedPose!);
    const errors = [
      ...p.ball.map((x: number, i: number) => Math.abs(x - r.ball[i])),
    ];
    for (const name of Object.keys(p.links)) {
      if (!r.links[name]) throw Error("Missing rendered source link " + name);
      for (let i = 0; i < 3; i++)
        errors.push(Math.abs(p.links[name][i] - r.links[name][i]));
    }
    const xyzw = [
      p.quaternion[1],
      p.quaternion[2],
      p.quaternion[3],
      p.quaternion[0],
    ];
    return {
      maximum: Math.max(...errors),
      quaternion: Math.abs(
        Math.abs(
          xyzw.reduce(
            (s: number, v: number, i: number) => s + v * r.quaternion[i],
            0,
          ),
        ) - 1,
      ),
    };
  });
  expect(mismatch.maximum).toBeLessThan(0.00001);
  expect(mismatch.quaternion).toBeLessThan(0.000001);
  await page.screenshot({ path: "qa/contact-grasp-held.png" });
  await page.getByRole("button", { name: "3 · 放回原台", exact: true }).click();
  await expect(task).toHaveAttribute("data-phase", "complete", {
    timeout: 30000,
  });
  await page.screenshot({ path: "qa/contact-grasp-replaced.png" });
  expect(errors).toEqual([]);
});
test("grasp physics pauses on blur, stays paused on focus and resets without stale state", async ({
  page,
}) => {
  await page.goto(route);
  await expect(
    page.getByRole("button", { name: "1 · 抓握", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await page.getByRole("button", { name: "1 · 抓握", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const task = page.getByTestId("contact-grasp");
  await expect(task).toHaveAttribute("data-paused", "true");
  await page.waitForTimeout(100);
  const time = await page
    .getByTestId("contact-grasp-scene")
    .getAttribute("data-physics-pose");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(150);
  expect(
    await page
      .getByTestId("contact-grasp-scene")
      .getAttribute("data-physics-pose"),
  ).toBe(time);
  await page.getByRole("button", { name: "继续物理实验", exact: true }).click();
  await page.getByRole("button", { name: "重置抓取实验", exact: true }).click();
  await expect(task).toHaveAttribute("data-phase", "ready");
  await expect(
    page.getByRole("button", { name: "3 · 放回原台", exact: true }),
  ).toBeDisabled();
});
test("grasp missing resource recovers by reset and mobile controls fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/leap-grasp/model.xml", (r) =>
    r.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto(route);
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 60000 });
  await page.unroute("**/leap-grasp/model.xml");
  await page.getByRole("button", { name: "重置抓取实验", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "1 · 抓握", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "qa/contact-grasp-mobile.png",
    fullPage: true,
  });
});

// Fail only the main-thread visual mesh fetch. The worker's independent fetch
// remains healthy, so this catches partial-visual success rather than init failure.
test("grasp visual mesh failure stays disabled until reset despite a healthy physics worker", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { failGraspVisual: boolean };
    state.failGraspVisual = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (
        state.failGraspVisual &&
        url.includes("/robots/leap_hand/palm_lower.stl")
      )
        return Promise.resolve(new Response("missing visual", { status: 404 }));
      return originalFetch(input, init);
    };
  });
  await page.goto(route);
  await expect(page.getByRole("alert")).toContainText("手部模型加载失败", {
    timeout: 60000,
  });
  const grasp = page.getByRole("button", { name: "1 · 抓握", exact: true });
  await expect(page.getByTestId("contact-grasp")).toHaveAttribute(
    "data-phase",
    "ready",
  );
  await page.waitForTimeout(1000);
  await expect(grasp).toBeDisabled();
  await page.evaluate(() => {
    (window as typeof window & { failGraspVisual: boolean }).failGraspVisual =
      false;
  });
  await expect(grasp).toBeDisabled();
  await page.getByRole("button", { name: "重置抓取实验", exact: true }).click();
  await expect(grasp).toBeEnabled({ timeout: 60000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
});
