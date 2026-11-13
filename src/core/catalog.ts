export interface CatalogEntry {
  id: string;
  name: { zh: string; en: string };
  manufacturer: string;
  form: string;
  description?: { zh: string; en: string };
}
export interface CatalogFilter {
  query?: string;
  form?: string;
  manufacturer?: string;
}
export function filterCatalog<T extends CatalogEntry>(
  entries: readonly T[],
  filter: CatalogFilter,
): T[] {
  const query = (filter.query ?? "")
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase();
  return entries.filter((entry) => {
    if (filter.form && filter.form !== "all" && entry.form !== filter.form)
      return false;
    if (filter.manufacturer && entry.manufacturer !== filter.manufacturer)
      return false;
    const searchable = [
      entry.id,
      entry.name.zh,
      entry.name.en,
      entry.manufacturer,
      entry.description?.zh,
      entry.description?.en,
    ]
      .filter(Boolean)
      .join(" ")
      .normalize("NFKC")
      .toLocaleLowerCase();
    return !query || searchable.includes(query);
  });
}
