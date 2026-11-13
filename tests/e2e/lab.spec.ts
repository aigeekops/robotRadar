import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page, robot = "g1") {
  await page.goto(`/?robot=${robot}`);
  await expect(page.locator(".part-row").first()).toBeVisible();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await expect(page.locator(".viewer canvas")).toBeVisible();
  const bounds = JSON.parse(
    (await page.locator(".viewer").getAttribute("data-model-bounds")) || "{}",
  );
  expect(bounds.meshCount).toBeGreaterThan(0);
  expect(
    bounds.size.every((value: number) => Number.isFinite(value) && value > 0),
  ).toBe(true);
  expect(
    bounds.position.every(
      (value: number) => typeof value === "number" && Number.isFinite(value),
    ),
  ).toBe(true);
}
async function setRange(page: Page, selector: string, value: number) {
  const input = page.locator(selector).first();
  await input.fill(String(value));
  await input.dispatchEvent("input");
  await input.dispatchEvent("change");
}

test("all official models load with local mesh resources and no HTTP failures", async ({
  page,
}) => {
  const failures: string[] = [];
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
    if (
      /\.(stl|dae|obj)(?:\?|$)/i.test(response.url()) &&
      response.headers()["content-type"]?.includes("text/html")
    ) {
      failures.push(`Mesh URL returned HTML: ${response.url()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const response = await page.request.get("/robots/manifest.json");
  const robots = await response.json();
  expect(robots.length).toBeGreaterThanOrEqual(4);
  for (const robot of robots) {
    await page
      .locator(".robot-chip")
      .filter({ has: page.getByText(robot.name.zh, { exact: true }) })
      .click();
    await expect(page.locator(".stage-heading h2")).toHaveText(robot.name.zh);
    await expect(page.locator(".part-row")).toHaveCount(robot.linkCount);
    await expect(page.locator(".viewer-status")).toHaveCount(0);
    await page.screenshot({ path: `qa/model-${robot.id}.png` });
    await page
      .locator(".viewer")
      .screenshot({ path: `qa/preview-${robot.id}.png` });
  }
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

test("structure selection, isolation, visibility, separation and reset", async ({
  page,
}) => {
  await ready(page);
  const first = page.locator(".part-row").first();
  const name = await first.locator("strong").innerText();
  await first.locator("button").first().click();
  await expect(page.locator(".selection-card > div > strong")).toHaveText(name);
  await page.getByRole("button", { name: "仅显示此连杆", exact: true }).click();
  await page.getByRole("button", { name: "显示全部", exact: true }).click();
  await first.locator(".visibility-button").click();
  await first.locator(".visibility-button").click();
  await setRange(page, "#explode", 0.6);
  await expect(page.locator(".explode-control b")).toHaveText("60%");
  await page.getByRole("button", { name: "复位", exact: true }).click();
  await expect(page.locator(".selection-card")).toHaveCount(0);
  await expect(page.locator("#explode")).toHaveValue("0");
  await page.getByPlaceholder("搜索连杆名称…").fill("not-a-link");
  await expect(page.locator(".part-row")).toHaveCount(0);
  await page.getByPlaceholder("搜索连杆名称…").fill("");
  await expect(page.locator(".part-row").first()).toBeVisible();
});

test("joint controls update, language switch preserves state, reset returns neutral", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "关节实验", exact: true }).click();
  const first = page.locator(".joint-control").first();
  const input = first.locator("input");
  const max = Number(await input.getAttribute("max"));
  const min = Number(await input.getAttribute("min"));
  const value = Math.round((min + (max - min) * 0.6) * 100) / 100;
  await input.fill(String(value));
  await expect(first.locator("b")).toContainText(value.toFixed(2));
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Joints", exact: true }),
  ).toBeVisible();
  expect(Math.abs(Number(await input.inputValue()) - value)).toBeLessThan(0.01);
  await page
    .getByRole("button", { name: "Reset all joints", exact: true })
    .click();
  await expect(first.locator("b")).toContainText("0.00");
});

test("lesson progress persists through reload and language switching", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "学习路径", exact: true }).click();
  await page.getByRole("button", { name: "标记已读", exact: true }).click();
  await expect(page.locator(".progress-label b")).toContainText("1 /");
  await page.reload();
  await expect(page.locator(".robot-chip").first()).toBeVisible();
  await page.getByRole("button", { name: "学习路径", exact: true }).click();
  await expect(page.locator(".progress-label b")).toContainText("1 /");
  await expect(
    page.getByRole("button", { name: "已读", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Read", exact: true }),
  ).toBeVisible();
});

test("quiz reports real answer feedback and supports clearing", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "知识检验", exact: true }).click();
  const question = page.locator(".question").first();
  await question.locator("button").first().click();
  await expect(question.locator(".answer-explanation")).toBeVisible();
  await expect(
    question.locator("button.correct, button.incorrect"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "重新测验", exact: true }).click();
  await expect(page.locator(".answer-explanation")).toHaveCount(0);
});

test("JSON program validates errors, runs actual joint targets and stops on model switch", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "运动编程", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "运动程序", exact: true });
  const initial = JSON.parse(await editor.inputValue());
  const joint = Object.keys(initial.frames[0].joints)[0];
  await editor.fill("{broken");
  await page.getByRole("button", { name: "运行程序", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await editor.fill(
    JSON.stringify({
      frames: [
        { time: 0, joints: { invented: 0 } },
        { time: 1, joints: {} },
      ],
    }),
  );
  await page.getByRole("button", { name: "运行程序", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("未知关节");
  await editor.fill(
    JSON.stringify({
      frames: [
        { time: 0, joints: { [joint]: 0 } },
        { time: 10, joints: { [joint]: 0.2 } },
      ],
    }),
  );
  await page.getByRole("button", { name: "运行程序", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".trace-panel pre")).toBeVisible();
  await page.waitForTimeout(400);
  const sample = JSON.parse(await page.locator(".trace-panel pre").innerText());
  expect(sample.values[joint]).toBeGreaterThan(0);
  await page.locator(".robot-chip").nth(1).click();
  await expect(
    page.getByRole("button", { name: "运行程序", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".program-toolbar > span")).toHaveText("0.00 s");
  await page.waitForTimeout(300);
  await expect(page.locator(".program-toolbar > span")).toHaveText("0.00 s");
  await expect(page.locator(".trace-panel pre")).toHaveCount(0);
});

test("catalog filtering, comparison and return-to-lab paths", async ({
  page,
}) => {
  await ready(page);
  const robotCount = (
    await (await page.request.get("/robots/manifest.json")).json()
  ).length;
  await page.getByRole("button", { name: "机器人档案", exact: true }).click();
  await expect(page.locator(".catalog-grid article")).toHaveCount(robotCount);
  await page.locator(".catalog-filters button").nth(1).click();
  expect(await page.locator(".catalog-grid article").count()).toBeLessThan(
    robotCount,
  );
  await page.getByRole("button", { name: "全部机型", exact: true }).click();
  await expect(page.locator(".catalog-grid article")).toHaveCount(robotCount);
  await page.getByRole("button", { name: "机型对比", exact: true }).click();
  await expect(page.getByTestId("compare-experience")).toBeVisible();
  await expect(page.locator(".compare-experience .viewer canvas")).toHaveCount(
    2,
  );
  await expect(page.locator(".compare-experience .viewer-status")).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "探索此机型 →", exact: true })
    .nth(1)
    .click();
  await expect(page.locator(".workspace")).toBeVisible();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
});

test("missing model reports recoverable error rather than silently claiming success", async ({
  page,
}) => {
  await page.route("**/robots/g1/robot.urdf", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/?robot=g1");
  await expect(page.getByText("模型加载失败", { exact: true })).toBeVisible();
  await page.unroute("**/robots/g1/robot.urdf");
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  await expect(page.locator(".part-row").first()).toBeVisible();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
});

test("Chinese and English desktop visual baselines", async ({ page }) => {
  await ready(page);
  await page.screenshot({ path: "qa/home-zh.png", fullPage: true });
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Structure", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "qa/home-en.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator(".workspace")).toBeVisible();
  await page.screenshot({ path: "qa/desktop-1280.png", fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("malformed saved storage cannot prevent app from opening", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("robot-radar-v1", "null"),
  );
  await ready(page);
});

test("twenty repeated model switches recover latest selection without stale panels", async ({
  page,
}) => {
  await ready(page);
  const robots = await (await page.request.get("/robots/manifest.json")).json();
  const count = robots.length;
  for (let index = 0; index < 20; index++) {
    await page
      .locator(".robot-chip")
      .nth(index % count)
      .click();
  }
  await expect(page.locator(".stage-heading h2")).toHaveText(
    robots[19 % count].name.zh,
  );
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await expect(page.locator(".part-row").first()).toBeVisible();
  const bounds = JSON.parse(
    (await page.locator(".viewer").getAttribute("data-model-bounds")) || "{}",
  );
  expect(bounds.meshCount).toBeGreaterThan(0);
  expect(bounds.position.every((value: number) => Number.isFinite(value))).toBe(
    true,
  );
  await page
    .locator(".robot-chip")
    .nth(19 % count)
    .click();
  await expect(page.locator(".part-row").first()).toBeVisible();
});

test("experiment export and import preserve program, enforce revision and never auto-run", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "运动编程", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "运动程序", exact: true });
  const custom = JSON.parse(await editor.inputValue());
  custom.frames[1].time = 0.75;
  custom.frames[2].time = 1.5;
  const original = JSON.stringify(custom, null, 2);
  await editor.fill(original);
  const downloadEvent = page.waitForEvent("download");
  await page.getByTitle("导出实验", { exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("g1-experiment.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.schemaVersion).toBe(1);
  expect(exported.robotId).toBe("g1");
  expect(exported.sourceCommit).toBeTruthy();
  expect(exported.program).toBe(original);
  const upload = async (value: unknown) =>
    page.locator('input[type="file"]').setInputFiles({
      name: "experiment.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
  await upload({ ...exported, sourceCommit: "wrong-revision" });
  await expect(page.getByRole("alert")).toContainText("模型版本不一致");
  await upload(exported);
  await expect(editor).toHaveValue(original);
  await expect(
    page.getByRole("button", { name: "运行程序", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".program-toolbar > span")).toHaveText("0.00 s");
  await page.locator(".robot-chip").nth(1).click();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await upload(exported);
  await expect(page.locator(".stage-heading h2")).toContainText("G1");
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await expect(editor).toHaveValue(original);
  await page.waitForTimeout(300);
  await expect(editor).toHaveValue(original);
  await expect(
    page.getByRole("button", { name: "运行程序", exact: true }),
  ).toBeVisible();
});

test("real MuJoCo simulation changes outcomes, replays computed state and exports evidence", async ({
  page,
}) => {
  const serviceRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).port === "8765") serviceRequests.push(r.url());
  });
  await ready(page);
  await page.getByRole("button", { name: "运动编程", exact: true }).click();
  await page.getByRole("button", { name: "真实动力学", exact: true }).click();
  await expect(
    page.getByText("浏览器引擎已就绪", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "执行真实动力学", exact: true })
    .click();
  await expect(page.locator(".dynamics-panel .trace-panel pre")).toContainText(
    "finalPositionDeltaRad",
  );
  await page.getByRole("button", { name: "回放计算轨迹", exact: true }).click();
  await expect(
    page.locator(".dynamics-panel .program-toolbar > span"),
  ).toHaveText("0.200 s");
  const rawAngle = parseFloat(
    await page.locator(".dynamics-readout strong").innerText(),
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByTitle("导出引擎结果", { exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("g1-mode10-mujoco-result.json");
  const chunks: Buffer[] = [];
  const stream = await download.createReadStream();
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.profile.engineVersion).toBe("3.5.1");
  expect(exported.profile.runtime).toBe("browser WebAssembly worker");
  expect(exported.comparison.sameInitialState).toBe(true);
  expect(exported.comparison.finalPositionDeltaRad).toBeCloseTo(
    0.3578402740911404,
    10,
  );
  expect(exported.controlled.finite).toBe(true);
  expect(exported.controlled.steps).toBe(200);
  expect(
    Math.abs(rawAngle - exported.controlled.final.positions.left_elbow_joint),
  ).toBeLessThan(0.000001);
  expect(serviceRequests).toEqual([]);
  await page.getByRole("button", { name: "关节实验", exact: true }).click();
  const actualJointRow = page
    .locator(".joint-control")
    .filter({ has: page.locator('label[for="left_elbow_joint"]') });
  await expect(actualJointRow.locator("b")).toContainText("0.00");
  await page.getByRole("button", { name: "运动编程", exact: true }).click();
  await page.locator(".robot-chip").nth(1).click();
  // Capability-based navigation deliberately hides G1-only dynamics on Go2.
  await expect(
    page.getByRole("button", { name: "真实动力学", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "运动学程序", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".dynamics-panel")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "执行真实动力学", exact: true }),
  ).toHaveCount(0);
});

test("missing browser dynamics assets show guidance and recover on retry", async ({
  page,
}) => {
  await page.route("**/vendor/mujoco/profile.json", (route) =>
    route.abort("connectionrefused"),
  );
  await ready(page);
  await page.getByRole("button", { name: "运动编程", exact: true }).click();
  await page.getByRole("button", { name: "真实动力学", exact: true }).click();
  await expect(
    page.getByText("浏览器引擎加载失败", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "请检查网络、浏览器 WebAssembly 支持及静态资源是否完整，然后点检查引擎重试。无需启动 Python 或本地动力学服务。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "执行真实动力学", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/vendor/mujoco/profile.json");
  await page.getByRole("button", { name: "检查引擎", exact: true }).click();
  await expect(
    page.getByText("浏览器引擎已就绪", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "执行真实动力学", exact: true }),
  ).toBeEnabled();
});

test("browser dynamics zero torque produces identical trials without local service", async ({
  page,
}) => {
  const serviceRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).port === "8765") serviceRequests.push(r.url());
  });
  await ready(page);
  await page.getByRole("button", { name: "运动编程", exact: true }).click();
  await page.getByRole("button", { name: "真实动力学", exact: true }).click();
  await expect(
    page.getByText("浏览器引擎已就绪", { exact: true }),
  ).toBeVisible();
  await page.locator("#torque").fill("0");
  await page
    .getByRole("button", { name: "执行真实动力学", exact: true })
    .click();
  await expect(page.locator(".dynamics-panel .trace-panel pre")).toContainText(
    '"finalPositionDeltaRad": 0',
  );
  await expect(page.locator(".dynamics-panel .trace-panel pre")).toContainText(
    '"differentResult": false',
  );
  expect(serviceRequests).toEqual([]);
});
