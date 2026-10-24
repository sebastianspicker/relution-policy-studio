/** Publishes a private HTML redirect to the capability URL so launchers never pass the token in argv or stdout. */
import { unlinkSync } from "node:fs";
import { writePrivateFileAtomic } from "../platform/filesystem/atomic-private-file.js";

export function writeEditorLaunchFile(path: string, url: string): void {
  writePrivateFileAtomic(path, Buffer.from(launchPage(url), "utf8"), { force: true, label: "Studio launch file" });
}

export function removeEditorLaunchFile(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function launchPage(url: string): string {
  const href = url.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return [
    "<!doctype html>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"referrer\" content=\"no-referrer\">",
    `<meta http-equiv="refresh" content="0; url=${href}">`,
    "<title>Relution Policy Studio</title>",
    `<p><a href="${href}">Open Relution Policy Studio</a></p>`,
    "",
  ].join("\n");
}
