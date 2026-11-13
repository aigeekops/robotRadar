import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
async function ready(page: import("@playwright/test").Page) {
  await page.goto("/?robot=g1&experience=build");
  await expect(page.getByTestId("assembly-part-0")).toBeVisible();
  await expect(page.getByTestId("assembly-canvas")).toHaveAttribute(
    "data-source-mesh-count",
    "26",
  );
}
test("source assembly rejects wrong tray choice, animates placement, requires held confirmations and resets", async ({
  page,
}) => {
  await ready(page);
  const canvas = page.getByTestId("assembly-canvas");
  const ids = JSON.parse((await canvas.getAttribute("data-source-step-ids"))!);
  expect(ids).toHaveLength(26);
  expect(new Set(ids).size).toBe(26);
  await page.getByTestId("assembly-part-1").click();
  await expect(page.locator(".ae-feedback")).toContainText("这不是当前步骤");
  await expect(canvas).toHaveAttribute("data-step", "0");
  await page.getByTestId("assembly-part-0").click();
  await expect(canvas).toHaveAttribute("data-phase", "confirm");
  const marker = page.getByRole("button", {
    name: "按住虚拟定位确认点 1",
    exact: true,
  });
  await expect(marker).toBeVisible();
  await marker.focus();
  await page.keyboard.down("Space");
  await page.waitForTimeout(180);
  await page.keyboard.up("Space");
  await expect(canvas).toHaveAttribute("data-step", "0");
  await expect(marker).toBeEnabled();
  await page.keyboard.down("Space");
  await page.waitForTimeout(800);
  await page.keyboard.up("Space");
  await expect(marker).toBeDisabled();
  const marker2 = page.getByRole("button", {
    name: "按住虚拟定位确认点 2",
    exact: true,
  });
  await marker2.focus();
  await page.keyboard.down("Space");
  await page.waitForTimeout(800);
  await page.keyboard.up("Space");
  await expect(canvas).toHaveAttribute("data-step", "1");
  await expect(canvas).toHaveAttribute("data-phase", "pick");
  await page.getByRole("button", { name: "撤回上一步", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-step", "0");
  await page.getByRole("button", { name: "自动组装", exact: true }).click();
  await expect(canvas).not.toHaveAttribute("data-phase", "pick");
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const paused = await canvas.getAttribute("data-fly");
  await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute("data-fly", paused!);
  await page.getByRole("button", { name: "重新开始", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-step", "0");
  await expect(canvas).toHaveAttribute("data-phase", "pick");
  await page.screenshot({ path: "qa/assembly-workbench-reset.png" });
  await page.getByRole("button", { name: "退出装配", exact: true }).click();
  await expect(page.getByTestId("assembly-experience")).toHaveCount(0);
});
test("automatic source assembly completes all 26 parts at exact original mesh transforms", async ({
  page,
}) => {
  test.setTimeout(180000);
  await ready(page);
  await page.getByRole("button", { name: "自动组装", exact: true }).click();
  await expect(page.getByTestId("assembly-canvas")).toHaveAttribute(
    "data-phase",
    "complete",
    { timeout: 150000 },
  );
  await expect(page.getByTestId("assembly-canvas")).toHaveAttribute(
    "data-step",
    "26",
  );
  await expect(page.locator(".ae-complete")).toContainText(
    "全部源模型部件已定位",
  );
  await expect(page.getByTestId("assembly-canvas")).toHaveAttribute(
    "data-placed-meshes",
    "26",
  );
  await expect(page.getByTestId("assembly-canvas")).toHaveAttribute(
    "data-max-assembly-error",
    /^[\d.eE+-]+$/,
  );
  await expect
    .poll(async () =>
      Number(
        await page
          .getByTestId("assembly-canvas")
          .getAttribute("data-max-assembly-error"),
      ),
    )
    .toBeLessThan(1e-8);
  const canvas = page.getByTestId("assembly-canvas");
  writeFileSync(
    "qa/assembly-verification.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        url: page.url(),
        sourceMeshCount: Number(
          await canvas.getAttribute("data-source-mesh-count"),
        ),
        sourceLinkIds: JSON.parse(
          (await canvas.getAttribute("data-source-step-ids"))!,
        ),
        completedSteps: Number(await canvas.getAttribute("data-step")),
        placedMeshes: Number(await canvas.getAttribute("data-placed-meshes")),
        maximumWorldMatrixError: Number(
          await canvas.getAttribute("data-max-assembly-error"),
        ),
        boundary:
          "source visual-link assembly; virtual alignment points, not service bolts or procedures",
      },
      null,
      2,
    ),
  );
  await page.screenshot({ path: "qa/assembly-workbench-complete.png" });
  await page.getByRole("button", { name: "重新开始", exact: true }).click();
  await expect(page.getByTestId("assembly-canvas")).toHaveAttribute(
    "data-phase",
    "pick",
  );
});
test("assembly mesh failure is recoverable and never reports completion", async ({
  page,
}) => {
  await page.route("**/robots/g1/robot.urdf", (r) => r.abort());
  await page.goto("/?robot=g1&experience=build");
  await expect(page.getByTestId("challenge-loading")).toHaveAttribute(
    "data-load-state",
    "error",
  );
  await expect(page.locator(".ae-complete")).toHaveCount(0);
  await page.unroute("**/robots/g1/robot.urdf");
  await page.getByRole("button", { name: "重试加载", exact: true }).click();
  await expect(page.getByTestId("assembly-part-0")).toBeVisible();
});

test("alignment pointer cancellation and blur cannot confirm, repeated resets clear live pieces", async ({
  page,
}) => {
  await ready(page);
  const canvas = page.getByTestId("assembly-canvas");
  await page.getByTestId("assembly-part-0").click();
  await expect(canvas).toHaveAttribute("data-phase", "confirm");
  const marker = page.getByRole("button", {
    name: "按住虚拟定位确认点 1",
    exact: true,
  });
  const point = await marker.boundingBox();
  await page.mouse.move(
    point!.x + point!.width / 2,
    point!.y + point!.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(150);
  await marker.dispatchEvent("pointercancel");
  await page.mouse.up();
  await page.waitForTimeout(750);
  await expect(marker).toBeEnabled();
  await expect(canvas).toHaveAttribute("data-step", "0");
  await marker.focus();
  await page.keyboard.down("Space");
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.keyboard.up("Space");
  await page.waitForTimeout(750);
  await expect(marker).toBeEnabled();
  await expect(canvas).toHaveAttribute("data-step", "0");
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "重新开始", exact: true }).click();
    await page.getByRole("button", { name: "自动组装", exact: true }).click();
    await page.waitForTimeout(180);
    await page.getByRole("button", { name: "重新开始", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-phase", "pick");
    await expect(canvas).toHaveAttribute("data-placed-meshes", "0");
    await expect(page.locator(".ae-marker:visible")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "自动组装", exact: true }).click();
  await page.getByRole("button", { name: "退出装配", exact: true }).click();
  await expect(page.getByTestId("assembly-experience")).toHaveCount(0);
  await page.waitForTimeout(250);
  await page.goto("/?robot=g1&experience=build");
  await expect(page.getByTestId("assembly-part-0")).toBeVisible();
  await expect(page.getByTestId("assembly-canvas")).toHaveAttribute(
    "data-step",
    "0",
  );
});

test("rendered source tray geometry supports actual raycast picking", async ({
  page,
}) => {
  await ready(page);
  const canvas = page.getByTestId("assembly-canvas");
  await expect(canvas).toHaveAttribute("data-tray-projections", /.+/);
  const point = JSON.parse(
    (await canvas.getAttribute("data-tray-projections"))!,
  )[0];
  const box = await canvas.boundingBox();
  await page.mouse.click(box!.x + point.x, box!.y + point.y);
  await expect(canvas).toHaveAttribute("data-phase", "confirm");
});

test("initial assembly shows every real source part in overview and complete inventory, with optional close-up trays", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const [robot, total] of [
    ["go2", 17],
    ["g1", 26],
  ] as const) {
    await page.goto(`/?robot=${robot}&experience=build&lang=zh`);
    const canvas = page.getByTestId("assembly-canvas");
    await expect(page.getByTestId("assembly-part-0")).toBeVisible();
    await expect(canvas).toHaveAttribute("data-tray-overview", "true");
    await expect(canvas).toHaveAttribute(
      "data-visible-pending-parts",
      String(total),
    );
    await expect(
      page.getByTestId("assembly-full-inventory").getByRole("button"),
    ).toHaveCount(total);
    await expect(page.getByTestId("assembly-inventory-count")).toHaveText(
      `共 ${total} 件 · 已装 0 · 待装 ${total}`,
    );
    await expect
      .poll(async () => {
        const points = JSON.parse(
          (await canvas.getAttribute("data-tray-projections")) || "[]",
        );
        const box = await canvas.boundingBox();
        return (
          points.length === total &&
          points.every(
            (p: { x: number; y: number; visible: boolean }) =>
              p.visible &&
              p.x > 0 &&
              p.y > 0 &&
              p.x < box!.width &&
              p.y < box!.height,
          )
        );
      })
      .toBe(true);
    await page.screenshot({ path: `qa/assembly-all-parts-${robot}.png` });
    await page.getByTestId(`assembly-part-${total - 1}`).click();
    await expect(page.locator(".ae-feedback")).toContainText("这不是当前步骤");
    await expect(canvas).toHaveAttribute("data-step", "0");
    await page
      .getByRole("button", { name: "回到当前目标", exact: true })
      .click();
    await expect(canvas).toHaveAttribute("data-tray-overview", "false");
    await expect(canvas).toHaveAttribute("data-visible-pending-parts", "4");
    await page.getByRole("button", { name: "下一托盘", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-tray-page", "1");
    await page
      .getByRole("button", { name: "全部配件总览", exact: true })
      .click();
    await expect(canvas).toHaveAttribute(
      "data-visible-pending-parts",
      String(total),
    );
    await expect(
      page.getByTestId("assembly-full-inventory").getByRole("button"),
    ).toHaveCount(total);
  }
});
