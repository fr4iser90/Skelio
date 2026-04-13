/** File I/O, serializers; no Vue. See docs/05-modulgrenzen-schnittstellen.md */
export {
  ASSETS_DIRECTORY_NAME,
  PROJECT_MANIFEST_FILE,
  RUNTIME_SCHEMA_VERSION,
} from "@skelio/domain";
export {
  readEditorProjectFromDirectory,
  readProjectFromDirectory,
  writeEditorProjectToDirectory,
  writeProjectToDirectory,
} from "./projectFolder.js";
