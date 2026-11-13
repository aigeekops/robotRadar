import { so101BuildKit } from "./buildKitData";
export { so101BuildKit };
export function buildKitCsv(): string {
  const quote = (v: unknown) =>
    `"${String(v ?? "UNKNOWN").replaceAll('"', '""')}"`;
  const fields = [
    "id",
    "name",
    "category",
    "quantity",
    "unit",
    "note",
    "source",
    "download",
  ] as const;
  return (
    "\uFEFF" +
    [
      fields.join(","),
      ...so101BuildKit.rows.map((row) =>
        fields.map((field) => quote(row[field])).join(","),
      ),
    ].join("\r\n")
  );
}
export function buildKitJson(): string {
  return JSON.stringify(so101BuildKit, null, 2);
}
export function escapeBuildKitHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function printableBuildKit(): string {
  const e = escapeBuildKitHtml;
  return `<!doctype html><html><head><meta charset="utf-8"><title>SO-101 follower BOM</title><style>body{font:12px system-ui;color:#111;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;text-align:left;padding:7px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}a{color:#111}h1{font-size:22px}</style></head><body><h1>SO-101 follower · BOM / 物料清单</h1><p>${e(so101BuildKit.configuration)}<br>Source commit: ${e(so101BuildKit.commit)}</p><p>资料样板，未完成实物制造验证。紧固件总数未知。Not a complete manufacturing package; unresolved fasteners and no physical validation.</p><table><thead><tr><th>Part / 零件</th><th>Quantity / 数量</th><th>Notes / 说明</th><th>Source / 来源</th></tr></thead><tbody>${so101BuildKit.rows.map((r) => `<tr><td>${e(r.name)}</td><td>${r.quantity ?? "UNKNOWN / 未知"} ${e(r.unit)}</td><td>${e(r.note)}</td><td>${e(r.source)}</td></tr>`).join("")}</tbody></table><h2>Print settings / 打印参数</h2>${so101BuildKit.printSettings.map((s) => `<p><b>${e(s.parameter)}</b>: ${e(s.value)}<br>${e(s.source)}</p>`).join("")}<h2>Unresolved / 待核实</h2>${so101BuildKit.limitations.map((s) => `<p>${e(s)}</p>`).join("")}</body></html>`;
}
