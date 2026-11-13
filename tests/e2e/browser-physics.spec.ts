import { test, expect } from "@playwright/test";

test("static browser MuJoCo reproduces Python reference and rejects invalid requests", async ({
  page,
}) => {
  await page.route("**/__physics_test__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Physics test</body></html>",
    }),
  );
  await page.goto("/__physics_test__");
  const result = await page.evaluate(async () => {
    const worker = new Worker(
      new URL("vendor/mujoco/g1-worker.js", new URL("./", location.href)),
      { type: "module" },
    );
    let id = 0;
    const request = (action: string, payload = {}) =>
      new Promise<any>((resolve, reject) => {
        const n = ++id;
        worker.onmessage = ({ data }) => {
          if (data.id === n)
            data.error ? reject(new Error(data.error)) : resolve(data.result);
        };
        worker.onerror = reject;
        worker.postMessage({
          id: n,
          action,
          payload,
          base: new URL("./", location.href).href,
        });
      });
    try {
      const profile = await request("profile");
      const r = await request("simulate", {
        joint: "left_elbow_joint",
        torque: 0.2,
        duration: 0.2,
      });
      const zero = await request("simulate", { torque: 0 });
      let rejected = false;
      try {
        await request("simulate", { torque: 99 });
      } catch {
        rejected = true;
      }
      return {
        version: profile.engineVersion,
        delta: r.comparison.finalPositionDeltaRad,
        zero: zero.comparison.finalPositionDeltaRad,
        steps: r.controlled.steps,
        finite: r.controlled.finite,
        warnings: r.controlled.warnings,
        same: r.comparison.sameInitialState,
        rejected,
      };
    } finally {
      worker.terminate();
    }
  });
  expect(result.version).toBe("3.5.1");
  expect(result.delta).toBeCloseTo(0.3578402740911404, 10);
  expect(result.zero).toBe(0);
  expect(result.steps).toBe(200);
  expect(result.finite && result.same && result.rejected).toBe(true);
  expect(result.warnings).toEqual([]);
});
