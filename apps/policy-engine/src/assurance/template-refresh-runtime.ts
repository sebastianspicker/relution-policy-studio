/** Reflects configuration metadata from an isolated, bounded template-refresh workspace. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { RuntimeConfigurationTypeMetadata } from "../contracts/template.js";
import { templateRefreshDockerIsolationArgs } from "./template-refresh-source.js";
import { readZip } from "../archive/zip.js";

export function reflectRuntimeMetadata(jar: Buffer): RuntimeConfigurationTypeMetadata[] {
  const workDir = mkdtempSync(join(tmpdir(), "relution-template-refresh-"));
  try {
    const entries = readZip(jar);
    if (!entries.some((entry) => entry.name.startsWith("BOOT-INF/classes/") && entry.name.endsWith(".class"))) return [];
    const classesDir = join(workDir, "classes");
    const libDir = join(workDir, "lib");
    mkdirSync(classesDir, { recursive: true });
    mkdirSync(libDir, { recursive: true });
    for (const entry of entries) {
      if (entry.name.startsWith("BOOT-INF/classes/") && !entry.name.endsWith("/")) {
        const target = resolveTemplateRefreshEntryTarget(classesDir, entry.name.slice("BOOT-INF/classes/".length));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, entry.data);
      }
      if (entry.name.startsWith("BOOT-INF/lib/") && entry.name.endsWith(".jar")) {
        writeFileSync(join(libDir, basename(entry.name)), entry.data);
      }
    }

    writeFileSync(join(workDir, "ConfigurationTypeDump.java"), JAVA_HELPER);
    runJdk(workDir, ["javac", "-cp", "classes:lib/*", "ConfigurationTypeDump.java"]);
    const parsed = JSON.parse(runJdk(workDir, ["java", "-cp", ".:classes:lib/*", "ConfigurationTypeDump"])) as unknown;
    if (!Array.isArray(parsed)) throw new Error("ConfigurationTypeDump did not return an array");
    return parsed.filter(isRuntimeMetadata);
  } catch (error) {
    console.warn(`Runtime metadata reflection failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function resolveTemplateRefreshEntryTarget(root: string, relativePath: string): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, relativePath);
  if (target === resolvedRoot || target.startsWith(`${resolvedRoot}${sep}`)) return target;
  throw new Error(`Template refresh entry escapes extraction root: ${relativePath}`);
}

function runJdk(workDir: string, command: string[]): string {
  return execFileSync("docker", [
    "run",
    "--rm",
    ...templateRefreshDockerIsolationArgs(true),
    "-v",
    `${workDir}:/work:rw`,
    "-w",
    "/work",
    "eclipse-temurin:21-jdk",
    ...command,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function isRuntimeMetadata(value: unknown): value is RuntimeConfigurationTypeMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.type === "string"
    && Array.isArray(record.platforms)
    && Array.isArray(record.enrollmentTypes)
    && typeof record.multiConfig === "boolean"
    && Array.isArray(record.placeholders)
    && typeof record.portalHidden === "boolean";
}

const JAVA_HELPER = `
import com.mwaysolutions.relution.mdm.policy.domain.ConfigurationType;
import java.util.Collection;
import java.util.StringJoiner;
import java.util.stream.Collectors;

public class ConfigurationTypeDump {
  private static final String QUOTE = Character.toString(34);
  private static final String SLASH = Character.toString(92);

  public static void main(String[] args) {
    StringJoiner objects = new StringJoiner(",", "[", "]");
    for (ConfigurationType type : ConfigurationType.values()) {
      objects.add(object(type));
    }
    System.out.print(objects);
  }

  private static String object(ConfigurationType type) {
    StringBuilder out = new StringBuilder("{");
    property(out, "type", type.name());
    property(out, "platforms", type.getPlatforms());
    property(out, "enrollmentTypes", type.getEnrollmentTypes());
    property(out, "multiConfig", type.isMultiConfig());
    property(out, "placeholders", type.getPlaceholders());
    property(out, "portalHidden", ConfigurationType.PORTAL_HIDDEN_TYPES.contains(type));
    return out.append("}").toString();
  }

  private static void property(StringBuilder out, String name, Object value) {
    separator(out);
    name(out, name);
    if (value instanceof Collection<?> values) {
      String items = values.stream()
        .map(item -> quoted(String.valueOf(item)))
        .collect(Collectors.joining(",", "[", "]"));
      out.append(items);
    } else if (value instanceof String text) {
      out.append(quoted(text));
    } else {
      out.append(value);
    }
  }

  private static StringBuilder name(StringBuilder out, String value) {
    return out.append(quoted(value)).append(":");
  }

  private static String quoted(String value) {
    return QUOTE + escape(value) + QUOTE;
  }

  private static void separator(StringBuilder out) {
    if (out.length() > 1) out.append(",");
  }

  private static String escape(String value) {
    return value.replace(SLASH, SLASH + SLASH).replace(QUOTE, SLASH + QUOTE);
  }
}
`;
