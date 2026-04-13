/** Public runtime JSON schema version (SemVer). See docs/adr/0002-runtime-json-schema-versioning.md */
export const RUNTIME_SCHEMA_VERSION = "1.1.0" as const;

/** Ordnerprojekt (ADR-0004): Manifest-Dateiname am Projektroot. */
export const PROJECT_MANIFEST_FILE = "project.skelio.json";

/** Unterordner für binäre Assets relativ zum Projektroot. */
export const ASSETS_DIRECTORY_NAME = "assets";
