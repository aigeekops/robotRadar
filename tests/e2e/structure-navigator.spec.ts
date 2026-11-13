import { test, expect, type Page } from "@playwright/test";
import { parsePartEvidence } from "../../src/core/partEvidence";
import { buildStructureTree } from "../../src/core/structureTree";
async function ready(page: Page, id = "g1") {
  await page.goto(`/?robot=${id}&mode=parts&lang=zh`);
  await expect(page.getByTestId("structure-navigator")).toBeVisible();
  await expect(page.getByTestId("structure-link-count")).toHaveText(/\d+/);
  await expect(page.locator(".viewer-status")).toHaveCount(0);
}
async function choose(page: Page, id: string) {
  await page.getByRole("button", { name: "展开全部", exact: true }).click();
  await page
    .getByRole("button", { name: `选择源连杆 ${id}`, exact: true })
    .click();
  await expect(page.getByTestId("structure-selected-id")).toHaveText(id);
}
test("G1 and Go2 source trees drive exact real branch isolation, focus, evidence and restoration", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const [id, branch] of [
    ["g1", "left_hip_pitch_link"],
    ["go2", "FL_hip"],
  ]) {
    await ready(page, id);
    const evidence = parsePartEvidence(
        await (await page.request.get(`/robots/${id}/robot.urdf`)).text(),
      ),
      tree = buildStructureTree(evidence),
      node = tree.nodes[branch];
    await expect(page.getByTestId("structure-link-count")).toHaveText(
      String(tree.linkCount),
    );
    await expect(page.getByTestId("structure-visual-count")).toHaveText(
      String(tree.visualCount),
    );
    await choose(page, branch);
    await expect(page.getByTestId("evidence-link-id")).toHaveText(branch);
    const whole = await page.locator(".viewer canvas").screenshot();
    await page.getByRole("button", { name: "高亮分支", exact: true }).click();
    await page.waitForTimeout(450);
    expect(
      (await page.locator(".viewer canvas").screenshot()).equals(whole),
    ).toBe(false);
    await page.getByRole("button", { name: "独显分支", exact: true }).click();
    await expect(page.getByTestId("structure-visible-count")).toHaveText(
      String(node.visualCount),
    );
    await expect(
      page.locator(".visibility-button .lucide-eye-off"),
    ).toHaveCount(tree.linkCount - node.descendantIds.length);
    await page.getByRole("button", { name: "聚焦分支", exact: true }).click();
    await expect(page.locator(".viewer")).toHaveAttribute(
      "data-camera-transition",
      "false",
    );
    await page.screenshot({
      path: `qa/workbench-tree-${id}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "恢复全机", exact: true }).click();
    await expect(page.getByTestId("structure-visible-count")).toHaveText(
      String(tree.visualCount),
    );
    await expect(
      page.locator(".visibility-button .lucide-eye-off"),
    ).toHaveCount(0);
  }
});
test("source search retains ancestors and reference-only nodes never fabricate geometry; related course returns to observation", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("textbox", { name: "搜索源部件或关节", exact: true })
    .fill("left_knee_joint");
  await expect(page.getByTestId("structure-node")).toHaveCount(5);
  await page
    .getByRole("button", { name: "选择源连杆 left_knee_link", exact: true })
    .click();
  await expect(page.getByTestId("evidence-link-id")).toHaveText(
    "left_knee_link",
  );
  await page
    .getByRole("textbox", { name: "搜索源部件或关节", exact: true })
    .fill("imu_in_torso");
  await page
    .getByRole("button", { name: "选择源连杆 imu_in_torso", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "聚焦分支", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".sn-reference-note")).toContainText(
    "没有可显示的 visual",
  );
  await page.getByRole("button", { name: "清除结构搜索", exact: true }).click();
  await choose(page, "left_hip_pitch_link");
  await page.getByRole("button", { name: "独显分支", exact: true }).click();
  await page
    .locator(".sn-lessons")
    .getByRole("button", { name: "G1 · 双腿不是同一条链", exact: true })
    .click();
  await expect(page.locator(".mechanism-panel .lesson-article h3")).toHaveText(
    "G1 · 双腿不是同一条链",
  );
  await page.getByRole("button", { name: "结构探索", exact: true }).click();
  await expect(page.getByTestId("structure-selected-id")).toHaveText(
    "left_hip_pitch_link",
  );
  await expect(page.getByTestId("structure-visible-count")).toHaveText("6");
});
test("exploration to assembly and back preserves selected branch, hidden links, separation and joint pose", async ({
  page,
}) => {
  test.setTimeout(120000);
  await ready(page);
  await page.getByRole("button", { name: "关节实验", exact: true }).click();
  await page.locator("#left_hip_pitch_joint").fill("0.2");
  const initialJointValue = Number(
    await page.locator("#left_hip_pitch_joint").inputValue(),
  );
  await page.getByRole("button", { name: "结构探索", exact: true }).click();
  await choose(page, "left_hip_pitch_link");
  await page.getByRole("button", { name: "独显分支", exact: true }).click();
  await page.locator("#explode").fill("0.35");
  await page.getByRole("button", { name: "正面", exact: true }).click();
  for (let round = 0; round < 2; round++) {
    await page
      .getByRole("button", { name: "带着当前观察进入装配", exact: true })
      .click();
    await expect(page.getByTestId("assembly-learning-context")).toContainText(
      "left_hip_pitch_link",
    );
    await expect(page.getByTestId("assembly-part-0")).toBeVisible();
    await page
      .getByRole("button", { name: "返回探索工作台", exact: true })
      .click();
    await expect(page.getByTestId("structure-selected-id")).toHaveText(
      "left_hip_pitch_link",
    );
    await expect(page.locator(".viewer-status")).toHaveCount(0);
    await expect(page.getByTestId("structure-visible-count")).toHaveText("6");
    await expect(
      page.locator(".visibility-button .lucide-eye-off"),
    ).toHaveCount(24);
    await expect(page.locator("#explode")).toHaveValue("0.35");
    await expect
      .poll(
        async () =>
          JSON.parse(
            (await page.locator(".viewer").getAttribute("data-joint-state")) ||
              "{}",
          ).left_hip_pitch_joint,
      )
      .toBeCloseTo(initialJointValue, 6);
    await expect(page.locator(".view-controls .active")).toHaveText("正面");
  }
  await page.screenshot({
    path: "qa/workbench-return-from-assembly.png",
    fullPage: true,
  });
});
test("source tree keyboard navigation and repeated model changes retain current source identity", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("treeitem").first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("structure-selected-id")).toHaveText(
    "left_hip_pitch_link",
  );
  await page.keyboard.press("Home");
  await expect(page.getByTestId("structure-selected-id")).toHaveText("pelvis");
  const chips = page.locator(".robot-strip .robot-chip");
  for (let i = 0; i < 6; i++) await chips.nth(i % 2 ? 1 : 0).click();
  await expect(page.getByTestId("structure-link-count")).toHaveText("42");
  await expect(page.getByTestId("structure-selected-id")).toHaveText("base");
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await choose(page, "FL_hip");
  await expect(page.getByTestId("evidence-link-id")).toHaveText("FL_hip");
  await expect(page.getByTestId("structure-selection")).not.toContainText(
    "left_hip_pitch_link",
  );
});
