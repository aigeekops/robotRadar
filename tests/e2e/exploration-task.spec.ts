import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page, id: string) {
  await page.goto(`/?robot=${id}&mode=learn&lang=zh&view=explore`);
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "开始动手任务", exact: true }),
  ).toBeVisible();
  return page.getByTestId("exploration-task");
}
for (const id of ["g1", "franka-hand", "svh_hand"])
  test(`${id} executable task requires real selection, source movement and reset`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const task = await ready(page, id);
    const joint = (await task.getAttribute("data-task-joint"))!,
      link = (await task.getAttribute("data-task-link"))!;
    const target = Number(await task.getAttribute("data-task-target")),
      tolerance = Number(await task.getAttribute("data-task-tolerance"));
    await task
      .getByRole("button", { name: "开始动手任务", exact: true })
      .click();
    await expect(task).toHaveAttribute("data-phase", "select");
    await page
      .locator(".part-row")
      .filter({ has: page.getByText(link, { exact: true }) })
      .locator("button")
      .first()
      .click();
    await expect(task).toHaveAttribute("data-phase", "move");
    await task
      .getByRole("button", { name: "前往关节实验", exact: true })
      .click();
    const slider = page.getByLabel(joint, { exact: true });
    const lower = Number(await slider.getAttribute("min")),
      step = Number(await slider.getAttribute("step"));
    const quantized = lower + Math.round((target - lower) / step) * step;
    await slider.fill(quantized.toFixed(8));
    await expect(task).toHaveAttribute("data-phase", "reset");
    await expect
      .poll(async () =>
        Math.abs(
          JSON.parse(
            (await page.locator(".viewer").getAttribute("data-joint-state")) ||
              "{}",
          )[joint] - target,
        ),
      )
      .toBeLessThanOrEqual(tolerance);
    await page
      .getByRole("button", { name: "关节复位（限位内）", exact: true })
      .click();
    await expect(task).toHaveAttribute("data-phase", "complete");
    await expect
      .poll(async () =>
        Math.abs(
          JSON.parse(
            (await page.locator(".viewer").getAttribute("data-joint-state")) ||
              "{}",
          )[joint],
        ),
      )
      .toBeLessThanOrEqual(tolerance);
    await page.reload();
    await expect(task).toHaveAttribute("data-phase", "complete");
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(task).toContainText("Completed for this source version");
    await page.screenshot({ path: `qa/task-complete-${id}.png` });
  });
test("task does not skip wrong selection and cancels on model switch; storage denial remains usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new Error("storage denied");
    };
  });
  const task = await ready(page, "g1");
  const target = (await task.getAttribute("data-task-link"))!;
  await task.getByRole("button", { name: "开始动手任务", exact: true }).click();
  const rows = page.locator(".part-row");
  for (let i = 0; i < (await rows.count()); i++) {
    if ((await rows.nth(i).locator("strong").innerText()) !== target) {
      await rows.nth(i).locator("button").first().click();
      break;
    }
  }
  await expect(task).toHaveAttribute("data-phase", "select");
  await page.locator(".model-picker select").selectOption("go2");
  await page.getByRole("button", { name: "学习路径", exact: true }).click();
  await expect(task).toHaveAttribute("data-phase", "idle");
  await expect(
    task.getByRole("button", { name: "开始动手任务", exact: true }),
  ).toBeEnabled();
  const link = (await task.getAttribute("data-task-link"))!,
    joint = (await task.getAttribute("data-task-joint"))!;
  const angle = Number(await task.getAttribute("data-task-target"));
  await task.getByRole("button", { name: "开始动手任务", exact: true }).click();
  await page
    .locator(".part-row")
    .filter({ has: page.getByText(link, { exact: true }) })
    .locator("button")
    .first()
    .click();
  await task.getByRole("button", { name: "前往关节实验", exact: true }).click();
  const slider = page.getByLabel(joint, { exact: true }),
    min = Number(await slider.getAttribute("min")),
    step = Number(await slider.getAttribute("step"));
  await slider.fill((min + Math.round((angle - min) / step) * step).toFixed(8));
  await expect(task).toHaveAttribute("data-phase", "reset");
  await page
    .getByRole("button", { name: "关节复位（限位内）", exact: true })
    .click();
  await expect(task).toHaveAttribute("data-phase", "complete");
  await expect(task).toContainText("本地保存不可用");
  await page.reload();
  await page.getByRole("button", { name: "学习路径", exact: true }).click();
  await expect(task).toHaveAttribute("data-phase", "idle");
});
