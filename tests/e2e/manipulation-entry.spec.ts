import { test, expect } from "@playwright/test";
test("source-specific manipulation entries open their own task and unsupported links recover", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const id of ["panda", "fr3", "ur5e", "so101", "leap_hand"]) {
    await page.goto(`/?robot=${id}&showroom=1&lang=zh`);
    await expect(page.getByTestId("home-game-drive")).toHaveCount(0);
    const entry = page.getByTestId("home-game-manipulation");
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(page).toHaveURL(
      new RegExp(`experience=${id === "leap_hand" ? "grasp" : "reach"}`),
    );
    if (id === "leap_hand")
      await expect(page.getByTestId("contact-grasp")).toBeVisible();
    else await expect(page.locator(".arm-reach")).toBeVisible();
    await page.reload();
    if (id === "leap_hand")
      await expect(page.getByTestId("contact-grasp")).toBeVisible();
    else await expect(page.locator(".arm-reach")).toBeVisible();
  }
  for (const [id, experience] of [
    ["g1", "grasp"],
    ["leap_hand", "reach"],
    ["svh_hand", "grasp"],
  ]) {
    await page.goto(`/?robot=${id}&experience=${experience}&lang=zh`);
    await expect(page.getByTestId("structure-navigator")).toBeVisible();
    await expect(page).not.toHaveURL(/experience=/);
  }
});
