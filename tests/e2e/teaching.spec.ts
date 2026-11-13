import { test, expect, type Page } from "@playwright/test";
import { robotLessons, chainExercises } from "../../src/robotLearning";
import { physicalReadingModules } from "../../src/physicalAssembly";

async function ready(page: Page, query = "?robot=g1") {
  await page.goto("/" + query);
  await expect(page.locator(".viewer canvas")).toBeVisible();
  await expect
    .poll(async () => {
      const raw = await page
        .locator(".viewer")
        .getAttribute("data-model-bounds");
      return raw ? JSON.parse(raw).meshCount : 0;
    })
    .toBeGreaterThan(0);
  await expect(page.locator(".viewer-status")).toHaveCount(0);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("all evidence-linked mechanism lessons focus real models and isolate/restore", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const robotId of [
    ...new Set(robotLessons.map((lesson) => lesson.robotId)),
  ]) {
    await ready(page, `?robot=${robotId}`);
    await page.getByRole("button", { name: "机构课程", exact: true }).click();
    const entries = robotLessons.filter((lesson) => lesson.robotId === robotId);
    await expect(
      page.locator(".mechanism-panel .lesson-picker button"),
    ).toHaveCount(entries.length);
    for (const lesson of entries) {
      await page
        .locator(".mechanism-panel .lesson-picker")
        .getByRole("button", { name: new RegExp(lesson.title.zh) })
        .click();
      await expect(
        page.locator(".mechanism-panel .lesson-article h3"),
      ).toHaveText(lesson.title.zh);
      await expect(
        page.locator(".mechanism-panel .part-tags code"),
      ).toHaveCount(lesson.jointIds.length);
      await expect(
        page.locator(".mechanism-panel .lesson-article > a"),
      ).toHaveAttribute("href", lesson.sourceUrl);
      await page
        .getByRole("button", { name: "聚焦运动链", exact: true })
        .click();
      await page.waitForTimeout(200);
    }
    const whole = await page.locator(".viewer canvas").screenshot();
    await page
      .getByRole("button", { name: "仅看本课部件", exact: true })
      .click();
    await page.waitForTimeout(300);
    const isolated = await page.locator(".viewer canvas").screenshot();
    expect(isolated.equals(whole)).toBe(false);
    await page.screenshot({
      path: `qa/mechanism-${robotId}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "恢复整机背景", exact: true })
      .click();
    await page.getByRole("button", { name: "完成本课", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "本课已完成", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "结构探索", exact: true }).click();
    await expect(page.locator(".part-row")).not.toHaveCount(0);
    await expect(
      page.locator(".visibility-button .lucide-eye-off"),
    ).toHaveCount(0);
    await noOverflow(page);
  }
  expect(errors).toEqual([]);
});

test("teaching entry restores previous selected, hidden and exploded observation state", async ({
  page,
}) => {
  await ready(page);
  const row = page.locator(".part-row").first();
  const name = await row.locator("strong").innerText();
  await row.locator("button").first().click();
  await row.locator(".visibility-button").click();
  await page.locator("#explode").fill("0.4");
  await page.getByRole("button", { name: "机构课程", exact: true }).click();
  await page.getByRole("button", { name: "仅看本课部件", exact: true }).click();
  await page.getByRole("button", { name: "结构探索", exact: true }).click();
  await expect(page.locator(".selection-card > div > strong")).toHaveText(name);
  await expect(page.locator("#explode")).toHaveValue("0.4");
  await expect(
    page.locator(".part-row").first().locator(".lucide-eye-off"),
  ).toHaveCount(1);
});

test("chain builder rejects wrong order, completes all source-backed chains, persists and undoes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const exercise of chainExercises) {
    await ready(page, `?robot=${exercise.robotId}`);
    await page.getByRole("button", { name: "运动链重建", exact: true }).click();
    await expect(page.locator(".chain-panel .chain-steps button")).toHaveCount(
      exercise.steps.length,
    );
    await page.locator(".chain-steps button").last().click();
    await page.getByRole("button", { name: "连接这一步", exact: true }).click();
    await expect(page.locator(".chain-feedback")).toContainText("上游依赖");
    await expect(page.locator(".chain-panel .progress-label b")).toHaveText(
      `0 / ${exercise.steps.length}`,
    );
    for (let i = 0; i < exercise.steps.length; i++) {
      await page.locator(".chain-steps button").nth(i).click();
      await page
        .getByRole("button", { name: "连接这一步", exact: true })
        .click();
      await expect(page.locator(".chain-panel .progress-label b")).toHaveText(
        `${i + 1} / ${exercise.steps.length}`,
      );
    }
    await expect(page.locator(".chain-success")).toBeVisible();
    await page.screenshot({
      path: `qa/chain-${exercise.robotId}.png`,
      fullPage: true,
    });
    await page.reload();
    await expect(page.locator(".chain-success")).toBeVisible();
    await page.getByTitle("撤销上一步", { exact: true }).click();
    await expect(page.locator(".chain-panel .progress-label b")).toHaveText(
      `${exercise.steps.length - 1} / ${exercise.steps.length}`,
    );
    await expect(page.locator(".chain-success")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("chain automatic demonstration pauses, resumes and cleans up when leaving", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "运动链重建", exact: true }).click();
  await page.getByRole("button", { name: "自动演示", exact: true }).click();
  await expect(page.locator(".chain-panel .progress-label b")).toHaveText(
    "1 / 5",
  );
  await page.getByRole("button", { name: "暂停演示", exact: true }).click();
  await page.waitForTimeout(1800);
  await expect(page.locator(".chain-panel .progress-label b")).toHaveText(
    "1 / 5",
  );
  await page.getByRole("button", { name: "自动演示", exact: true }).click();
  await expect(page.locator(".chain-panel .progress-label b")).toHaveText(
    "2 / 5",
  );
  await page.getByRole("button", { name: "结构探索", exact: true }).click();
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: "运动链重建", exact: true }).click();
  await expect(page.locator(".chain-panel .progress-label b")).toHaveText(
    "2 / 5",
  );
  await page.getByTitle("重新开始", { exact: true }).click();
  await expect(page.locator(".chain-panel .progress-label b")).toHaveText(
    "0 / 5",
  );
});

test("deep links, reload and browser history restore robot language mode part lesson and view", async ({
  page,
}) => {
  await ready(
    page,
    "?robot=g1&lang=en&page=lab&mode=parts&part=pelvis&lesson=&view=side",
  );
  await expect(
    page.getByRole("button", { name: "Structure", exact: true }),
  ).toHaveClass(/active/);
  await expect(page.locator(".selection-card > div > strong")).toHaveText(
    "pelvis",
  );
  await expect(page.locator(".view-controls button.active")).toHaveText("Side");
  const link = page.url();
  await page.reload();
  await expect(page.locator(".selection-card > div > strong")).toHaveText(
    "pelvis",
  );
  await expect(page.locator(".view-controls button.active")).toHaveText("Side");
  await page
    .getByRole("button", { name: "Robot library", exact: true })
    .click();
  await expect(page.locator(".catalog-grid")).toBeVisible();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.locator("table")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".catalog-grid")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".workspace")).toBeVisible();
  await expect(page.locator(".selection-card > div > strong")).toHaveText(
    "pelvis",
  );
  await page.goForward();
  await expect(page.locator(".catalog-grid")).toBeVisible();
  const lesson = robotLessons.find((l) => l.robotId === "ur5e")!;
  await ready(
    page,
    `?robot=ur5e&lang=en&page=lab&mode=systems&part=&lesson=${lesson.id}&view=iso`,
  );
  await expect(page.locator(".mechanism-panel .lesson-article h3")).toHaveText(
    lesson.title.en,
  );
  await expect(page.locator(".view-controls button.active")).toHaveText("Iso");
  await page.reload();
  await expect(page.locator(".mechanism-panel .lesson-article h3")).toHaveText(
    lesson.title.en,
  );
  expect(new URL(page.url()).searchParams.get("lesson")).toBe(lesson.id);
  expect(link).toContain("part=pelvis");
});

test("long license and support notices remain readable in both languages at minimum desktop width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const robots = await (await page.request.get("/robots/manifest.json")).json();
  for (const { id: robot } of robots) {
    await ready(page, `?robot=${robot}&mode=sources&lang=zh`);
    await expect(page.locator(".evidence-card.warning p")).not.toBeEmpty();
    for (const link of await page
      .locator('.evidence-card a[href^="/robots/"]')
      .all()) {
      const href = await link.getAttribute("href");
      const response = await page.request.get(href!);
      expect(response.ok(), href!).toBe(true);
      expect(response.headers()["content-type"], href!).not.toContain(
        "text/html",
      );
      expect((await response.text()).trim().length, href!).toBeGreaterThan(20);
    }
    await noOverflow(page);
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator(".evidence-card.warning p")).not.toBeEmpty();
    await noOverflow(page);
  }
  await page.screenshot({ path: "qa/license-notices-en.png", fullPage: true });
});

test("Panda and FR3 mimic fingers follow the driving joint without an independent slider", async ({
  page,
}) => {
  for (const robotId of ["panda", "fr3"]) {
    await ready(page, `?robot=${robotId}`);
    await page.getByRole("button", { name: "关节实验", exact: true }).click();
    await expect(page.locator(".joint-control")).toHaveCount(8);
    await expect(
      page.locator(`input[id="${robotId}_finger_joint2"]`),
    ).toHaveCount(0);
    await page.locator(`input[id="${robotId}_finger_joint1"]`).fill("0.02");
    const readJoint = async (name: string) => {
      const raw = await page
        .locator(".viewer")
        .getAttribute("data-joint-state");
      return raw ? JSON.parse(raw)[name] : null;
    };
    await expect.poll(() => readJoint(`${robotId}_finger_joint1`)).toBe(0.02);
    await expect.poll(() => readJoint(`${robotId}_finger_joint2`)).toBe(0.02);
    await page
      .getByRole("button", { name: "关节复位（限位内）", exact: true })
      .click();
    await expect.poll(() => readJoint(`${robotId}_finger_joint1`)).toBe(0);
    await expect.poll(() => readJoint(`${robotId}_finger_joint2`)).toBe(0);
  }
});

test("SO101 follower exposes six real rotary joints and changes rendered pose", async ({
  page,
}) => {
  await ready(page, "?robot=so101&mode=joints");
  await expect(page.locator(".joint-control")).toHaveCount(6);
  const before = await page.locator(".viewer canvas").screenshot();
  for (const control of await page.locator(".joint-control input").all()) {
    const name = await control.getAttribute("id");
    const lower = Number(await control.getAttribute("min"));
    const upper = Number(await control.getAttribute("max"));
    const target = Math.round((lower + (upper - lower) * 0.6) * 100) / 100;
    await control.fill(String(target));
    // Native range inputs align values to min + n * step.
    const applied = Number(await control.inputValue());
    expect(Math.abs(applied - target)).toBeLessThanOrEqual(0.01);
    await expect
      .poll(async () => {
        const raw = await page
          .locator(".viewer")
          .getAttribute("data-joint-state");
        return raw ? JSON.parse(raw)[name!] : null;
      })
      .toBeCloseTo(applied, 5);
  }
  await page.waitForTimeout(150);
  expect(
    (await page.locator(".viewer canvas").screenshot()).equals(before),
  ).toBe(false);
  await page.screenshot({ path: "qa/so101-joints.png", fullPage: true });
  await noOverflow(page);
});

test("official assembly reading records understanding, not physical completion, and persists safely", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page, "?robot=so101&mode=assembly");
  await page.getByRole("button", { name: "官方装配阅读", exact: true }).click();
  const panel = page.getByTestId("physical-assembly-panel");
  await expect(page.getByTestId("physical-learning-disclaimer")).toContainText(
    "不代表已经装配实物",
  );
  await page.getByTestId("physical-module-1").click();
  await expect(page.getByTestId("physical-mark-read")).toBeDisabled();
  await expect(page.getByTestId("physical-prerequisite")).toBeVisible();
  for (const [index, module] of physicalReadingModules.entries()) {
    await page.getByTestId(`physical-module-${index}`).click();
    await expect(panel.locator(".lesson-article h3")).toHaveText(
      module.title.zh,
    );
    await expect(panel.locator(".lesson-article > a").first()).toHaveAttribute(
      "href",
      module.sourceUrl,
    );
    await expect(page.getByTestId("physical-answer-0")).toBeDisabled();
    await page.getByTestId("physical-mark-read").click();
    if (index === 0) {
      await page
        .getByTestId(
          `physical-answer-${(module.question.answer + 1) % module.question.options.length}`,
        )
        .click();
      await expect(panel.locator(".answer-explanation")).toContainText(
        "再核对一次原文",
      );
      await page.getByTestId("physical-module-1").click();
      await expect(page.getByTestId("physical-mark-read")).toBeDisabled();
      await page.getByTestId("physical-module-0").click();
    }
    await page.getByTestId(`physical-answer-${module.question.answer}`).click();
    await expect(page.getByTestId("physical-progress")).toHaveText(
      `${index + 1} / ${index + 1} · ${physicalReadingModules.length}`,
    );
    await panel
      .getByRole("button", { name: "观察相关装配体", exact: true })
      .click();
    await expect(page.locator(".viewer canvas")).toBeVisible();
  }
  await expect(page.getByTestId("physical-all-understood")).toContainText(
    "实体装配、校准与安全状态仍未验证",
  );
  await page.screenshot({
    path: "qa/so101-official-reading-zh.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "官方装配阅读", exact: true }).click();
  await expect(page.getByTestId("physical-all-understood")).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByTestId("physical-learning-disclaimer")).toContainText(
    "not physical assembly",
  );
  await expect(page.getByTestId("physical-all-understood")).toContainText(
    "remain unverified",
  );
  await page.screenshot({
    path: "qa/so101-official-reading-en.png",
    fullPage: true,
  });
  await noOverflow(page);
  await page.getByTestId("physical-module-0").click();
  await page
    .getByTestId(
      `physical-answer-${(physicalReadingModules[0].question.answer + 1) % physicalReadingModules[0].question.options.length}`,
    )
    .click();
  await expect(page.getByTestId("physical-progress")).toHaveText(
    `1 / 0 · ${physicalReadingModules.length}`,
  );
  await expect(page.getByTestId("physical-all-understood")).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Reset reading progress", exact: true })
    .click();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByTestId("physical-progress")).toHaveText(
    `1 / 0 · ${physicalReadingModules.length}`,
  );
  await panel
    .getByRole("button", { name: "Reset reading progress", exact: true })
    .click();
  await page.getByTestId("physical-confirm-reset").click();
  await expect(page.getByTestId("physical-progress")).toHaveText(
    `0 / 0 · ${physicalReadingModules.length}`,
  );
  expect(errors).toEqual([]);
});
