import { test, expect } from "@playwright/test";
for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [390, 667],
])
  test(`home games are visible and direct at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?robot=g1&showroom=1&lang=zh");
    for (const id of ["home-game-drive", "home-game-build"]) {
      const button = page.getByTestId(id);
      await expect(button).toBeInViewport();
      expect(
        await button.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          return hit === el || el.contains(hit);
        }),
      ).toBe(true);
    }
    await page.screenshot({ path: `qa/home-games-${width}x${height}.png` });
    await page.getByTestId("home-game-drive").click();
    await expect(page).toHaveURL(/experience=drive/);
    await expect(page).toHaveURL(/page=lab/);
    await expect(page.locator(".drive-scene[data-drive-state]")).toBeVisible();
    await page.getByRole("button", { name: "退出试驾", exact: true }).click();
    await page.getByTestId("home-game-build").click();
    await expect(page).toHaveURL(/experience=build/);
    await expect(page.getByTestId("assembly-experience")).toBeVisible();
    await expect(page.getByTestId("assembly-learning-context")).toHaveCount(0);
    await page.getByRole("button", { name: "退出装配", exact: true }).click();
    await expect(page.getByTestId("home-game-drive")).toBeVisible();
  });
test("workspace game entry clears previous observed assembly context", async ({
  page,
}) => {
  await page.goto("/?robot=g1&mode=parts&view=explore&lang=zh");
  await page
    .getByRole("button", { name: "带着当前观察进入装配", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "返回探索工作台", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "返回探索工作台", exact: true })
    .click();
  await page.getByTestId("workspace-game-build").click();
  await expect(page.getByTestId("assembly-learning-context")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "退出装配", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "退出装配", exact: true }).click();
  await page
    .getByRole("button", { name: "探索部件与系统", exact: true })
    .click();
  await page.getByTestId("workspace-game-drive").click();
  await expect(page).toHaveURL(/experience=drive/);
});
test("stationary arm, hand and gripper hide mobile challenge entries and recover old drive links", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const id of ["panda", "leap_hand", "franka-hand"]) {
    await page.goto(`/?robot=${id}&showroom=1&lang=zh`);
    await expect(page.getByTestId("home-game-build")).toBeVisible();
    await expect(page.getByTestId("home-game-drive")).toHaveCount(0);
    await page
      .getByRole("button", { name: "探索部件与系统", exact: true })
      .click();
    await expect(page.getByTestId("workspace-game-build")).toBeVisible();
    await expect(page.getByTestId("workspace-game-drive")).toHaveCount(0);
    if (id === "panda")
      await page.screenshot({
        path: "qa/review-fixes-20261113/panda-supported-entries.png",
      });
    await page.goto(`/?robot=${id}&experience=drive&lang=zh`);
    await expect(page.getByTestId("structure-navigator")).toBeVisible();
    await expect(page).not.toHaveURL(/experience=drive/);
    await expect(page.getByTestId("drive-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("drive-scene")).toHaveCount(0);
  }
});

test("removed Microduck external card stays absent and maker source details remain usable", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?page=catalog&lang=zh");
    const catalog = await (
      await page.request.get("/robots/manifest.json")
    ).json();
    await expect(page.locator(".catalog-grid > article")).toHaveCount(
      catalog.length,
    );
    await expect(page.getByTestId("microduck-catalog-card")).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: "打开 Microduck 官方 3D 模拟器 ↗",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `qa/catalog-without-external-card-${width}.png`,
      fullPage: true,
    });
    await page.goto("/?page=makers&lang=zh");
    await expect(page.getByTestId("microduck-catalog-card")).toHaveCount(0);
    const sources = page.locator(".maker-source-details");
    await expect(sources).toHaveCount(1);
    await expect(sources).not.toHaveAttribute("open", "");
    await sources.scrollIntoViewIfNeeded();
    await sources.locator("summary").click();
    await expect(sources.locator("footer")).toBeVisible();
  }
});
