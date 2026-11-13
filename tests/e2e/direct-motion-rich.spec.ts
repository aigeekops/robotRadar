import { test, expect } from "@playwright/test";
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`G1 seven source actions and accessible controls at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?robot=g1&mode=joints&view=explore&lang=zh");
    await expect(page.locator(".viewer-status")).toHaveCount(0);
    await expect(page.locator('[data-testid^="direct-preset-"]')).toHaveCount(
      7,
    );
    for (const id of [
      "look-and-present",
      "alternating-reach",
      "bilateral-presentation",
      "forearm-axis-contrast",
      "leg-chain-study",
    ]) {
      await page.getByTestId(`direct-preset-${id}`).click();
      await expect(page.getByTestId("direct-toggle")).toContainText("暂停");
      await page.getByLabel("动作进度", { exact: true }).fill("0.5");
      await expect(page.getByTestId("direct-toggle")).toContainText("播放");
    }
    const speed = page.getByLabel("播放速度", { exact: true });
    await speed.scrollIntoViewIfNeeded();
    await expect(speed).toBeInViewport();
    expect(
      await speed.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
        );
        return hit === el || el.contains(hit);
      }),
    ).toBe(true);
    await speed.fill("0.75");
    await expect(speed).toHaveValue("0.75");
    await page.getByTestId("direct-reset").click();
    await expect(page.getByLabel("动作进度", { exact: true })).toHaveValue("0");
    await expect(page.getByTestId("direct-toggle")).toContainText("播放");
  });
}

test("standalone gripper and coupled SVH expose real direct teaching sequences", async ({
  page,
}) => {
  for (const [id, count] of [
    ["franka-hand", 1],
    ["svh_hand", 3],
  ] as const) {
    await page.goto(`/?robot=${id}&mode=joints&view=explore&lang=zh`);
    const buttons = page.locator('[data-testid^="direct-preset-"]');
    await expect(buttons).toHaveCount(count);
    const ids = await buttons.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-testid")!),
    );
    for (const key of ids) {
      await page.getByTestId(key).click();
      await page.getByLabel("动作进度", { exact: true }).fill("0.5");
      await expect(page.getByTestId("direct-toggle")).toContainText("播放");
    }
    await page.getByTestId("direct-reset").click();
    await expect(page.getByLabel("动作进度", { exact: true })).toHaveValue("0");
  }
});
