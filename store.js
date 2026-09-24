import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const file = path.join(process.cwd(), "data", "profiles.json");
function readAll() {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return {}; }
}
function writeAll(data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
export function listProfiles() { return Object.values(readAll()); }
export function getProfile(id) { return readAll()[id] || null; }
export function saveProfile(input) {
  const all = readAll();
  const id = input.id || crypto.randomUUID();
  const value = { id, name: input.name, image_urls: input.image_urls || [], identity_prompt: input.identity_prompt || "", created_at: new Date().toISOString() };
  all[id] = value; writeAll(all); return value;
}
export function deleteProfile(id) {
  const all = readAll();
  if (!all[id]) return false;
  delete all[id]; writeAll(all); return true;
}
