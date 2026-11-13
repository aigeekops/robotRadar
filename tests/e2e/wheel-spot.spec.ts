import { test, expect } from "@playwright/test";
for (const [id, count] of [
  ["go2w", 16],
  ["spot", 12],
] as const) {
  test(`${id} source visuals, original joints and provenance at static base`, async ({
    page,
  }) => {
    const failures: string[] = [];
    page.on("pageerror", (e) => failures.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes(`/robots/${id}/`))
        failures.push(`${r.status()} ${r.url()}`);
    });
    await page.goto(`?robot=${id}&mode=joints&view=iso`);
    await expect(page.locator(".joint-control")).toHaveCount(count);
    await expect(page.locator(".viewer-status")).toHaveCount(0);
    const bounds = JSON.parse(
      (await page.locator(".viewer").getAttribute("data-model-bounds")) || "{}",
    );
    expect(bounds.meshCount).toBeGreaterThan(0);
    expect(bounds.size.every((v: number) => Number.isFinite(v) && v > 0)).toBe(
      true,
    );
    const source = await page.request.get(`robots/${id}/provenance.json`);
    expect(source.ok()).toBeTruthy();
    const p = await source.json();
    expect(p.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(
      p.files.every(
        (f: any) => f.sha256 && f.license && f.licenseEvidence.length,
      ),
    ).toBe(true);
    const before = await page
      .locator(".viewer")
      .getAttribute("data-joint-state");
    const input = page.locator(".joint-control input").first();
    const min = Number(await input.getAttribute("min"));
    const max = Number(await input.getAttribute("max"));
    await input.fill(
      String(Math.round((min + (max - min) * 0.65) * 100) / 100),
    );
    await expect
      .poll(() => page.locator(".viewer").getAttribute("data-joint-state"))
      .not.toBe(before);
    await page.screenshot({ path: `qa/${id}-integrated-webgl.png` });
    if (process.env.GENERATE_MODEL_PREVIEWS === "1") {
      await page.screenshot({
        path: `public/previews/${id}.png`,
        clip: { x: 150, y: 120, width: 1000, height: 760 },
      });
    }
    expect(failures).toEqual([]);
  });
  test(`${id} actual drive and assembly source geometry loads`, async ({
    page,
  }) => {
    await page.goto(`?robot=${id}&experience=drive`);
    await expect(page.locator(".drive-scene[data-drive-state]")).toBeVisible();
    await expect(page.locator(".drive-overlay")).toHaveCount(0);
    await page.screenshot({ path: `qa/${id}-drive-webgl.png` });
    await page.goto(`?robot=${id}&experience=build`);
    await expect(page.locator(".assembly-experience")).toBeVisible();
    await expect(page.locator(".ae-loading")).toHaveCount(0);
    await expect(
      page.locator(".ae-canvas[data-source-mesh-count]"),
    ).toBeVisible();
    expect(
      Number(
        await page.locator(".ae-canvas").getAttribute("data-source-mesh-count"),
      ),
    ).toBeGreaterThan(0);
    await page.screenshot({ path: `qa/${id}-assembly-webgl.png` });
  });
}
