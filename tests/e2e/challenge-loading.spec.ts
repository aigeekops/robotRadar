import { test, expect, type Page } from "@playwright/test";
async function choose(page: Page, name: string) {
  await page
    .locator(".robot-chip")
    .filter({
      has: page
        .locator("strong")
        .filter({ hasText: new RegExp("^" + name + "(?: ·|$)") }),
    })
    .click();
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}

test("slow model switch then immediate positioning entry keeps target identity and ignores late previous loads", async ({
  page,
}) => {
  const panda = deferred(),
    fr3 = deferred();
  await page.route("**/robots/panda/**", async (r) => {
    await panda.promise;
    await r.continue().catch(() => {});
  });
  await page.route("**/robots/fr3/**", async (r) => {
    await fr3.promise;
    await r.continue().catch(() => {});
  });
  await page.goto("/?robot=g1&showroom=1&lang=en");
  await choose(page, "Franka Panda");
  await page.getByTestId("home-game-manipulation").click();
  const loading = page.getByTestId("challenge-loading");
  await expect(loading).toHaveAttribute("data-robot-id", "panda");
  await expect(loading).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next target", exact: true }),
  ).toBeDisabled();
  await loading
    .getByRole("button", { name: "Back to models", exact: true })
    .click();
  await choose(page, "Franka Research 3");
  await page.getByTestId("home-game-manipulation").click();
  await expect(loading).toHaveAttribute("data-robot-id", "fr3");
  panda.release();
  await page.waitForTimeout(300);
  await expect(loading).toHaveAttribute("data-robot-id", "fr3");
  await expect(page.locator(".arm-reach")).toHaveAttribute(
    "data-load-state",
    "loading",
  );
  fr3.release();
  await expect(page.locator(".arm-reach")).toHaveAttribute(
    "data-load-state",
    "ready",
  );
  await expect(loading).toHaveCount(0);
  await expect(page.locator(".arm-reach code")).toHaveText("fr3_hand_tcp");
  await expect(page.locator(".arm-reach-canvas")).toHaveAttribute(
    "data-mesh-count",
    /^[1-9]\d*$/,
  );
});

test("immediate assembly entry waits visibly for the selected source and renders only that robot", async ({
  page,
}) => {
  const gate = deferred();
  await page.route("**/robots/go2/**", async (r) => {
    await gate.promise;
    await r.continue().catch(() => {});
  });
  await page.goto("/?robot=g1&showroom=1&lang=en");
  await choose(page, "Unitree Go2");
  await page.getByTestId("home-game-build").click();
  const root = page.getByTestId("assembly-experience");
  await expect(root).toHaveAttribute("data-robot-id", "go2");
  await expect(root).toHaveAttribute("data-load-state", "loading");
  await expect(page.getByTestId("challenge-loading")).toBeVisible();
  gate.release();
  await expect(root).toHaveAttribute("data-load-state", "ready");
  await expect(page.getByTestId("challenge-loading")).toHaveCount(0);
  await expect(
    page.getByTestId("assembly-full-inventory").locator("button"),
  ).not.toHaveCount(0);
});

for (const experience of ["reach", "build"])
  test(`${experience} entry after a failed switch provides a working retry`, async ({
    page,
  }) => {
    await page.route("**/robots/panda/**", (r) =>
      r.fulfill({ status: 503, body: "temporarily unavailable" }),
    );
    await page.goto("/?robot=g1&showroom=1&lang=en");
    await choose(page, "Franka Panda");
    await page
      .getByTestId(
        experience === "reach" ? "home-game-manipulation" : "home-game-build",
      )
      .click();
    const overlay = page.getByTestId("challenge-loading");
    await expect(overlay).toHaveAttribute("data-load-state", "error");
    await expect(overlay).toHaveAttribute("data-robot-id", "panda");
    await page.unroute("**/robots/panda/**");
    await overlay
      .getByRole("button", {
        name: experience === "reach" ? "Retry model loading" : "Retry loading",
        exact: true,
      })
      .click();
    const root =
      experience === "reach"
        ? page.locator(".arm-reach")
        : page.getByTestId("assembly-experience");
    await expect(root).toHaveAttribute("data-load-state", "ready");
    await expect(overlay).toHaveCount(0);
    await expect(root).toHaveAttribute("data-robot-id", "panda");
  });

test("mobile loading feedback remains readable and Back cancels challenge entry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  const gate = deferred();
  await page.route("**/robots/panda/**", async (r) => {
    await gate.promise;
    await r.continue().catch(() => {});
  });
  await page.goto("/?robot=panda&experience=reach&lang=en");
  const overlay = page.getByTestId("challenge-loading");
  await expect(overlay).toBeVisible();
  const bounds = await overlay.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "qa/challenge-loading-mobile.png" });
  await overlay
    .getByRole("button", { name: "Back to models", exact: true })
    .click();
  await expect(page.locator(".arm-reach")).toHaveCount(0);
  gate.release();
  await expect(page.getByTestId("home-game-manipulation")).toBeVisible();
});
