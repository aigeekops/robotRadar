import { test, expect, type Page } from "@playwright/test";
import type { ExperimentPackage } from "../../src/core/experimentTemplate";
async function openProgram(page: Page, robot = "g1") {
  await page.goto(`/?robot=${robot}&mode=program&view=explore&lang=zh`);
  await expect(
    page.getByRole("textbox", { name: "运动程序", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下载当前机型模板", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
}
async function downloadTemplate(
  page: Page,
  robot = "g1",
): Promise<ExperimentPackage> {
  await openProgram(page, robot);
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载当前机型模板", exact: true })
    .click();
  const file = await promise;
  expect(file.suggestedFilename()).toBe(`${robot}-experiment-template.json`);
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const value = JSON.parse(
    Buffer.concat(chunks).toString(),
  ) as ExperimentPackage;
  expect(value.schemaVersion).toBe(1);
  expect(value.robotId).toBe(robot);
  expect(typeof value.program).toBe("string");
  expect(value.trace).toEqual([]);
  return value;
}
const upload = (page: Page, value: unknown) =>
  page.locator('.import-experiment input[type="file"]').setInputFiles({
    name: "template.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
async function assertStopped(page: Page) {
  await expect(
    page.getByRole("button", { name: "运行程序", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".program-toolbar > span")).toHaveText("0.00 s");
  await expect(page.locator(".trace-panel pre")).toHaveCount(0);
}

test("downloaded G1 source-bound template imports without running and executes only on explicit Run", async ({
  page,
}) => {
  const value = await downloadTemplate(page);
  const catalog = await (
    await page.request.get("/robots/manifest.json")
  ).json();
  const source = catalog.find((r: { id: string }) => r.id === "g1");
  expect(value.sourceCommit).toBe(source.sourceCommit);
  expect(value.urdfUrl).toBe(source.urdfUrl);
  const frames = JSON.parse(value.program).frames;
  expect(frames.map((f: { time: number }) => f.time)).toEqual([0, 2, 4]);
  const moved = Object.keys(frames[0].joints).find(
    (n) => frames[0].joints[n] !== frames[1].joints[n],
  )!;
  expect(moved).toBeTruthy();
  await upload(page, value);
  await expect(
    page.getByRole("textbox", { name: "运动程序", exact: true }),
  ).toHaveValue(value.program);
  await assertStopped(page);
  await page.waitForTimeout(350);
  await assertStopped(page);
  await page.getByRole("button", { name: "运行程序", exact: true }).click();
  await expect(page.locator(".trace-panel pre")).toBeVisible();
  await expect
    .poll(
      async () =>
        JSON.parse(await page.locator(".trace-panel pre").innerText()).values[
          moved
        ],
      { timeout: 10000 },
    )
    .not.toBe(frames[0].joints[moved]);
  await expect(
    page.getByRole("button", { name: "运行程序", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".program-toolbar > span")).toHaveText("4.00 s");
});

test("import rejects mismatched or missing revision and unknown joint without replacing the program", async ({
  page,
}) => {
  const value = await downloadTemplate(page);
  const editor = page.getByRole("textbox", { name: "运动程序", exact: true });
  const before = await editor.inputValue();
  for (const bad of [
    { ...value, sourceCommit: "0".repeat(40) },
    { ...value, sourceCommit: undefined },
  ]) {
    await upload(page, bad);
    await expect(page.getByRole("alert")).toContainText("模型版本不一致");
    await expect(editor).toHaveValue(before);
    await assertStopped(page);
  }
  await upload(page, {
    ...value,
    program: JSON.stringify({
      frames: [
        { time: 0, joints: { invented_joint: 0 } },
        { time: 1, joints: { invented_joint: 0.1 } },
      ],
    }),
  });
  await expect(page.getByRole("alert")).toContainText("未知关节");
  await expect(editor).toHaveValue(before);
  await assertStopped(page);
});

test("cross-model hand imports validate the target source and ignore uploaded model URLs", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const id of ["franka-hand", "svh_hand"]) {
    const value = await downloadTemplate(page, id);
    await openProgram(page, "g1");
    const requests: string[] = [];
    const listener = (request: { url: () => string }) =>
      requests.push(new URL(request.url()).pathname);
    page.on("request", listener);
    await upload(page, {
      ...value,
      urdfUrl: "/robots/untrusted-import-path/robot.urdf",
    });
    await expect(page).toHaveURL(new RegExp(`robot=${id}`));
    await expect(
      page.getByRole("textbox", { name: "运动程序", exact: true }),
    ).toHaveValue(value.program);
    await expect(page.locator(".viewer-status")).toHaveCount(0);
    await assertStopped(page);
    await page.waitForTimeout(350);
    await assertStopped(page);
    expect(requests).toContain(value.urdfUrl);
    expect(requests).not.toContain("/robots/untrusted-import-path/robot.urdf");
    page.off("request", listener);
    await page.getByRole("button", { name: "运行程序", exact: true }).click();
    await expect(page.locator(".trace-panel pre")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "运行程序", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
