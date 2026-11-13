// Public checkout tests. Source-import audits require private local assets-source archives.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const sourceAudits = new Set([
  "buildKit.test.ts", "handLab.test.ts", "physical-assembly.test.ts",
  "svhHand.test.ts", "urdf-mesh-loader.test.ts",
]);
const tests = readdirSync("tests/core")
  .filter((name) => name.endsWith(".test.ts") && !sourceAudits.has(name))
  .sort().map((name) => "tests/core/" + name);
if (!tests.length) throw new Error("No portable core tests found");
console.log("Source-archive-dependent suites not run in public CI:", [...sourceAudits].join(", "));
const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--test", ...tests], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
