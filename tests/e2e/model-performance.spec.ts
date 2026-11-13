import { test, expect } from "@playwright/test";
test("parsed mesh cache survives explicit reload without new mesh requests and keeps source bounds", async ({
  page,
}) => {
  let meshRequests = 0;
  page.on("request", (r) => {
    if (/\.(stl|dae|obj)(\.gz)?(?:\?|$)/i.test(r.url())) meshRequests++;
  });
  await page.goto("/?robot=g1&lang=zh");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-model-bounds",
    /meshCount/,
  );
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  const viewer = page.locator(".viewer"),
    before = JSON.parse((await viewer.getAttribute("data-mesh-cache"))!);
  const bounds = await viewer.getAttribute("data-model-bounds");
  const requests = meshRequests;
  await page.locator(".reload-model").click();
  await expect
    .poll(
      async () =>
        JSON.parse((await viewer.getAttribute("data-mesh-cache")) || "{}").hits,
    )
    .toBeGreaterThan(before.hits);
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  expect(meshRequests).toBe(requests);
  expect(await viewer.getAttribute("data-model-bounds")).toBe(bounds);
  const after = JSON.parse((await viewer.getAttribute("data-mesh-cache"))!);
  expect(after.bytes).toBeLessThanOrEqual(after.maxBytes);
});
test("missing compressed sidecars fall back to the source without hiding a real resource error", async ({
  page,
}) => {
  await page.route("**/*.gz", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/?robot=go2&lang=zh");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-model-bounds",
    /meshCount/,
  );
  await expect(page.locator(".viewer-status")).toHaveCount(0);
});

test("production sidecars decode when the static host does not set Content-Encoding", async ({
  page,
}) => {
  test.skip(
    !process.env.TEST_PRODUCTION,
    "Sidecars are generated only by the production build",
  );
  const { readFile } = await import("node:fs/promises");
  const { gzipSync } = await import("node:zlib");
  let compressed = 0,
    raw = 0;
  page.on("request", (r) => {
    if (/\.(stl|dae|obj)$/.test(r.url())) raw++;
  });
  await page.route("**/*.gz", async (route) => {
    const original = new URL(route.request().url()).pathname.replace(
      /\.gz$/,
      "",
    );
    const bytes = await readFile(`${process.cwd()}/public${original}`);
    compressed++;
    await route.fulfill({
      status: 200,
      contentType: "application/gzip",
      body: gzipSync(bytes),
    });
  });
  await page.goto("/?robot=g1&lang=zh");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-model-bounds",
    /meshCount/,
  );
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  expect(compressed).toBe(26);
  expect(raw).toBe(0);
});
