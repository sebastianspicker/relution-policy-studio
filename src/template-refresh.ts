import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import { createTemplateBundle, type JsonObject, type RuntimeConfigurationTypeMetadata } from "./templates.js";
import { readZip } from "./zip.js";

export interface RefreshTemplatesOptions {
  allowHeuristicRuntimeMetadata?: boolean;
  image?: string;
  jar?: string;
  out: string;
  serverVersion?: string;
}

export function refreshTemplates(options: RefreshTemplatesOptions): void {
  const source = readSourceJar(options);
  const zipEntries = readZip(source.jar);
  const openApi = readJsonEntry(zipEntries, "BOOT-INF/classes/openapi.json");
  const iosSystemAppsEntry = zipEntries.find((entry) => entry.name === "BOOT-INF/classes/config/ios-system-apps.yml");
  const iosSystemApps = readYamlEntry(zipEntries, "BOOT-INF/classes/config/ios-system-apps.yml");
  const springConfigurationMetadataEntry = zipEntries.find((entry) => entry.name === "META-INF/spring-configuration-metadata.json");
  const springConfigurationMetadata = readOptionalJsonEntry(zipEntries, "META-INF/spring-configuration-metadata.json");
  const runtimeMetadata = reflectRuntimeMetadata(source.jar);
  if (runtimeMetadata.length === 0 && options.allowHeuristicRuntimeMetadata !== true) {
    throw new Error("Runtime metadata reflection failed; rerun with --allow-heuristic-runtime-metadata to generate heuristic template metadata");
  }
  const bundle = createTemplateBundle({
    openApi,
    iosSystemApps,
    springConfigurationMetadata,
    runtimeMetadata,
    serverVersion: options.serverVersion ?? source.serverVersion,
    sourceImage: source.image,
    sourceImageDigest: source.imageDigest,
    refreshDiagnostics: {
      runtimeMetadata: {
        source: runtimeMetadata.length > 0 ? "reflected" : "heuristic",
        reflectedCount: runtimeMetadata.length,
        configurationTypeCount: runtimeMetadata.length,
      },
      iosSystemAppsLoaded: iosSystemAppsEntry !== undefined,
      springConfigurationMetadataLoaded: springConfigurationMetadataEntry !== undefined,
    },
  });

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(bundle, null, 2)}\n`);
}

interface SourceJar {
  jar: Buffer;
  image: string;
  imageDigest: string;
  serverVersion: string;
}

interface ZipEntryLike {
  name: string;
  data: Buffer;
}

function readSourceJar(options: RefreshTemplatesOptions): SourceJar {
  if (options.jar !== undefined) {
    const serverVersion = options.serverVersion ?? "unknown";
    return {
      jar: readFileSync(options.jar),
      image: options.image ?? "local-jar",
      imageDigest: "unknown",
      serverVersion,
    };
  }

  const image = options.image ?? "relution/relution:26.1.1";
  const jar = execFileSync("docker", ["run", "--rm", "--entrypoint", "cat", image, "/opt/relution/lib/relution-exec.jar"], {
    maxBuffer: 512 * 1024 * 1024,
  });
  const imageDigest = inspectImageDigest(image);
  return {
    jar,
    image,
    imageDigest,
    serverVersion: options.serverVersion ?? versionFromImage(image),
  };
}

function inspectImageDigest(image: string): string {
  try {
    const output = execFileSync("docker", ["image", "inspect", image], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(output) as unknown;
    if (!Array.isArray(parsed)) {
      return "unknown";
    }
    const first = parsed[0] as Record<string, unknown> | undefined;
    const repoDigests = first?.RepoDigests;
    if (Array.isArray(repoDigests) && typeof repoDigests[0] === "string") {
      return repoDigests[0];
    }
    const id = first?.Id;
    return typeof id === "string" ? id : "unknown";
  } catch {
    return "unknown";
  }
}

function versionFromImage(image: string): string {
  const tag = image.split(":").at(-1);
  return tag !== undefined && tag !== image ? tag : "unknown";
}

function readJsonEntry(entries: ZipEntryLike[], name: string): JsonObject {
  const entry = entries.find((candidate) => candidate.name === name);
  if (entry === undefined) {
    throw new Error(`Missing ${name}`);
  }
  const parsed = JSON.parse(entry.data.toString("utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name} is not a JSON object`);
  }
  return parsed as JsonObject;
}

function readOptionalJsonEntry(entries: ZipEntryLike[], name: string): unknown {
  const entry = entries.find((candidate) => candidate.name === name);
  if (entry === undefined) {
    return {};
  }
  return JSON.parse(entry.data.toString("utf8")) as unknown;
}

function readYamlEntry(entries: ZipEntryLike[], name: string): unknown {
  const entry = entries.find((candidate) => candidate.name === name);
  if (entry === undefined) {
    return [];
  }
  return yaml.load(entry.data.toString("utf8"));
}

function reflectRuntimeMetadata(jar: Buffer): RuntimeConfigurationTypeMetadata[] {
  const workDir = mkdtempSync(join(tmpdir(), "relution-template-refresh-"));
  try {
    const entries = readZip(jar);
    if (!entries.some((entry) => entry.name.startsWith("BOOT-INF/classes/") && entry.name.endsWith(".class"))) {
      return [];
    }
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

    const helperPath = join(workDir, "ConfigurationTypeDump.java");
    writeFileSync(helperPath, JAVA_HELPER);
    runJdk(workDir, ["javac", "-cp", "classes:lib/*", "ConfigurationTypeDump.java"]);
    const output = runJdk(workDir, ["java", "-cp", ".:classes:lib/*", "ConfigurationTypeDump"]);
    const parsed = JSON.parse(output) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("ConfigurationTypeDump did not return an array");
    }
    return parsed.filter(isRuntimeMetadata);
  } catch (error) {
    console.warn(`Runtime metadata reflection failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export function resolveTemplateRefreshEntryTarget(root: string, relativePath: string): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, relativePath);
  if (target === resolvedRoot || target.startsWith(`${resolvedRoot}${sep}`)) {
    return target;
  }
  throw new Error(`Template refresh entry escapes extraction root: ${relativePath}`);
}

function runJdk(workDir: string, command: string[]): string {
  return execFileSync(
    "docker",
    ["run", "--rm", "-v", `${workDir}:/work`, "-w", "/work", "eclipse-temurin:21-jdk", ...command],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
}

function isRuntimeMetadata(value: unknown): value is RuntimeConfigurationTypeMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.type === "string" &&
    Array.isArray(record.platforms) &&
    Array.isArray(record.enrollmentTypes) &&
    typeof record.multiConfig === "boolean" &&
    Array.isArray(record.placeholders) &&
    typeof record.portalHidden === "boolean"
  );
}

const JAVA_HELPER = `
import com.mwaysolutions.relution.mdm.policy.domain.ConfigurationType;
import java.util.Collection;
import java.util.Iterator;

public class ConfigurationTypeDump {
  public static void main(String[] args) {
    StringBuilder out = new StringBuilder();
    out.append("[");
    boolean first = true;
    for (ConfigurationType type : ConfigurationType.values()) {
      if (!first) out.append(",");
      first = false;
      out.append("{");
      property(out, "type", type.name()).append(",");
      arrayProperty(out, "platforms", type.getPlatforms()).append(",");
      arrayProperty(out, "enrollmentTypes", type.getEnrollmentTypes()).append(",");
      property(out, "multiConfig", type.isMultiConfig()).append(",");
      arrayProperty(out, "placeholders", type.getPlaceholders()).append(",");
      property(out, "portalHidden", ConfigurationType.PORTAL_HIDDEN_TYPES.contains(type));
      out.append("}");
    }
    out.append("]");
    System.out.print(out.toString());
  }

  private static StringBuilder property(StringBuilder out, String name, String value) {
    return out.append("\\\"").append(escape(name)).append("\\\":\\\"").append(escape(value)).append("\\\"");
  }

  private static StringBuilder property(StringBuilder out, String name, boolean value) {
    return out.append("\\\"").append(escape(name)).append("\\\":").append(value ? "true" : "false");
  }

  private static StringBuilder arrayProperty(StringBuilder out, String name, Collection<?> values) {
    out.append("\\\"").append(escape(name)).append("\\\":[");
    Iterator<?> iterator = values.iterator();
    boolean first = true;
    while (iterator.hasNext()) {
      if (!first) out.append(",");
      first = false;
      Object value = iterator.next();
      out.append("\\\"").append(escape(String.valueOf(value))).append("\\\"");
    }
    return out.append("]");
  }

  private static String escape(String value) {
    return value.replace("\\\\", "\\\\\\\\").replace("\\\"", "\\\\\\\"");
  }
}
`;
