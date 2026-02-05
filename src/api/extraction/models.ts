export type MetadataDataType = 'string' | 'number' | 'boolean';

export type ConfidenceLevel = 'green' | 'yellow' | 'red';

/**
 * Defines a metadata field to extract from the document.
 */
export interface MetadataFieldDefinition {
  /** The name/title of the field to extract */
  title: string;
  /** Instructions for the LLM on how to extract content for this field */
  description: string;
  /** The expected data type of the extracted value */
  dataType: MetadataDataType;
}

/**
 * Document location specified by path.
 */
export interface DocumentPathLocation {
  /** Absolute or server-relative path to the document */
  path: string;
}

/**
 * Document location specified by Graph drive identifiers.
 */
export interface DocumentDriveLocation {
  /** The Graph API drive ID */
  driveId: string;
  /** The Graph API drive item ID */
  driveItemId: string;
}

/**
 * Request body for metadata extraction.
 */
export interface MetadataExtractionRequest {
  /** Document location - specify either path OR driveId/driveItemId */
  document: DocumentPathLocation | DocumentDriveLocation;
  /** Array of metadata fields to extract */
  fields: MetadataFieldDefinition[];
}

/**
 * Result for a single extracted metadata field.
 */
export interface MetadataFieldResult {
  /** The field name (matches the title from the request) */
  fieldName: string;
  /** Confidence level of the extraction */
  confidence: ConfidenceLevel;
  /** The extracted value, or null if not found */
  value: string | number | boolean | null;
}

/**
 * Response body for metadata extraction.
 */
export interface MetadataExtractionResponse {
  /** The document location that was processed */
  document: DocumentPathLocation | DocumentDriveLocation;
  /** Results for each requested field */
  results: MetadataFieldResult[];
}

/**
 * Type guard to check if document location is path-based.
 */
export function isPathLocation(
  doc: DocumentPathLocation | DocumentDriveLocation,
): doc is DocumentPathLocation {
  return 'path' in doc;
}

/**
 * Type guard to check if document location is drive-based.
 */
export function isDriveLocation(
  doc: DocumentPathLocation | DocumentDriveLocation,
): doc is DocumentDriveLocation {
  return 'driveId' in doc && 'driveItemId' in doc;
}

// ============================================================================
// Text Extraction Types
// ============================================================================

export type TextOutputFormat = 'markdown' | 'text';

/**
 * Request body for text extraction.
 */
export interface TextExtractionRequest {
  /** Document location - specify either path OR driveId/driveItemId */
  document: DocumentPathLocation | DocumentDriveLocation;
}

/**
 * Response body for text extraction.
 */
export interface TextExtractionResponse {
  /** The document location that was processed */
  document: DocumentPathLocation | DocumentDriveLocation;
  /** The output format used */
  format: TextOutputFormat;
  /** The extracted text content */
  content: string;
}
