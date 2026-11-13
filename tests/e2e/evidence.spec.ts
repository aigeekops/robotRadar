import { test, expect, type Page } from "@playwright/test";
import { robotLessons } from "../../src/robotLearning";
import { urdfReference } from "./helpers/urdfReference";

async function ready(page: Page, robot: string) {
  await page.goto(`/?robot=${robot}&mode=parts&lang=zh`);
  await expect(page.locator(".part-row").first()).toBeVisible();
  await expect(page.locator(".viewer-status")).toHaveCount(0);
}
async function selectLink(page: Page, name: string) {
  await page
    .locator(".part-row")
    .filter({ has: page.getByText(name, { exact: true }) })
    .locator("button")
    .first()
    .click();
  await expect(page.getByTestId("evidence-link-id")).toHaveText(name);
}

test("link evidence matches all actual XML links and joints across every catalog model", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await ready(page, "g1");
  const robots = await (await page.request.get("/robots/manifest.json")).json();
  for (const robot of robots) {
    await ready(page, robot.id);
    const reference = await urdfReference(page, robot.urdfUrl);
    for (const link of reference.links) {
      await selectLink(page, link.name);
      await expect(page.getByTestId("evidence-geometry")).toHaveText(
        `${link.visuals} / ${link.collisions}`,
      );
      await expect(page.getByTestId("evidence-mass")).toHaveText(
        link.mass === null ? "未知（源字段缺失或无效）" : String(link.mass),
      );
      await expect(page.getByTestId("evidence-com")).toHaveText(
        link.centerOfMass === null
          ? "未知（源字段缺失或无效）"
          : link.centerOfMass.join(", "),
      );
      const connected = reference.joints.filter(
        (joint) => joint.parent === link.name || joint.child === link.name,
      );
      await expect(page.getByTestId("evidence-joint")).toHaveCount(
        connected.length,
      );
      for (const joint of connected) {
        const row = page
          .getByTestId("evidence-joint")
          .filter({ has: page.getByText(joint.name, { exact: true }) });
        await expect(row.getByTestId("evidence-parent")).toHaveText(
          joint.parent!,
        );
        await expect(row.getByTestId("evidence-child")).toHaveText(
          joint.child!,
        );
        await expect(row).toContainText(`· ${joint.type}`);
        const axis =
          joint.type === "fixed"
            ? "不适用"
            : (joint.axis?.join(", ") ?? "未知（源字段缺失或无效）");
        await expect(row.locator("p").nth(1)).toHaveText(
          `轴（关节局部坐标）: ${axis}`,
        );
        const value = (number: number | null) =>
          number === null ? "未知（源字段缺失或无效）" : String(number);
        const limits =
          joint.type === "fixed"
            ? "不适用"
            : joint.type === "continuous"
              ? "连续旋转，无位置上下界"
              : `${value(joint.lower)} … ${value(joint.upper)} ${joint.type === "prismatic" ? "m" : "rad"}`;
        await expect(row.locator("p").nth(2)).toHaveText(`位置限位: ${limits}`);
      }
    }
    const example = reference.links.find(
      (link) =>
        link.visuals > 0 &&
        reference.joints.some(
          (joint) => joint.child === link.name && joint.type !== "fixed",
        ),
    )!;
    await selectLink(page, example.name);
    await expect(page.getByTestId("evidence-disclaimer")).toContainText(
      "不是实测整机质量",
    );
    const panel = page.getByTestId("part-evidence-panel");
    await expect(
      panel.getByRole("link", { name: "当前原始 URDF", exact: true }),
    ).toHaveAttribute("href", robot.urdfUrl);
    await expect(
      panel.getByRole("link", { name: "固定版本官方源文件", exact: true }),
    ).toHaveAttribute("href", new RegExp(robot.sourceCommit));
    await page.getByTestId("evidence-mass").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `qa/evidence-${robot.id}.png`,
      fullPage: true,
    });
    await panel.locator(".evidence-sources").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `qa/evidence-sources-${robot.id}.png`,
      fullPage: true,
    });
  }
});

test("link evidence parent-child navigation and related lessons remain model-specific", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await ready(page, "g1");
  const robots = await (await page.request.get("/robots/manifest.json")).json();
  for (const robot of robots) {
    await ready(page, robot.id);
    const reference = await urdfReference(page, robot.urdfUrl);
    const joint = reference.joints.find((joint) => joint.type !== "fixed")!;
    await selectLink(page, joint.child!);
    await page
      .getByTestId("evidence-joint")
      .filter({ has: page.getByText(joint.name, { exact: true }) })
      .getByTestId("evidence-parent")
      .click();
    await expect(page.getByTestId("evidence-link-id")).toHaveText(
      joint.parent!,
    );
    await page
      .getByTestId("evidence-joint")
      .filter({ has: page.getByText(joint.name, { exact: true }) })
      .getByTestId("evidence-child")
      .click();
    await expect(page.getByTestId("evidence-link-id")).toHaveText(joint.child!);
    const lesson = robotLessons.find((lesson) => lesson.robotId === robot.id);
    if (!lesson) {
      // The current teaching catalog, not a historical model whitelist, defines availability.
      const modelLessons = robotLessons.filter(
        (entry) => entry.robotId === robot.id,
      );
      expect(modelLessons).toHaveLength(0);
      await expect(page.getByTestId("evidence-lesson")).toHaveCount(0);
      continue;
    }
    await selectLink(page, lesson.partIds[0]);
    await page
      .getByTestId("evidence-lesson")
      .filter({ hasText: lesson.title.zh })
      .click();
    await expect(
      page.locator(".mechanism-panel .lesson-article h3"),
    ).toHaveText(lesson.title.zh);
    await expect(page).toHaveURL(new RegExp(`lesson=${lesson.id}`));
  }
});

test("link evidence treats missing and invalid values as unknown and recovers from fetch failure", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page, "panda");
  await selectLink(page, "panda_link0");
  await expect(page.getByTestId("evidence-mass")).toContainText("未知");
  await expect(page.getByTestId("evidence-com")).toContainText("未知");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByTestId("evidence-mass")).toContainText("Unknown");
  await expect(page.getByTestId("evidence-disclaimer")).toContainText(
    "not measured whole-robot mass",
  );
  await ready(page, "g1");
  const original = await (
    await page.request.get("/robots/g1/robot.urdf")
  ).text();
  const name = await page.locator(".part-row strong").first().innerText();
  await page.route("**/robots/g1/robot.urdf", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await selectLink(page, name);
  await expect(page.getByTestId("evidence-error")).toContainText(
    "未以零值替代",
  );
  await expect(page.getByTestId("evidence-mass")).toHaveCount(0);
  await page.unroute("**/robots/g1/robot.urdf");
  await ready(page, "g1");
  await page.route("**/robots/g1/robot.urdf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/xml",
      body: original.replace(
        /<mass value="[^"]+"/,
        '<mass value="not-a-number"',
      ),
    }),
  );
  await selectLink(page, name);
  await expect(page.getByTestId("evidence-mass")).toContainText("未知");
  await page.unroute("**/robots/g1/robot.urdf");
  await ready(page, "g1");
  await selectLink(page, name);
  await expect(page.getByTestId("evidence-mass")).not.toContainText("未知");
  expect(errors).toEqual([]);
});

test("evidence navigation leaves no stale highlight after ordinary selection or clearing", async ({
  page,
}) => {
  await ready(page, "g1");
  const canvas = page.locator(".viewer canvas");
  const snapshot = async () => {
    await page.getByRole("button", { name: "立体", exact: true }).click();
    // Camera transitions last 420 ms; wait for the actual settled state.
    await expect(page.locator(".viewer")).toHaveAttribute(
      "data-camera-transition",
      "false",
    );
    // Locator screenshots include overlapping HTML panels. Isolate the rendered scene
    // without changing layout, so panel scroll/text is not mistaken for a mesh highlight.
    return canvas.screenshot({
      style:
        "body * { visibility: hidden !important; } .viewer canvas { visibility: visible !important; }",
    });
  };
  const neutral = await snapshot();
  await selectLink(page, "left_hip_roll_link");
  const selected = await snapshot();
  expect(selected.equals(neutral)).toBe(false);
  await selectLink(page, "left_hip_pitch_link");
  await page
    .getByTestId("evidence-parent")
    .filter({ hasText: /^pelvis$/ })
    .click();
  await expect(page.getByTestId("evidence-link-id")).toHaveText("pelvis");
  // Exercise a real multi-link highlight before ordinary selection clears it.
  await page.getByRole("button", { name: "高亮分支", exact: true }).click();
  await selectLink(page, "left_hip_roll_link");
  expect((await snapshot()).equals(selected)).toBe(true);
  await page.getByRole("button", { name: "高亮分支", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  expect((await snapshot()).equals(neutral)).toBe(true);
  await expect(page.getByTestId("part-evidence-panel")).toHaveCount(0);
});
