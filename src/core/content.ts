export interface LocalizedText {
  zh: string;
  en: string;
}
export interface PublishedRobot {
  id: string;
  status: "draft" | "published" | "blocked";
  name: LocalizedText;
  description: LocalizedText;
  sourceUrl?: string;
  urdfUrl?: string;
  license?: string;
  verifiedScope?: LocalizedText;
  limitations?: LocalizedText;
}
function bilingual(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const text = value as Partial<LocalizedText>;
  return (
    typeof text.zh === "string" &&
    !!text.zh.trim() &&
    typeof text.en === "string" &&
    !!text.en.trim()
  );
}
export function validateCatalog(
  entries: readonly PublishedRobot[],
  assetExists: (path: string) => boolean,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.id || ids.has(entry.id))
      errors.push(`Invalid or duplicate robot ID: ${entry.id}`);
    ids.add(entry.id);
    if (!["draft", "published", "blocked"].includes(entry.status))
      errors.push(`${entry.id}: invalid status`);
    if (entry.status !== "published") continue;
    for (const key of [
      "name",
      "description",
      "verifiedScope",
      "limitations",
    ] as const) {
      if (!bilingual(entry[key]))
        errors.push(`${entry.id}: missing bilingual ${key}`);
    }
    try {
      if (!entry.sourceUrl || new URL(entry.sourceUrl).protocol !== "https:")
        errors.push(`${entry.id}: HTTPS source required`);
    } catch {
      errors.push(`${entry.id}: valid source required`);
    }
    if (!entry.license?.trim()) errors.push(`${entry.id}: license required`);
    if (
      !entry.urdfUrl?.startsWith("/robots/") ||
      entry.urdfUrl.includes("..") ||
      !assetExists(entry.urdfUrl)
    )
      errors.push(`${entry.id}: local asset missing or unsafe`);
  }
  return errors;
}
