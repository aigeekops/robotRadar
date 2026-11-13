import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

type Project = {
  id: string;
  title: { zh: string; en: string };
  commit: string;
  parts: {
    name: string;
    quantity: number;
    downloads: { format: string; url: string }[];
  }[];
  hardware: { name: string; quantity: number | null }[];
  steps: { title: string }[];
  files: { file: string; sha256: string }[];
};
function auditedProject(id: string): Project {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../public/robots/maker-projects/${id}/project.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
}
const openbot = auditedProject("openbot-diy");
const duck = auditedProject("open-duck-mini");

async function expectProject(
  kit: Locator,
  project: Project,
  lang: "zh" | "en" = "zh",
) {
  await expect(
    kit.getByRole("heading", { name: project.title[lang], exact: true }),
  ).toBeVisible();
  await expect(kit.locator(".build-kit-rows article")).toHaveCount(
    project.parts.length,
  );
}
async function downloadOriginal(
  page: Page,
  kit: Locator,
  project: Project,
  part: string,
  format: string,
) {
  const row = kit
    .locator(".build-kit-rows article")
    .filter({ has: page.getByRole("heading", { name: part, exact: true }) });
  const expectedDownload = project.parts
    .find((r) => r.name === part)!
    .downloads.find((d) => d.format === format)!;
  const expectedFile = project.files.find((f) =>
    expectedDownload.url.endsWith("/" + f.file),
  )!;
  const next = page.waitForEvent("download");
  await row.getByRole("link", { name: `${format} ↓`, exact: true }).click();
  const download = await next;
  expect(download.suggestedFilename()).toBe(expectedFile.file);
  expect(new URL(download.url()).pathname).toMatch(
    new RegExp(
      expectedDownload.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
    ),
  );
  const file = await download.path();
  expect(file).toBeTruthy();
  const bytes = await readFile(file!);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    expectedFile.sha256,
  );
}

test("maker projects: bilingual top navigation, project switching and deep-link reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./?robot=g1&lang=zh");
  await page.getByRole("button", { name: "自制机器人", exact: true }).click();
  await expect(page).toHaveURL(/[?&]page=makers(?:&|$)/);
  const kit = page.locator(".maker-projects");
  await expectProject(kit, openbot);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Build your own", exact: true }),
  ).toBeVisible();
  await expectProject(kit, openbot, "en");
  await kit
    .getByRole("button", { name: "Open Duck Mini v2", exact: true })
    .click();
  await expectProject(kit, duck, "en");
  await expect(
    kit.getByText(/Partial materials, not a complete manufacturing guarantee/),
  ).toBeVisible();
  await kit.getByRole("button", { name: "OpenBot DIY", exact: true }).click();
  await expectProject(kit, openbot, "en");
  await page.reload();
  await expectProject(kit, openbot, "en");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expectProject(kit, openbot);
  expect(errors).toEqual([]);
});

test("OpenBot integrated making materials: original STL/STEP, CSV/JSON and print", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./?page=makers&lang=zh");
  const kit = page.locator(".maker-projects");
  await expectProject(kit, openbot);
  await downloadOriginal(page, kit, openbot, "body_bottom", "STL");
  await downloadOriginal(page, kit, openbot, "body_top", "STEP");
  for (const format of ["CSV", "JSON"]) {
    const next = page.waitForEvent("download");
    await kit
      .getByRole("button", { name: `BOM ${format} ↓`, exact: true })
      .click();
    const download = await next;
    expect(download.suggestedFilename()).toBe(
      `openbot-diy-materials.${format.toLowerCase()}`,
    );
    const text = await readFile((await download.path())!, "utf8");
    if (format === "JSON") {
      const exported = JSON.parse(text);
      expect(exported.commit).toBe(openbot.commit);
      expect(exported.parts).toEqual(openbot.parts);
      expect(
        exported.hardware.find(
          (r: { name: string }) => r.name === "Dupont cables",
        ).quantity,
      ).toBeNull();
    } else {
      expect(text).toContain("Arduino Nano");
      expect(text).toContain("L298N Motor Driver");
      expect(text).toContain('"UNKNOWN"');
    }
  }
  await kit.getByRole("button", { name: "采购资料", exact: true }).click();
  await expect(kit.getByText("数量：未知", { exact: true })).toBeVisible();
  await expect(
    kit.getByRole("heading", { name: "L298N Motor Driver", exact: true }),
  ).toBeVisible();
  await kit.getByRole("button", { name: "装配阅读", exact: true }).click();
  await expect(kit.locator(".build-kit-steps>li")).toHaveCount(
    openbot.steps.length,
  );
  await expect(
    kit.getByText(/以下是原文步骤阅读摘要，不是完整现场作业指导/),
  ).toBeVisible();
  await page.evaluate(() => {
    const open = window.open;
    window.open = ((...args: Parameters<typeof window.open>) => {
      const win = open(...args);
      if (win) win.print = () => {};
      return win;
    }) as typeof window.open;
  });
  const nextPopup = page.waitForEvent("popup");
  await kit.getByRole("button", { name: "打印制作资料", exact: true }).click();
  const popup = await nextPopup;
  await expect(popup.locator("tbody tr")).toHaveCount(
    openbot.parts.length + openbot.hardware.length,
  );
  await expect(popup.getByText(/UNKNOWN \/ 未知/)).toBeVisible();
  await expect(
    popup.locator("h1 + p").filter({ hasText: openbot.commit }),
  ).toBeVisible();
  await popup.close();
  expect(errors).toEqual([]);
});

test("Duck model manufacturing entry and maker projects stay usable at 390px", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./?robot=open-duck-mini&lang=zh");
  await page.getByRole("button", { name: "制造资料", exact: true }).click();
  await expect(page).toHaveURL(/[?&]mode=buildkit(?:&|$)/);
  const kit = page.locator(".maker-projects");
  await expectProject(kit, duck);
  // A model-pinned kit must not silently switch to a different project.
  await expect(
    kit.getByRole("group", { name: "制作项目选择", exact: true }),
  ).toHaveCount(0);
  expect(duck.parts.reduce((count, row) => count + row.quantity, 0)).toBe(51);
  await downloadOriginal(page, kit, duck, "foot_bottom_tpu.stl", "STL");
  await expect(kit.getByText(/官方装配指南 incomplete/)).toBeVisible();
  await page.reload();
  await expectProject(kit, duck);
  await page.setViewportSize({ width: 390, height: 844 });
  await kit.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bounds = await kit.boundingBox();
  expect(bounds).toBeTruthy();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.goto("./?page=makers&lang=zh");
  await expectProject(kit, openbot);
  await kit
    .getByRole("button", { name: "Open Duck Mini v2", exact: true })
    .click();
  await expectProject(kit, duck);
  await kit.getByRole("button", { name: "装配阅读", exact: true }).click();
  await expect(kit.locator(".build-kit-steps>li")).toHaveCount(
    duck.steps.length,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
