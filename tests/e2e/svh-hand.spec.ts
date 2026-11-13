import { handDriveLimits } from "../../src/core/handLab";
import { test, expect } from "@playwright/test";
import { svhHandDefinition as definition } from "../../src/core/svhHandData";

test("SVH exposes nine independent drives, source coupled followers and downloadable corresponding source", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?robot=svh_hand&mode=hand&showroom=0");
  const panel = page.getByTestId("hand-lab-panel"),
    viewer = page.locator(".viewer");
  await expect(panel).toContainText("SVH 五指耦合实验");
  const drive = page.getByLabel("手部关节 left_hand_Middle_Finger_Distal", {
    exact: true,
  });
  await expect(drive).toBeEnabled();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await expect(panel.locator(".hand-joint")).toHaveCount(9);
  await expect(panel).toContainText("GPL-3.0-or-later");
  await page.getByRole("button", { name: "中指", exact: true }).click();
  await expect(panel.locator(".hand-joint")).toHaveCount(2);
  const max = Number(await drive.getAttribute("max"));
  expect(max).toBeLessThan(1.334);
  await drive.fill(String(max));
  await expect
    .poll(
      async () =>
        JSON.parse((await viewer.getAttribute("data-joint-state"))!)
          .left_hand_Middle_Finger_Distal,
    )
    .toBeGreaterThan(1.2);
  let state = JSON.parse((await viewer.getAttribute("data-joint-state"))!);
  expect(state.left_hand_j15).toBeLessThanOrEqual(1.334 + 1e-9);
  expect(state.left_hand_j15).toBeCloseTo(
    state.left_hand_Middle_Finger_Distal * 1.0454,
    5,
  );
  await page.locator(".hand-mimic-list summary").click();
  await expect(page.locator(".hand-mimic-list p")).toHaveCount(11);
  await expect(page.locator(".hand-mimic-list input")).toHaveCount(0);
  await page.getByRole("button", { name: "握拳示意", exact: true }).click();
  await expect(panel).toHaveAttribute("data-playing", "false");
  state = JSON.parse((await viewer.getAttribute("data-joint-state"))!);
  expect(Object.keys(state)).toHaveLength(20);
  for (const joint of definition.joints) {
    expect(state[joint.name]).toBeGreaterThanOrEqual(joint.lower - 1e-9);
    expect(state[joint.name]).toBeLessThanOrEqual(joint.upper + 1e-9);
  }
  await page.screenshot({ path: "qa/svh-main-curl.png" });
  await page.getByRole("button", { name: "复位到源零位", exact: true }).click();
  await expect
    .poll(async () =>
      Object.values(
        JSON.parse((await viewer.getAttribute("data-joint-state"))!),
      ).every((v) => v === 0),
    )
    .toBe(true);
  const link = page.getByRole("link", {
    name: "下载完整对应模型源与转换说明（GPL）",
    exact: true,
  });
  await expect(link).toBeVisible();
  const response = await page.request.get((await link.getAttribute("href"))!);
  expect(response.ok()).toBe(true);
  expect((await response.body()).subarray(0, 2).toString()).toBe("PK");
  await page.screenshot({ path: "qa/svh-main-open.png" });
  expect(errors).toEqual([]);
});

test("SVH five digit controls remain usable on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?robot=svh_hand&mode=hand&showroom=0");
  const curl = page.getByLabel("小指 独立开合", { exact: true });
  await expect(curl).toBeEnabled();
  await curl.fill("0.5");
  await expect(
    page.getByTestId("hand-lab-panel").locator(".hand-joint"),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "qa/svh-main-mobile.png", fullPage: true });
});

test("SVH generic joint sliders use effective source-coupled drive limits", async ({
  page,
}) => {
  await page.goto("/?robot=svh_hand&mode=joints&view=explore&lang=zh");
  const controls = page.locator(".joint-control input[type=range]");
  const masters = definition.joints.filter(
    (j) => !j.mimic && j.type !== "fixed",
  );
  await expect(controls).toHaveCount(9);
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  let tightened = 0;
  for (const master of masters) {
    const input = page.getByLabel(master.name, { exact: true });
    await expect(input).toBeEnabled();
    const limits = handDriveLimits(definition, master.name);
    expect(Number(await input.getAttribute("min"))).toBeCloseTo(
      limits.lower,
      10,
    );
    expect(Number(await input.getAttribute("max"))).toBeCloseTo(
      limits.upper,
      10,
    );
    if (
      limits.upper < master.upper - 1e-6 ||
      limits.lower > master.lower + 1e-6
    )
      tightened++;
  }
  expect(tightened).toBeGreaterThan(0);
  for (const follower of definition.joints.filter((j) => j.mimic))
    await expect(page.getByLabel(follower.name, { exact: true })).toHaveCount(
      0,
    );
});
