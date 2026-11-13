import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  buildKitCsv,
  buildKitJson,
  printableBuildKit,
  escapeBuildKitHtml,
  so101BuildKit,
} from "../../src/core/buildKit";
import { resolveSiteAsset } from "../../src/core/siteAssets";

test("SO101 build kit is follower-only and contains 11 actual printable parts", () => {
  const rows = so101BuildKit.rows.filter((r) => r.category === "printed");
  assert.equal(rows.length, 11);
  assert.ok(rows.every((r) => r.quantity === 1));
  assert.ok(
    rows.every((r) => !/(Handle|Trigger|Assembly|sts3215)/.test(r.name)),
  );
  assert.equal(so101BuildKit.rows.find((r) => r.id === "servo")?.quantity, 6);
  assert.equal(
    so101BuildKit.rows.find((r) => r.id === "fasteners")?.quantity,
    null,
  );
});
test("every published original has matching SHA256, source, license and unchanged bytes", () => {
  for (const file of so101BuildKit.files) {
    const bytes = readFileSync(
      new URL(
        "../../public/robots/so101/build-kit/" + file.file,
        import.meta.url,
      ),
    );
    const source = readFileSync(
      new URL(
        "../../assets-source/SO-ARM100/" + file.sourcePath,
        import.meta.url,
      ),
    );
    assert.deepEqual(bytes, source);
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    assert.equal(file.license, "Apache-2.0");
    assert.ok(file.sourceUrl.includes(so101BuildKit.commit));
  }
});
test("BOM exports retain unknowns, procurement units, limitations and provenance", () => {
  const csv = buildKitCsv();
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"UNKNOWN"'));
  assert.ok(csv.includes('"pack"'));
  const data = JSON.parse(buildKitJson());
  assert.equal(data.rows.length, 18);
  assert.equal(data.files.length, 14);
  assert.equal(
    data.rows.find((r: { id: string }) => r.id === "fasteners").quantity,
    null,
  );
  assert.ok(data.limitations.some((s: string) => s.includes("No 3MF")));
});
test("print view escapes content and retains source and unresolved counts", () => {
  assert.equal(escapeBuildKitHtml('<script>"&'), "&lt;script&gt;&quot;&amp;");
  const html = printableBuildKit();
  assert.ok(html.includes("UNKNOWN / 未知"));
  assert.ok(html.includes(so101BuildKit.commit));
  assert.ok(html.includes("Print settings"));
  assert.ok(!html.includes("<script"));
});
test("print files are static-subpath safe and linked to an audited file", () => {
  for (const row of so101BuildKit.rows) {
    if (!row.download) continue;
    assert.ok(
      so101BuildKit.files.some((file) =>
        row.download?.endsWith("/" + file.file),
      ),
    );
    assert.ok(
      resolveSiteAsset(
        row.download,
        "https://example.test/robot-radar/",
      ).startsWith("/robot-radar/robots/so101/build-kit/"),
    );
  }
});
