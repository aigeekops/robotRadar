import { test, expect } from "@playwright/test";
test("external learning replaces the removed industry page while research robots stay distinct from 3D", async ({
  page,
}) => {
  await page.goto("/?page=catalog&lang=zh");
  await expect(
    page.getByRole("link", { name: "学习平台 ↗", exact: true }),
  ).toHaveAttribute("href", "https://aigeekops.github.io/learn-by-building/");
  await expect(
    page.getByRole("button", { name: "行业与岗位", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("industry-research")).toHaveCount(0);
  const research = page.locator(".catalog-research");
  await expect(
    research.getByRole("heading", { name: "Tesla Optimus · 行业研究" }),
  ).toBeVisible();
  await expect(
    research.getByRole("heading", { name: "Atlas · 电动产品版 · 行业研究" }),
  ).toBeVisible();
  const models = await (await page.request.get("/robots/manifest.json")).json();
  expect(
    models.some((r: { id: string }) =>
      ["tesla-optimus", "atlas-electric-2026"].includes(r.id),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Learning platform ↗", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

for (const width of [1440, 390]) {
  test(`learning link matches navigation baseline at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const lang of ["zh", "en"]) {
      await page.goto(`/?page=catalog&lang=${lang}`);
      const link = page.locator("nav .external-learning");
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute(
        "href",
        "https://aigeekops.github.io/learn-by-building/",
      );
      const delta = await link.evaluate((el) => {
        const textCenter = (node: Element) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const r = range.getBoundingClientRect();
          return r.top + r.height / 2;
        };
        const center = textCenter(el);
        const peers = [...el.parentElement!.querySelectorAll("button")].filter(
          (b) =>
            Math.abs(
              b.getBoundingClientRect().top - el.getBoundingClientRect().top,
            ) < 3,
        );
        return peers.length
          ? Math.max(...peers.map((b) => Math.abs(textCenter(b) - center)))
          : 0;
      });
      expect(delta).toBeLessThanOrEqual(2);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({ path: `qa/learning-link-${lang}-${width}.png` });
    }
  });
}
