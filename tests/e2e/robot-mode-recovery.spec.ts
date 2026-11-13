import { test, expect } from "@playwright/test";

test("hand mode recovers when switching to G1 and back/forward restores compatible modes", async ({
  page,
}) => {
  await page.goto("/?robot=leap_hand&mode=hand&lang=zh");
  await expect(page.getByTestId("hand-lab-panel")).toBeVisible();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await page.getByLabel("切换机型", { exact: true }).selectOption("g1");
  await expect(page.getByTestId("structure-navigator")).toBeVisible();
  await expect(page).toHaveURL(/robot=g1&.*mode=parts/);
  await expect(
    page.getByRole("button", { name: "结构探索", exact: true }),
  ).toHaveClass(/active/);
  await page.goBack();
  await expect(page).toHaveURL(/robot=leap_hand&.*mode=hand/);
  await expect(page.getByTestId("hand-lab-panel")).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId("structure-navigator")).toBeVisible();
  await expect(page).toHaveURL(/robot=g1&.*mode=parts/);
  await page.reload();
  await expect(page.getByTestId("structure-navigator")).toBeVisible();
  await expect(page).toHaveURL(/robot=g1&.*mode=parts/);
});

test("direct specialized URLs and unknown assets normalize to a reachable structure page", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const entry of [
    "robot=g1&mode=hand",
    "robot=go2&mode=gripper",
    "robot=g1&mode=buildkit",
    "robot=missing&mode=hand",
  ]) {
    await page.goto(`/?${entry}&lang=en`);
    await expect(page.getByTestId("structure-navigator")).toBeVisible();
    await expect(page).toHaveURL(/mode=parts/);
    await expect(page.locator(".mode-tabs .active")).toHaveText("Structure");
    await expect(page.locator(".viewer-status")).toHaveCount(0);
  }
});

test("compatible hands preserve hand mode, and a gripper mode safely exits on another robot", async ({
  page,
}) => {
  await page.goto("/?robot=leap_hand&mode=hand&lang=zh");
  await expect(page.getByTestId("hand-lab-panel")).toBeVisible();
  await page.getByLabel("切换机型", { exact: true }).selectOption("svh_hand");
  await expect(page).toHaveURL(/robot=svh_hand&.*mode=hand/);
  await expect(page.getByTestId("hand-lab-panel")).toBeVisible();
  await page.goto("/?robot=franka-hand&mode=gripper&lang=zh");
  await expect(page.getByTestId("gripper-lab")).toBeVisible();
  await page.getByLabel("切换机型", { exact: true }).selectOption("leap_hand");
  await expect(page).toHaveURL(/robot=leap_hand&.*mode=parts/);
  await expect(page.getByTestId("structure-navigator")).toBeVisible();
});

test("unsupported specialized mode remains usable on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?robot=g1&mode=gripper&lang=zh");
  await expect(page.getByTestId("structure-navigator")).toBeVisible();
  await expect(page).toHaveURL(/mode=parts/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("unsupported course, chain and dynamics entries are absent for a hand", async ({
  page,
}) => {
  await page.goto("/?robot=leap_hand&mode=parts&lang=zh");
  await expect(page.getByTestId("structure-navigator")).toBeVisible();
  for (const name of ["机构课程", "运动链重建", "制造资料"])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  await expect(
    page.getByRole("button", { name: "灵巧手实验", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "运动编程", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "真实动力学", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "运动学程序", exact: true }),
  ).toBeVisible();
  await page.goto("/?robot=leap_hand&mode=systems&lang=zh");
  await expect(page.getByTestId("structure-navigator")).toBeVisible();
  await expect(page).toHaveURL(/mode=parts/);
});

test("a supported mode without an explicit robot is preserved while the catalog loads", async ({
  page,
}) => {
  await page.goto("/?mode=systems&lang=zh");
  await expect(page.locator(".mechanism-panel")).toBeVisible();
  await expect(page).toHaveURL(/robot=g1&.*mode=systems/);
});
