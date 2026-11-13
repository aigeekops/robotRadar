import test from "node:test";
import assert from "node:assert/strict";
import {
  browserLanguage,
  initialLanguage,
  manualLanguagePreference,
  migrateLegacyManualLanguage,
  parseManualLanguage,
  readManualLanguage,
} from "../../src/core/locale.ts";
import { parseNavigation } from "../../src/core/navigation.ts";

test("browser first preference maps Chinese variants only, without scanning later languages", () => {
  for (const language of ["zh", "zh-CN", "zh-TW", "zh-Hant-HK", "ZH-hans"])
    assert.equal(browserLanguage({ languages: [language, "en"] }), "zh");
  for (const language of ["en-US", "fr", "ja", "zhong", "zh_CN"])
    assert.equal(browserLanguage({ languages: [language, "zh"] }), "en");
  assert.equal(browserLanguage({ languages: ["en"], language: "zh" }), "en");
});
test("browser language fallback handles empty list and unavailable browser", () => {
  assert.equal(browserLanguage({ languages: [], language: "zh-HK" }), "zh");
  assert.equal(browserLanguage({ language: "en-GB" }), "en");
  assert.equal(browserLanguage(), "en");
});
test("only a valid marked manual preference overrides browser", () => {
  assert.equal(
    initialLanguage({
      preference: manualLanguagePreference("en"),
      browser: { language: "zh" },
    }),
    "en",
  );
  assert.equal(
    initialLanguage({
      preference: manualLanguagePreference("zh"),
      browser: { language: "en" },
    }),
    "zh",
  );
  for (const value of [
    null,
    [],
    "zh",
    { lang: "zh" },
    { version: 1, source: "auto", lang: "zh" },
    { version: 2, source: "manual", lang: "zh" },
    { version: 1, source: "manual", lang: "fr" },
  ]) {
    assert.equal(readManualLanguage(value), null);
    assert.equal(
      initialLanguage({ preference: value, browser: { language: "en" } }),
      "en",
    );
  }
});
test("serialized preference tolerates invalid JSON and roundtrips a manual choice", () => {
  for (const value of [null, undefined, "", "{", "null"])
    assert.equal(parseManualLanguage(value), null);
  assert.equal(
    parseManualLanguage(JSON.stringify(manualLanguagePreference("zh"))),
    "zh",
  );
});
test("ambiguous legacy auto-save does not become a manual preference", () => {
  const legacy = { lang: "zh", completed: ["lesson-1"] };
  assert.equal(migrateLegacyManualLanguage(legacy), null);
  assert.equal(initialLanguage({ legacy, browser: { language: "en" } }), "en");
  assert.deepEqual(legacy, { lang: "zh", completed: ["lesson-1"] });
  assert.deepEqual(
    migrateLegacyManualLanguage({ lang: "zh", langSource: "manual" }),
    manualLanguagePreference("zh"),
  );
});
test("explicit URL overrides fallback but does not modify saved preference", () => {
  const preference = manualLanguagePreference("zh");
  const fallback = {
    lang: initialLanguage({ preference, browser: { language: "en" } }),
  };
  assert.equal(parseNavigation("?lang=en", { fallback }).lang, "en");
  assert.equal(parseNavigation("?lang=fr", { fallback }).lang, "zh");
  assert.deepEqual(preference, manualLanguagePreference("zh"));
});
