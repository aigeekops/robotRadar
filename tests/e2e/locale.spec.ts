import { test, expect } from "@playwright/test";
const KEY = "robot-radar:language:v1";
for (const [locale, language] of [
  ["zh-CN", "zh"],
  ["zh-TW", "zh"],
  ["en-US", "en"],
  ["fr-FR", "en"],
] as const) {
  test.describe(`first visit ${locale}`, () => {
    test.use({ locale });
    test("uses browser first preference without saving a manual choice", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.locator(".language")).toHaveText(
        language === "zh" ? "EN" : "中文",
      );
      expect(
        await page.evaluate((key) => localStorage.getItem(key), KEY),
      ).toBeNull();
    });
  });
}
test.describe("English browser preference and navigation", () => {
  test.use({ locale: "en-US" });
  test("manual choice survives reopening homepage and overrides browser", async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto("/");
    await page.locator(".language").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY),
    ).toEqual({ version: 1, source: "manual", lang: "zh" });
    const reopened = await context.newPage();
    await reopened.goto(baseURL! + "/");
    await expect(reopened.locator("html")).toHaveAttribute("lang", "zh");
    await reopened.close();
  });
  test("URL language overrides manual choice without changing it", async ({
    page,
  }) => {
    await page.addInitScript(
      (key) =>
        localStorage.setItem(
          key,
          JSON.stringify({ version: 1, source: "manual", lang: "zh" }),
        ),
      KEY,
    );
    await page.goto("/?lang=en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).lang,
        KEY,
      ),
    ).toBe("zh");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  });
  test("URL without stored manual preference does not create one", async ({
    page,
  }) => {
    await page.goto("/?lang=zh");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    expect(
      await page.evaluate((key) => localStorage.getItem(key), KEY),
    ).toBeNull();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
  test("corrupt storage and ambiguous legacy language do not override browser", async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, "{");
      localStorage.setItem(
        "robot-radar-v1",
        JSON.stringify({ lang: "zh", completed: [] }),
      );
    }, KEY);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.locator(".language").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).source,
        KEY,
      ),
    ).toBe("manual");
  });
  test("denied storage leaves default and manual in-session selection usable", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException("denied", "SecurityError");
      };
      Storage.prototype.setItem = () => {
        throw new DOMException("denied", "SecurityError");
      };
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.locator(".language").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    expect(errors).toEqual([]);
  });
  test("English primary modes, comparison and SO101 build kit expose translated controls", async ({
    page,
  }) => {
    await page.goto("/?robot=g1&mode=parts");
    await expect(
      page.getByRole("button", { name: "Structure", exact: true }),
    ).toBeVisible();
    for (const name of [
      "Joints",
      "Mechanisms",
      "Chain builder",
      "Lessons",
      "Quiz",
    ]) {
      const button = page.getByRole("button", { name, exact: true });
      await button.click();
      await expect(button).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    }
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(
      page.getByLabel("Compare model A", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Total links", { exact: true })).toBeVisible();
    await page.goto("/?robot=so101&mode=buildkit");
    await expect(
      page.getByRole("heading", {
        name: "From model to workbench",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Print BOM", exact: true }),
    ).toBeVisible();
  });
  test("English assembly, drive and actual WASM controls remain English", async ({
    page,
  }) => {
    await page.goto("/?robot=g1&experience=build");
    await expect(
      page.getByRole("button", { name: "Exit assembly", exact: true }),
    ).toBeVisible();
    await page.goto("/?robot=g1&experience=drive");
    await expect(
      page.getByRole("button", { name: "Exit course", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reset course", exact: true }),
    ).toBeVisible();
    await page.goto("/?robot=g1&mode=program");
    await page
      .getByRole("button", { name: "Real dynamics", exact: true })
      .click();
    await expect(
      page.getByText("Browser engine ready", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Run real dynamics", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Replay computed trajectory",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.locator(".dynamics-panel .trace-panel pre"),
    ).toContainText("finalPositionDeltaRad");
  });
});
