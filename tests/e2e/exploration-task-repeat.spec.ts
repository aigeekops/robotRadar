import { test, expect } from "@playwright/test";

test("completed task can repeat in parts mode and requires fresh real link selection", async ({
  page,
}) => {
  await page.goto("/?robot=g1&mode=learn&lang=zh&view=explore");
  const task = page.getByTestId("exploration-task");
  await expect(
    task.getByRole("button", { name: "开始动手任务", exact: true }),
  ).toBeVisible();
  const link = (await task.getAttribute("data-task-link"))!;
  const joint = (await task.getAttribute("data-task-joint"))!;
  const target = Number(await task.getAttribute("data-task-target"));
  const row = page
    .locator(".part-row")
    .filter({ has: page.getByText(link, { exact: true }) });
  await task.getByRole("button", { name: "开始动手任务", exact: true }).click();
  await row.locator("button").first().click();
  await expect(task).toHaveAttribute("data-phase", "move");
  await task.getByRole("button", { name: "前往关节实验", exact: true }).click();
  const slider = page.getByLabel(joint, { exact: true });
  const lower = Number(await slider.getAttribute("min"));
  const step = Number(await slider.getAttribute("step"));
  await slider.fill(
    (lower + Math.round((target - lower) / step) * step).toFixed(8),
  );
  await expect(task).toHaveAttribute("data-phase", "reset");
  await page
    .getByRole("button", { name: "关节复位（限位内）", exact: true })
    .click();
  await expect(task).toHaveAttribute("data-phase", "complete");

  // Reproduce the boundary: completed, already in parts mode, target still selected.
  await page.getByRole("button", { name: "结构探索", exact: true }).click();
  await row.locator("button").first().click();
  await expect(task).toHaveAttribute("data-phase", "complete");
  const pose = await page.locator(".viewer").getAttribute("data-joint-state");
  await task.getByRole("button", { name: "重新练习", exact: true }).click();
  await expect(task).toHaveAttribute("data-phase", "select");
  await page.waitForTimeout(200);
  await expect(task).toHaveAttribute("data-phase", "select");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-joint-state",
    pose!,
  );

  // Click the same source link again through the real tree, not an injected state update.
  await row.locator("button").first().click();
  await expect(task).toHaveAttribute("data-phase", "move");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-joint-state",
    pose!,
  );
});

test("task guidance focuses real controls without completing steps, and completion can be dismissed", async ({
  page,
}) => {
  await page.goto("/?robot=g1&mode=learn&lang=zh");
  const task = page.getByTestId("exploration-task");
  await expect(
    task.getByRole("button", { name: "开始动手任务", exact: true }),
  ).toBeVisible();
  const link = (await task.getAttribute("data-task-link"))!;
  const joint = (await task.getAttribute("data-task-joint"))!;
  const target = Number(await task.getAttribute("data-task-target"));
  await task.getByRole("button", { name: "开始动手任务", exact: true }).click();
  const row = page
    .locator(".part-row")
    .filter({ has: page.getByText(link, { exact: true }) });
  await task.getByRole("button", { name: "前往结构探索", exact: true }).click();
  await expect(row.locator("button").first()).toBeFocused();
  await expect(task).toHaveAttribute("data-phase", "select");
  await row.locator("button").first().click();
  await expect(task).toHaveAttribute("data-phase", "move");
  await task.getByRole("button", { name: "前往关节实验", exact: true }).click();
  const slider = page.getByLabel(joint, { exact: true });
  await expect(slider).toBeFocused();
  await expect(task).toHaveAttribute("data-phase", "move");
  const lower = Number(await slider.getAttribute("min"));
  const step = Number(await slider.getAttribute("step"));
  await slider.fill(
    (lower + Math.round((target - lower) / step) * step).toFixed(8),
  );
  await expect(task).toHaveAttribute("data-phase", "reset");
  await page
    .getByRole("button", { name: "关节复位（限位内）", exact: true })
    .click();
  await expect(task).toHaveAttribute("data-phase", "complete");
  await expect(task).toHaveClass(/is-compact/);
  expect((await task.boundingBox())!.height).toBeLessThan(150);
  await page.getByRole("button", { name: "资料与边界", exact: true }).click();
  await task.getByRole("button", { name: "收起提示", exact: true }).click();
  await expect(task).toHaveCount(0);
  await page.getByRole("button", { name: "学习路径", exact: true }).click();
  await expect(task).toHaveAttribute("data-phase", "complete");
  await expect(
    task.getByRole("button", { name: "重新练习", exact: true }),
  ).toBeVisible();
  await expect(task).not.toHaveClass(/is-compact/);
});
