import { test, expect } from "@playwright/test";
for (const height of [900, 667])
  for (const robot of ["g1", "turtlebot3"]) {
    test(`drive controls reachable ${robot} 390x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height });
      await page.goto(`/?robot=${robot}&experience=drive&lang=zh`);
      const scene = page.getByTestId("drive-scene");
      await expect(scene).toHaveAttribute("data-drive-state", /.+/);
      const controls = page.locator(
        ".drive-controls button, .drive-camera-toggle",
      );
      const failures = await controls.evaluateAll((buttons) =>
        buttons.flatMap((b, i) => {
          const r = b.getBoundingClientRect(),
            hit = document.elementFromPoint(
              r.x + r.width / 2,
              r.y + r.height / 2,
            );
          const issues = [];
          if (!hit || !b.contains(hit)) issues.push(`blocked ${i}`);
          if (
            r.top < 0 ||
            r.bottom > innerHeight ||
            r.left < 0 ||
            r.right > innerWidth
          )
            issues.push(`outside ${i}`);
          for (const other of buttons.slice(i + 1)) {
            const q = other.getBoundingClientRect();
            if (
              r.left < q.right &&
              r.right > q.left &&
              r.top < q.bottom &&
              r.bottom > q.top
            )
              issues.push(`overlap ${i}`);
          }
          return issues;
        }),
      );
      expect(failures).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(390);
      const forward = page.getByRole("button", { name: "向前", exact: true });
      const box = (await forward.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      try {
        await expect
          .poll(
            async () =>
              JSON.parse((await scene.getAttribute("data-drive-state"))!)
                .distance,
          )
          .toBeGreaterThan(0.1);
      } finally {
        await page.mouse.up();
      }
      await page.screenshot({
        path: `qa/final-drive-visual/${robot}-390x${height}-fixed.png`,
      });
    });
  }
