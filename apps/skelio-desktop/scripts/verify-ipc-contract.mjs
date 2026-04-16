#!/usr/bin/env node
/**
 * Regression guard: zentrale Tauri-IPC-Commands bleiben registriert + ACL — ohne Tauri/GTK zu bauen.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tauriRoot = path.join(__dirname, "..", "src-tauri");

function read(rel) {
  return fs.readFileSync(path.join(tauriRoot, rel), "utf8");
}

let failed = false;
function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed = true;
  }
}

const lib = read("src/lib.rs");
const gh = lib.indexOf("generate_handler!");
assert(gh !== -1, "lib.rs: generate_handler! fehlt");

assert(lib.includes("fn save_text_file_with_dialog"), "lib.rs: fn save_text_file_with_dialog fehlt");
assert(lib.slice(gh).includes("save_text_file_with_dialog"), "lib.rs: save_text_file_with_dialog muss in generate_handler! stehen");

assert(lib.includes("fn pick_project_folder_with_dialog"), "lib.rs: fn pick_project_folder_with_dialog fehlt");
assert(lib.slice(gh).includes("pick_project_folder_with_dialog"), "lib.rs: pick_project_folder_with_dialog muss in generate_handler! stehen");

const cap = read("capabilities/default.json");
assert(cap.includes("allow-save-text-file-with-dialog"), "capabilities: allow-save-text-file-with-dialog fehlt");
assert(cap.includes("allow-pick-project-folder-with-dialog"), "capabilities: allow-pick-project-folder-with-dialog fehlt");
assert(cap.includes('"remote"'), "capabilities/default.json: remote fehlt");
assert(cap.includes("localhost"), "capabilities/default.json: localhost (tauri dev) fehlt");

const buildRs = read("build.rs");
assert(buildRs.includes("save_text_file_with_dialog"), "build.rs: save_text_file_with_dialog fehlt");
assert(buildRs.includes("pick_project_folder_with_dialog"), "build.rs: pick_project_folder_with_dialog fehlt");

if (failed) process.exit(1);
console.log("ipc contract OK (save + pick folder dialogs + ACL + build.rs)");
