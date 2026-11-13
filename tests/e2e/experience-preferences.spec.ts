import { test, expect } from "@playwright/test";
import { MUSIC_PREFERENCE_KEY } from "../../src/core/musicPreference";

test("music defaults enabled, gestures resume after blur, and explicit off persists", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const tracked = window as typeof window & { audioContexts: AudioContext[] };
    tracked.audioContexts = [];
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        tracked.audioContexts.push(this);
      }
    };
  });
  const state = () =>
    page.evaluate(() =>
      (
        window as typeof window & { audioContexts: AudioContext[] }
      ).audioContexts
        .filter((c) => c.state !== "closed")
        .map((c) => c.state),
    );
  await page.goto("/");
  const icon = page.getByTestId("ambient-toggle");
  await expect(icon).toHaveAttribute("data-enabled", "true");
  // The browser may already allow autoplay; otherwise this real key is the first gesture.
  await page.keyboard.press("Shift");
  await expect.poll(state).toEqual(["running"]);
  await expect(icon).toHaveAttribute("data-playback", "playing");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(state).toEqual(["suspended"]);
  await expect(icon).toHaveAttribute("data-playback", "paused");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(150);
  expect(await state()).toEqual(["suspended"]);
  await page.keyboard.press("Shift");
  await expect.poll(state).toEqual(["running"]);
  await icon.click();
  await expect(icon).toHaveAttribute("data-enabled", "false");
  await expect(icon).toHaveAttribute("data-playback", "off");
  await page.reload();
  await expect(icon).toHaveAttribute("data-enabled", "false");
  expect(await state()).toEqual([]);
  await page.keyboard.press("Shift");
  expect(await state()).toEqual([]);
  await icon.click();
  await expect(icon).toHaveAttribute("data-playback", "playing");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "false",
  );
  await page.screenshot({ path: "qa/preferences-main-app.png" });
  expect(errors).toEqual([]);
});

test("a pending initial resume is not playback and muting does not unlock sound", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      get state(): AudioContextState {
        return "suspended";
      }
      resume() {
        return new Promise<void>(() => {});
      }
    };
  });
  await page.goto("/");
  const icon = page.getByTestId("ambient-toggle");
  await expect(icon).toHaveAttribute("data-enabled", "true");
  await expect(icon).toHaveAttribute("data-playback", "pending");
  await expect(icon).toHaveAttribute("data-audio-playing", "false");
  await icon.click();
  await expect(icon).toHaveAttribute("data-playback", "off");
  await expect(icon).toHaveAttribute("data-audio-playing", "false");
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      MUSIC_PREFERENCE_KEY,
    ),
  ).toBe("false");
});

test("viewer transitions finish, user interaction cancels, and reduced motion snaps", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".viewer-status")).toHaveCount(0);
  await page
    .getByRole("button", { name: "探索部件与系统", exact: true })
    .click();
  await page.getByRole("button", { name: "正面", exact: true }).click();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-camera-transition",
    "true",
  );
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-camera-transition",
    "false",
  );
  await page.getByRole("button", { name: "背面", exact: true }).click();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-camera-transition",
    "true",
  );
  const box = await page.locator(".viewer canvas").boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.55);
  await page.mouse.down();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-camera-transition",
    "false",
  );
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await page.getByRole("button", { name: "顶部", exact: true }).click();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-camera-transition",
    "false",
  );
});

test("reduced motion reaches assembly and driving without skipping assembly confirmation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?robot=g1&experience=build");
  const canvas = page.getByTestId("assembly-canvas");
  await expect(canvas).toHaveAttribute("data-source-mesh-count", "26");
  await expect(canvas).toHaveAttribute("data-reduced-motion", "true");
  await page.getByTestId("assembly-part-0").click();
  await expect(canvas).toHaveAttribute("data-phase", "confirm");
  await expect(canvas).toHaveAttribute("data-step", "0");
  await expect(
    page.getByRole("button", { name: "按住虚拟定位确认点 1", exact: true }),
  ).toBeEnabled();
  await page.goto("/?robot=g1&experience=drive");
  await expect(page.locator(".drive-scene[data-drive-state]")).toBeVisible();
  await expect(page.locator(".drive-scene")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".drive-scene")).toHaveAttribute(
    "data-reduced-motion",
    "false",
  );
});

for (const width of [1600, 390]) {
  test(`single audio icon is reachable without overlapping language at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const icon = page.getByTestId("ambient-toggle");
    await expect(icon).toBeVisible();
    await expect(
      page.locator(
        ".experience-preferences details, .experience-preferences select, .experience-preferences input",
      ),
    ).toHaveCount(0);
    const a = (await icon.boundingBox())!;
    const b = (await page.locator(".language").boundingBox())!;
    expect(a.width).toBeGreaterThanOrEqual(44);
    expect(a.x + a.width).toBeLessThanOrEqual(width);
    expect(
      a.x >= b.x + b.width || a.y >= b.y + b.height || b.y >= a.y + a.height,
    ).toBe(true);
    await expect(icon).toHaveAttribute("data-enabled", "true");
    await icon.click();
    await expect(icon).toHaveAttribute("data-playback", "off");
    await icon.click();
    await expect(icon).toHaveAttribute("data-playback", "playing");
    await page.screenshot({ path: `qa/simple-audio-${width}.png` });
  });
}

for (const width of [1600, 390]) {
  for (const experience of ["drive", "build"]) {
    test(`audio safe area clears ${experience} controls at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?robot=g1&experience=${experience}`);
      const icon = page.getByTestId("ambient-toggle");
      const protectedControl = page.locator(
        experience === "drive"
          ? ".drive-top > button:last-child"
          : ".ae-top time",
      );
      await expect(protectedControl).toBeVisible();
      const a = (await icon.boundingBox())!;
      const b = (await protectedControl.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(a.x - 8);
      await expect(icon).toHaveAttribute("data-enabled", "true");
      await icon.click();
      await expect(icon).toHaveAttribute("data-playback", "off");
      await icon.click();
      await expect(icon).toHaveAttribute("data-playback", "playing");
      if (experience === "drive") await protectedControl.click();
      await page.screenshot({
        path: `qa/audio-safe-${experience}-${width}.png`,
      });
    });
  }
}
