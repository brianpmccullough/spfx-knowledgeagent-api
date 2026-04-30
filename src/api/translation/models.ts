// ── Translation request / response ──────────────────────────────────────────

export interface TranslationRequest {
  siteUrl: string;
  /** Server-relative or absolute URL of the SharePoint page */
  pageUrl?: string;
  /** GUID of the SharePoint page list item */
  pageId?: string;
  /** BCP 47 language tags for the desired output languages (e.g. 'fr', 'es', 'de') */
  languages: string[];
}

export interface PageTranslation {
  language: string;
  content: string;
}

export interface TranslationResponse {
  siteUrl: string;
  pageUrl: string;
  pageId: string;
  translations: PageTranslation[];
}

// ── Translation status ────────────────────────────────────────────────────────

export interface TranslationStatusRequest {
  siteUrl: string;
  /** Numeric list item ID of the source page (the integer in pages({id})) */
  pageId: number;
}

/** Maps SharePoint FileStatus values to a readable string */
export type TranslationFileStatus = 'none' | 'draft' | 'published';

export interface TranslationStatusItem {
  /** BCP 47 language tag, e.g. 'es', 'fr', 'zh-chs' */
  language: string;
  /** Server-relative path to the translated page, e.g. /sites/MySite/SitePages/es/Home.aspx */
  path: string;
  fileStatus: TranslationFileStatus;
  hasPublishedVersion: boolean;
}

export interface TranslationStatusResponse {
  siteUrl: string;
  pageId: number;
  /** Server-relative path of the source page */
  path: string;
  version: string;
  translations: TranslationStatusItem[];
  /** Language codes for which no translated copy exists yet */
  untranslatedLanguages: string[];
}

// ── SharePoint REST API raw shapes (internal) ─────────────────────────────────

export interface SpoPageTranslationItem {
  Culture: string;
  Path: string;
  FileStatus: number; // 0 = none, 1 = draft, 2 = published
  HasPublishedVersion: boolean;
}

export interface SpoTranslationsPayload {
  Items: SpoPageTranslationItem[];
  UntranslatedLanguageCodes: string[];
}

export interface SpoPageResponse {
  Path: string;
  Version: string;
  Translations: SpoTranslationsPayload;
}
