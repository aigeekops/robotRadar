import type { Lang } from "../types";

export const LANGUAGE_PREFERENCE_KEY = "robot-radar:language:v1";
export interface ManualLanguagePreference {
  version: 1;
  source: "manual";
  lang: Lang;
}
export interface BrowserLanguages {
  languages?: readonly string[];
  language?: string;
}
export function isLanguage(value: unknown): value is Lang {
  return value === "zh" || value === "en";
}
/** Only the browser's first preference counts; no location/network detection. */
export function browserLanguage(browser: BrowserLanguages = {}): Lang {
  const first = browser.languages?.[0] || browser.language || "";
  return /^zh(?:-|$)/i.test(first) ? "zh" : "en";
}
/** Reject unmarked/invalid records: automatically selected languages are not preferences. */
export function readManualLanguage(value: unknown): Lang | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return record.version === 1 &&
    record.source === "manual" &&
    isLanguage(record.lang)
    ? record.lang
    : null;
}
export function parseManualLanguage(
  json: string | null | undefined,
): Lang | null {
  try {
    return readManualLanguage(JSON.parse(json || "null"));
  } catch {
    return null;
  }
}
export function manualLanguagePreference(lang: Lang): ManualLanguagePreference {
  if (!isLanguage(lang)) throw new TypeError("Unsupported language");
  return { version: 1, source: "manual", lang };
}
/** Old App saved lang on every render, including default/URL selection. Without
 * an explicit manual marker it cannot reliably identify a user's choice and
 * must not override their browser. Preserve unrelated legacy learning data. */
export function migrateLegacyManualLanguage(
  value: unknown,
): ManualLanguagePreference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return record.langSource === "manual" && isLanguage(record.lang)
    ? manualLanguagePreference(record.lang)
    : null;
}
/** Supply this as parseNavigation's fallback.lang. Explicit URL lang remains
 * navigation state and must never call manualLanguagePreference automatically. */
export function initialLanguage(
  options: {
    preference?: unknown;
    legacy?: unknown;
    browser?: BrowserLanguages;
  } = {},
): Lang {
  return (
    readManualLanguage(options.preference) ??
    migrateLegacyManualLanguage(options.legacy)?.lang ??
    browserLanguage(options.browser)
  );
}
