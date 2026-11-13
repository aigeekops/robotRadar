import { test, expect } from "@playwright/test";
import { armEndpoints, reachPose } from "../../src/core/armReach";
for (const [id, endpoint] of Object.entries(armEndpoints)) {
  test(`${id}: source FK positioning requires user input and supports retry`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const assets: { url: string; status: number }[] = [];
    page.on("response", (response) => {
      if (/\.(dae|stl|obj|png|jpg)(\.gz)?(\?|$)/i.test(response.url()))
        assets.push({ url: response.url(), status: response.status() });
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?robot=${id}&experience=reach&lang=en`);
    const root = page.locator(".arm-reach");
    await expect(root.locator("code")).toHaveText(endpoint);
    await expect
      .poll(async () =>
        Number(
          await root
            .locator(".arm-reach-canvas")
            .getAttribute("data-mesh-count"),
        ),
      )
      .toBeGreaterThan(0);
    await page.screenshot({ path: `qa/arm-reach-${id}-loaded.png` });
    const inputs = root.locator('input[type="range"]');
    await expect.poll(() => inputs.count()).toBeGreaterThanOrEqual(5);
    const next = root.getByRole("button", { name: "Next target", exact: true });
    await expect(next).toBeDisabled();
    const limits = await inputs.evaluateAll((nodes) =>
      nodes.map((node) => {
        const input = node as HTMLInputElement;
        return {
          name: input.getAttribute("aria-label")!,
          lower: Number(input.min),
          upper: Number(input.max),
        };
      }),
    );
    const pose = reachPose(limits, 0);
    for (const j of limits)
      await root
        .getByRole("slider", { name: j.name, exact: true })
        .evaluate((node, value) => {
          const input = node as HTMLInputElement;
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          )!.set!.call(input, String(value));
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }, pose[j.name]);
    // Programmatic positioning alone must not satisfy the user-operation gate.
    await page.waitForTimeout(1300);
    await expect(next).toBeDisabled();
    await inputs.last().focus();
    await inputs.last().press("ArrowRight");
    const resume = root.getByRole("button", {
      name: "Resume scoring",
      exact: true,
    });
    if (await resume.isVisible()) await resume.click();
    await expect(next).toBeEnabled({ timeout: 10000 });
    await next.click();
    await expect(
      root.getByRole("heading", { name: "Position challenge 2/3" }),
    ).toBeVisible();
    await root
      .getByRole("button", { name: "Pause scoring", exact: true })
      .click();
    await expect(resume).toBeVisible();
    await root
      .getByRole("button", { name: "Reset joints", exact: true })
      .click();
    await expect(next).toBeDisabled();
    expect(errors).toEqual([]);
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.filter((a) => a.status >= 400)).toEqual([]);
  });
}

test("missing arm visual mesh blocks task and explicit retry recovers", async ({
  page,
}) => {
  await page.route("**/robots/panda/meshes/visual/link0.dae*", (r) =>
    r.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/?robot=panda&experience=reach&lang=en");
  const root = page.locator(".arm-reach");
  await expect(
    root.getByRole("button", { name: "Retry model loading", exact: true }),
  ).toBeVisible();
  await expect(root.locator("input[type=range]")).toHaveCount(7);
  for (const input of await root.locator("input[type=range]").all())
    await expect(input).toBeDisabled();
  await expect(
    root.getByRole("button", { name: "Next target", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/robots/panda/meshes/visual/link0.dae*");
  await root
    .getByRole("button", { name: "Retry model loading", exact: true })
    .click();
  await expect(root.locator("input[type=range]")).toHaveCount(7);
  for (const input of await root.locator("input[type=range]").all())
    await expect(input).toBeEnabled();
  await expect(
    root.getByRole("button", { name: "Retry model loading", exact: true }),
  ).toHaveCount(0);
  await expect(root.locator(".arm-reach-canvas")).toHaveAttribute(
    "data-mesh-count",
    /^[1-9]\d*$/,
  );
});
