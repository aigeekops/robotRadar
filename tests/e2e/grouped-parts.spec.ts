import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.goto("/?robot=go2&mode=parts&lang=zh");
  await expect(page.getByTestId("grouped-parts-count")).toContainText(
    "17 个可视源实例 · 11 个代表件 · 6 组重复",
  );
  await expect(page.locator(".viewer-status")).toHaveCount(0);
}
const mode = (page: Page, name: string) =>
  page.getByTestId("grouped-parts").getByRole("button", { name, exact: true });
test("Go2 grouping shows six ×2 representatives and original-copy selection restores every instance", async ({
  page,
}) => {
  await ready(page);
  await expect(page.getByTestId("grouped-part-card")).toHaveCount(17);
  const visible = async () =>
    JSON.parse(
      (await page
        .locator(".viewer")
        .getAttribute("data-visible-source-links")) || "[]",
    ) as string[];
  await expect.poll(async () => (await visible()).length).toBe(17);
  await page.locator("#explode").fill("1");
  await page.getByRole("button", { name: "正面", exact: true }).click();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-camera-transition",
    "false",
  );
  await page.waitForTimeout(600);
  const all = await page.locator(".viewer canvas").screenshot();
  await mode(page, "代表件 × 数量").click();
  await expect(page.getByTestId("grouped-part-card")).toHaveCount(11);
  await expect.poll(async () => (await visible()).length).toBe(11);
  for (const id of [
    "RL_thigh",
    "RL_calf",
    "RL_foot",
    "RR_thigh",
    "RR_calf",
    "RR_foot",
  ])
    expect(await visible()).not.toContain(id);
  await expect(
    page.locator(".gp-card strong").filter({ hasText: "× 2" }),
  ).toHaveCount(6);
  await expect(page.locator("#explode")).toHaveValue("1");
  await page.waitForTimeout(600);
  expect((await page.locator(".viewer canvas").screenshot()).equals(all)).toBe(
    false,
  );
  await page.screenshot({
    path: "qa/grouped-go2-representatives.png",
    fullPage: true,
  });
  const card = page.getByTestId("grouped-part-card").filter({
    has: page.getByRole("button", {
      name: "选择代表件 FL_thigh",
      exact: true,
    }),
  });
  await card.locator("summary").click();
  await card
    .getByRole("button", { name: "定位原实例 RL_thigh", exact: true })
    .click();
  await expect(mode(page, "全部实例")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("grouped-part-card")).toHaveCount(17);
  await expect(page.getByTestId("evidence-link-id")).toHaveText("RL_thigh");
  await expect.poll(async () => (await visible()).length).toBe(17);
  expect(await visible()).toContain("RL_thigh");
  await mode(page, "代表件 × 数量").click();
  await mode(page, "全部实例").click();
  await expect(page.getByTestId("grouped-part-card")).toHaveCount(17);
});
test("grouped display never reduces the source instances used by assembly or persists into another robot", async ({
  page,
}) => {
  test.setTimeout(120000);
  await ready(page);
  await mode(page, "代表件 × 数量").click();
  await page
    .getByRole("button", { name: "选择代表件 FL_thigh", exact: true })
    .click();
  await page
    .getByRole("button", { name: "带着当前观察进入装配", exact: true })
    .click();
  await expect(page.getByTestId("assembly-part-0")).toBeVisible();
  const ids = JSON.parse(
    (await page
      .getByTestId("assembly-canvas")
      .getAttribute("data-source-step-ids")) || "[]",
  );
  expect(ids).toHaveLength(17);
  for (const id of [
    "FL_thigh",
    "RL_thigh",
    "FL_calf",
    "RL_calf",
    "FL_foot",
    "RL_foot",
    "FR_thigh",
    "RR_thigh",
    "FR_calf",
    "RR_calf",
    "FR_foot",
    "RR_foot",
  ])
    expect(ids).toContain(id);
  await page
    .getByRole("button", { name: "返回探索工作台", exact: true })
    .click();
  await expect(page.getByTestId("grouped-part-card")).toHaveCount(17);
  await expect(mode(page, "全部实例")).toHaveAttribute("aria-pressed", "true");
  await mode(page, "代表件 × 数量").click();
  await page.locator(".robot-strip .robot-chip").nth(0).click();
  await expect(page.getByTestId("grouped-parts-count")).toContainText(
    "26 个可视源实例 · 26 个代表件 · 0 组重复",
  );
  await expect(mode(page, "全部实例")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("grouped-part-card")).toHaveCount(26);
  await expect(page.getByTestId("grouped-parts")).not.toContainText("FL_thigh");
  await page.locator(".robot-strip .robot-chip").nth(1).click();
  await expect(page.getByTestId("grouped-part-card")).toHaveCount(17);
  await expect(mode(page, "全部实例")).toHaveAttribute("aria-pressed", "true");
});
