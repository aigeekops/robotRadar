/** Map trusted bundled asset paths beneath a static-site base without rewriting external sources. */
export function resolveSiteAsset(path: string, baseHref: string): string {
  const base = new URL(baseHref);
  if (base.protocol !== "http:" && base.protocol !== "https:")
    throw new Error("HTTP site base required");
  const localRoots = ["robots/", "previews/", "mujoco/"];
  if (path.startsWith("data:") || path.startsWith("blob:")) return path;
  const absolute = new URL(path, base);
  if (absolute.origin !== base.origin) return path;
  let logical: string | null = null;
  for (const root of localRoots) {
    if (path.startsWith("/" + root)) logical = path.slice(1);
    else if (path.startsWith(root)) logical = path;
    else if (absolute.pathname.startsWith("/" + root))
      logical = absolute.pathname.slice(1) + absolute.search + absolute.hash;
  }
  if (logical !== null) {
    if (logical.split(/[/?#]/).includes(".."))
      throw new Error("Asset traversal is not supported");
    const result = new URL(logical, base);
    return result.pathname + result.search + result.hash;
  }
  return path;
}
