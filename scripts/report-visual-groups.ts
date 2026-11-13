import { readFileSync, writeFileSync } from "node:fs";
import { adaptUrdfVisuals } from "../src/core/urdfVisualEvidence";
const robots = JSON.parse(readFileSync("public/robots/manifest.json", "utf8"));
const report = robots.map((r: any) => {
  const a = adaptUrdfVisuals(readFileSync(`public${r.urdfUrl}`, "utf8"), {
    robotId: r.id,
    sourceCommit: r.sourceCommit,
    urdfUri: r.urdfUrl,
  });
  return {
    robotId: r.id,
    sourceCommit: r.sourceCommit,
    instanceCount: a.instances.length,
    visualInstanceCount: a.instances.filter((x) => x.visuals.length).length,
    displayGroupCount: a.groups.length,
    mergeable: a.groups
      .filter((g) => g.quantity > 1)
      .map((g) => ({
        representative: g.representative.instanceId,
        quantity: g.quantity,
        instances: g.instances.map((x) => x.instanceId),
        meshUris: g.representative.visuals.map((v) => v.meshUri),
      })),
    exclusions: a.exclusions,
  };
});
writeFileSync(
  "qa/source-visual-grouping.json",
  JSON.stringify(
    {
      scope:
        "Pinned URDF source visual equivalence, not physical interchangeability",
      robots: report,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(report, null, 2));
