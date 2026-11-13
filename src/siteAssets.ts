import { resolveSiteAsset } from "./core/siteAssets";
/** All app navigation uses query state, so a relative Vite base remains stable on GitHub Pages. */
export function siteBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, document.baseURI).href;
}
export function siteAsset(path: string): string {
  return resolveSiteAsset(path, siteBaseUrl());
}
