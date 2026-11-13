import type { Page } from "@playwright/test";

/** Independent browser XML oracle: never import the application's URDF parser. */
export async function urdfReference(page: Page, url: string) {
  const response = await page.request.get(url);
  if (!response.ok()) throw new Error(`URDF fixture failed: ${url}`);
  const xml = await response.text();
  return page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror"))
      throw new Error("Invalid reference XML");
    const direct = (node: Element, tag: string) =>
      Array.from(node.children).filter((child) => child.tagName === tag);
    const one = (node: Element | undefined, tag: string) =>
      node ? direct(node, tag)[0] : undefined;
    const numeric = (value: string | null | undefined) => {
      if (value == null || !value.trim()) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const vector = (value: string | null | undefined) => {
      if (!value) return null;
      const parsed = value.trim().split(/\s+/).map(Number);
      return parsed.length === 3 && parsed.every(Number.isFinite)
        ? parsed
        : null;
    };
    const robot = doc.documentElement;
    const joints = direct(robot, "joint").map((joint) => ({
      name: joint.getAttribute("name")!,
      type: joint.getAttribute("type")!,
      parent: one(joint, "parent")?.getAttribute("link") ?? null,
      child: one(joint, "child")?.getAttribute("link") ?? null,
      axis: vector(one(joint, "axis")?.getAttribute("xyz")),
      lower: numeric(one(joint, "limit")?.getAttribute("lower")),
      upper: numeric(one(joint, "limit")?.getAttribute("upper")),
      effort: numeric(one(joint, "limit")?.getAttribute("effort")),
      velocity: numeric(one(joint, "limit")?.getAttribute("velocity")),
    }));
    const links = direct(robot, "link").map((link) => {
      const inertial = one(link, "inertial");
      return {
        name: link.getAttribute("name")!,
        visuals: direct(link, "visual").length,
        collisions: direct(link, "collision").length,
        mass: numeric(one(inertial, "mass")?.getAttribute("value")),
        centerOfMass: vector(one(inertial, "origin")?.getAttribute("xyz")),
        hasInertial: !!inertial,
      };
    });
    return { links, joints };
  }, xml);
}
