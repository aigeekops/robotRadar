import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODES } from "../../src/core/navigation.ts";
import {
  normalizeRobotMode,
  supportedRobotModes,
  normalizeRobotExperience,
  supportsRobotDrive,
  supportsRobotDynamics,
} from "../../src/core/robotModes.ts";

const catalog = JSON.parse(
  readFileSync(
    new URL("../../public/robots/manifest.json", import.meta.url),
    "utf8",
  ),
) as { id: string; form: string }[];
const hands = ["leap_hand", "svh_hand"];
const kits = ["so101", "open-duck-mini"];
const taught = ["g1", "go2", "panda", "ur5e", "fr3", "so101"];

test("every published robot has valid shared modes and only its actual specialized modes", () => {
  for (const { id } of catalog) {
    for (const mode of MODES) {
      const supported =
        mode === "hand"
          ? hands.includes(id)
          : mode === "gripper"
            ? id === "franka-hand"
            : mode === "buildkit"
              ? kits.includes(id)
              : mode === "systems" || mode === "assembly"
                ? taught.includes(id)
                : true;
      assert.equal(
        supportedRobotModes(id).includes(mode),
        supported,
        `${id}/${mode}`,
      );
      assert.equal(
        normalizeRobotMode(id, mode),
        supported ? mode : "parts",
        `${id}/${mode} fallback`,
      );
    }
  }
});

test("switching between compatible robots keeps specialized mode; incompatible targets return to structure", () => {
  assert.equal(
    normalizeRobotMode("svh_hand", normalizeRobotMode("leap_hand", "hand")),
    "hand",
  );
  assert.equal(
    normalizeRobotMode("g1", normalizeRobotMode("leap_hand", "hand")),
    "parts",
  );
  assert.equal(
    normalizeRobotMode(
      "open-duck-mini",
      normalizeRobotMode("so101", "buildkit"),
    ),
    "buildkit",
  );
  assert.equal(
    normalizeRobotMode("g1", normalizeRobotMode("franka-hand", "gripper")),
    "parts",
  );
});

test("stationary assets have no drive entry, while supported mobile assets retain their task", () => {
  for (const robot of catalog) {
    const allowed = [
      "humanoid",
      "biped",
      "quadruped",
      "mobile",
      "wheel-legged",
    ].includes(robot.form);
    assert.equal(supportsRobotDrive(robot), allowed, robot.id);
    assert.equal(
      normalizeRobotExperience(robot, "drive"),
      allowed ? "drive" : null,
      robot.id,
    );
    assert.equal(normalizeRobotExperience(robot, "build"), "build", robot.id);
    assert.equal(supportsRobotDynamics(robot.id), robot.id === "g1");
  }
  assert.equal(normalizeRobotExperience(undefined, "drive"), null);
});

test("invalid modes and unrecognized specialized assets have a usable fallback", () => {
  for (const robot of [null, undefined, "unknown", "__proto__"]) {
    assert.equal(normalizeRobotMode(robot, "hand"), "parts");
    assert.equal(normalizeRobotMode(robot, "gripper"), "parts");
    assert.equal(normalizeRobotMode(robot, "buildkit"), "parts");
  }
  for (const input of [undefined, null, "unsupported", {}, 1])
    assert.equal(normalizeRobotMode("g1", input), "parts");
});

test("manipulation challenges are restricted to their verified source models", () => {
  for (const robot of catalog) {
    assert.equal(
      normalizeRobotExperience(robot, "grasp"),
      robot.id === "leap_hand" ? "grasp" : null,
    );
    assert.equal(
      normalizeRobotExperience(robot, "reach"),
      ["panda", "fr3", "ur5e", "so101"].includes(robot.id) ? "reach" : null,
    );
  }
  assert.equal(normalizeRobotExperience(undefined, "grasp"), null);
  assert.equal(
    normalizeRobotExperience({ id: "unknown", form: "arm" }, "reach"),
    null,
  );
});
