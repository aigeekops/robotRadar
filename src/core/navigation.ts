/** Same-site, query-only navigation. Never use a query value as a navigation URL. */
export const PAGES = ["lab", "catalog", "compare", "makers"] as const;
export const MODES = [
  "parts",
  "joints",
  "learn",
  "quiz",
  "program",
  "sources",
  "systems",
  "assembly",
  "buildkit",
  "hand",
  "gripper",
] as const;
export const VIEWS = ["hero", "front", "side", "back", "top", "iso"] as const;
export const LANGUAGES = ["zh", "en"] as const;
export type NavigationPage = (typeof PAGES)[number];
export type NavigationMode = (typeof MODES)[number];
export type NavigationView = (typeof VIEWS)[number];
export type NavigationLanguage = (typeof LANGUAGES)[number];
export interface NavigationState {
  robot: string | null;
  lang: NavigationLanguage;
  page: NavigationPage;
  mode: NavigationMode;
  part: string | null;
  lesson: string | null;
  view: NavigationView;
}
export const DEFAULT_NAVIGATION: Readonly<NavigationState> = Object.freeze({
  robot: null,
  lang: "zh",
  page: "lab",
  mode: "parts",
  part: null,
  lesson: null,
  view: "hero",
});
export interface NavigationOptions {
  /** Missing values use these defaults. Invalid IDs are null, not a different robot. */
  fallback?: Partial<NavigationState>;
  /** When supplied, unknown IDs are rejected. Omit while the catalog is loading. */
  robotIds?: readonly string[];
  partIds?: readonly string[];
  lessonIds?: readonly string[];
}
const KEYS = [
  "robot",
  "lang",
  "page",
  "mode",
  "part",
  "lesson",
  "view",
] as const;
const MAX_QUERY_LENGTH = 8192;
function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}
/** IDs are labels, not paths/URLs. Unicode names and spaces are supported and encoded. */
function identifier(
  value: unknown,
  allowed?: readonly string[],
): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    value !== value.trim()
  )
    return null;
  if (
    !/^[\p{L}\p{N}_][\p{L}\p{N}_. -]*$/u.test(value) ||
    value === "." ||
    value === ".."
  )
    return null;
  return allowed && !allowed.includes(value) ? null : value;
}
function defaults(options: NavigationOptions): NavigationState {
  const input = options.fallback ?? {};
  return {
    robot: identifier(input.robot, options.robotIds),
    lang: choice(input.lang, LANGUAGES, DEFAULT_NAVIGATION.lang),
    page: choice(input.page, PAGES, DEFAULT_NAVIGATION.page),
    mode: choice(input.mode, MODES, DEFAULT_NAVIGATION.mode),
    part: identifier(input.part, options.partIds),
    lesson: identifier(input.lesson, options.lessonIds),
    view: choice(input.view, VIEWS, DEFAULT_NAVIGATION.view),
  };
}
/** Accept location.search, URLSearchParams, or URL. A full string URL is intentionally not accepted. */
export function parseNavigation(
  input: string | URLSearchParams | URL | null | undefined,
  options: NavigationOptions = {},
): NavigationState {
  const base = defaults(options);
  if (input == null) return base;
  let params: URLSearchParams;
  if (input instanceof URL) params = new URLSearchParams(input.search);
  else if (input instanceof URLSearchParams)
    params = new URLSearchParams(input);
  else {
    if (
      input.length > MAX_QUERY_LENGTH ||
      input.includes("#") ||
      /^[a-z][a-z0-9+.-]*:/i.test(input) ||
      input.startsWith("//")
    )
      return base;
    params = new URLSearchParams(
      input.startsWith("?") ? input.slice(1) : input,
    );
  }
  if (params.toString().length > MAX_QUERY_LENGTH) return base;
  // A duplicated key is ambiguous; reject its value instead of depending on order.
  const value = (key: (typeof KEYS)[number]): string | null =>
    params.getAll(key).length === 1 ? params.get(key) : null;
  const id = (
    key: "robot" | "part" | "lesson",
    allowlist?: readonly string[],
  ) => (params.has(key) ? identifier(value(key), allowlist) : base[key]);
  return {
    robot: id("robot", options.robotIds),
    lang: choice(value("lang"), LANGUAGES, base.lang),
    page: choice(value("page"), PAGES, base.page),
    mode: choice(value("mode"), MODES, base.mode),
    part: id("part", options.partIds),
    lesson: id("lesson", options.lessonIds),
    view: choice(value("view"), VIEWS, base.view),
  };
}
/** Canonical full state query. Empty ID fields explicitly clear fallback selections. */
export function serializeNavigation(state: NavigationState): string {
  const normalized = defaults({ fallback: state });
  const params = new URLSearchParams();
  for (const key of KEYS) params.set(key, normalized[key] ?? "");
  return `?${params.toString()}`;
}
export function patchNavigation(
  state: NavigationState,
  patch: Partial<NavigationState>,
  options: Omit<NavigationOptions, "fallback"> = {},
): NavigationState {
  return parseNavigation(serializeNavigation({ ...state, ...patch }), options);
}
/** Safe same-site path plus state. Absolute URLs, network paths and encoded separators are rejected. */
export function navigationHref(
  pathname: string,
  state: NavigationState,
): string {
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    /[\\?#\u0000-\u0020]/.test(pathname) ||
    /%(?:2f|5c|00|0[ad])/i.test(pathname)
  ) {
    throw new Error("Navigation pathname must be a same-site absolute path");
  }
  return `${pathname}${serializeNavigation(state)}`;
}
export interface NavigationHistory {
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}
/** Pass location.pathname explicitly. Browser Back/Forward: parse location.search in popstate. */
export function writeNavigation(
  history: NavigationHistory,
  pathname: string,
  state: NavigationState,
  behavior: "push" | "replace" = "push",
): string {
  const href = navigationHref(pathname, state);
  const data = {
    robotRadar: 1,
    navigation: parseNavigation(serializeNavigation(state)),
  };
  if (behavior === "replace") history.replaceState(data, "", href);
  else history.pushState(data, "", href);
  return href;
}
