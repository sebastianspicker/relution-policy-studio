/** Strictly validates generated assurance catalogs and presets before they become selectable. */
import { isDeepStrictEqual } from "node:util";
import {
  type AssuranceApplicability,
  type AssuranceApplicabilityField,
  type AssuranceCatalog,
  type AssuranceConstraint,
  type AssuranceDisposition,
  type AssuranceMapping,
  type AssuranceMappingFamily,
  type AssuranceParameter,
  type AssuranceParameterValueType,
  type AssurancePredicateOperator,
  type AssurancePreset,
  type AssurancePresetCatalog,
  type AssuranceRecommendation,
  type AssuranceSource,
} from "./assurance-contracts.js";
import { assuranceCanonicalDigest, assuranceValueAtPointer, isAssurancePointer } from "./assurance-json.js";
import { asRecord, type JsonRecord } from "../platform/serialization/json-guards.js";
import { assertPlainJson } from "../platform/serialization/json-integrity.js";

const DIGEST = /^[a-f0-9]{64}$/u;
const APPLICABILITY_FIELDS = new Set<AssuranceApplicabilityField>(["platform", "osVersion", "enrollmentChannel", "deviceOwnership", "supervision"]);
const OPERATORS = new Set<AssurancePredicateOperator>(["equals", "atLeast", "atMost", "oneOf"]);
const CONSTRAINT_OPERATORS = new Set<AssuranceConstraint["operator"]>(["equals", "atLeast", "atMost", "oneOf", "containsAll"]);
const FAMILIES = new Set<AssuranceMappingFamily>(["relution-native", "apple-schema-profile", "apple-mobileconfig"]);
const DISPOSITIONS = new Set<AssuranceDisposition>(["supported", "parameter", "candidate", "organizational", "unsupported"]);
const PARAMETER_TYPES = new Set<AssuranceParameterValueType>(["boolean", "integer", "number", "string", "enum"]);

export function parseAssuranceCatalog(value: unknown): AssuranceCatalog {
  const record = requireRecord(value, "Assurance catalog");
  requireLiteral(record.schemaVersion, 1, "Assurance catalog schemaVersion");
  const sources = requireArray(record.sources, "Assurance catalog sources").map((entry, index) => parseSource(entry, index));
  assertUnique(sources.map((source) => source.sourceId), "assurance source id");
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const recommendations = requireArray(record.recommendations, "Assurance catalog recommendations")
    .map((entry, index) => parseRecommendation(entry, index, sourceById));
  assertUnique(recommendations.map((recommendation) => recommendation.id), "assurance recommendation id");
  const summary = requireRecord(record.summary, "Assurance catalog summary");
  assertPlainJson(summary, "Assurance catalog summary");
  return {
    schemaVersion: 1,
    artifactVersion: requireString(record.artifactVersion, "Assurance catalog artifactVersion"),
    generatedBy: requireString(record.generatedBy, "Assurance catalog generatedBy"),
    corpusDigest: requireDigest(record.corpusDigest, "Assurance catalog corpusDigest"),
    sourceCheckedAt: requireNullableDate(record.sourceCheckedAt, "Assurance catalog sourceCheckedAt"),
    freshnessClaim: requireString(record.freshnessClaim, "Assurance catalog freshnessClaim"),
    sources,
    recommendations,
    summary,
    reconciliationPath: requireString(record.reconciliationPath, "Assurance catalog reconciliationPath"),
    refreshReportPath: requireString(record.refreshReportPath, "Assurance catalog refreshReportPath"),
  };
}

export function parseAssurancePresetCatalog(value: unknown, catalog: AssuranceCatalog): AssurancePresetCatalog {
  const record = requireRecord(value, "Assurance preset catalog");
  requireLiteral(record.schemaVersion, 1, "Assurance preset schemaVersion");
  const artifactVersion = requireString(record.artifactVersion, "Assurance preset artifactVersion");
  const catalogArtifactVersion = requireString(record.catalogArtifactVersion, "Assurance preset catalogArtifactVersion");
  if (catalogArtifactVersion !== catalog.artifactVersion) throw new Error("Assurance preset catalog targets a different catalog artifact version");
  const catalogDigest = requireDigest(record.catalogDigest, "Assurance preset catalogDigest");
  if (catalogDigest !== assuranceCanonicalDigest(catalog)) throw new Error("Assurance preset catalog digest does not match the assurance catalog");
  const recommendations = new Map(catalog.recommendations.map((entry) => [entry.id, entry]));
  const presets = requireArray(record.presets, "Assurance presets").map((entry, index) => parsePreset(entry, index, recommendations));
  assertUnique(presets.map((preset) => preset.id), "assurance preset id");
  validatePresetInheritance(presets, recommendations);
  return { schemaVersion: 1, artifactVersion, catalogArtifactVersion, catalogDigest, presets };
}

function parseSource(value: unknown, index: number): AssuranceSource {
  const record = requireRecord(value, `Assurance source ${String(index)}`);
  const source: AssuranceSource = {
    sourceId: requireString(record.sourceId, "Assurance source sourceId"),
    title: requireString(record.title, "Assurance source title"),
    edition: requireString(record.edition, "Assurance source edition"),
    publicationDate: requireNullableDate(record.publicationDate, "Assurance source publicationDate"),
    retrievedAt: requireNullableDate(record.retrievedAt, "Assurance source retrievedAt"),
    lastCheckedAt: requireNullableDate(record.lastCheckedAt, "Assurance source lastCheckedAt"),
    jurisdiction: requireString(record.jurisdiction, "Assurance source jurisdiction"),
    authority: requireString(record.authority, "Assurance source authority"),
    url: requireHttpsUrl(record.url, "Assurance source url"),
    license: requireString(record.license, "Assurance source license"),
    digest: requireDigest(record.digest, "Assurance source digest"),
    snapshot: parseSourceSnapshot(record.snapshot, `Assurance source ${String(index)}`),
    refresh: parseRefresh(record.refresh, `Assurance source ${String(index)}`),
  };
  return source;
}

function parseRecommendation(
  value: unknown,
  index: number,
  sources: ReadonlyMap<string, AssuranceSource>,
): AssuranceRecommendation {
  const label = `Assurance recommendation ${String(index)}`;
  const record = requireRecord(value, label);
  const sourceId = requireString(record.sourceId, `${label} sourceId`);
  const sourceRecommendationId = requireString(record.sourceRecommendationId, `${label} sourceRecommendationId`);
  const sourceFamily = requireEnum(record.sourceFamily, new Set<AssuranceRecommendation["sourceFamily"]>(["bsi", "cis", "vendor"]), `${label} sourceFamily`);
  const id = requireString(record.id, `${label} id`);
  if (id !== `${sourceFamily}:${sourceRecommendationId}`) throw new Error(`${label} id must bind its source family and recommendation identity`);
  const source = sources.get(sourceId);
  if (source === undefined) throw new Error(`${label} refers to unknown source ${sourceId}`);
  const disposition = requireEnum(record.disposition, DISPOSITIONS, `${label} disposition`);
  const selectable = requireBoolean(record.selectable, `${label} selectable`);
  const applicability = parseApplicability(record.applicability, label);
  const mapping = record.mapping === undefined ? undefined : parseMapping(record.mapping, label);
  const constraints = requireArray(record.constraints, `${label} constraints`).map((entry, constraintIndex) => parseConstraint(entry, `${label} constraint ${String(constraintIndex)}`));
  const parameters = requireArray(record.parameters, `${label} parameters`).map((entry, parameterIndex) => parseParameter(entry, `${label} parameter ${String(parameterIndex)}`));
  assertUnique(parameters.map((parameter) => parameter.id), `${label} parameter id`);
  assertUnique(parameters.map((parameter) => parameter.path), `${label} parameter path`);
  const provenance = requireRecord(record.provenance, `${label} provenance`);
  if (requireString(provenance.sourceId, `${label} provenance sourceId`) !== sourceId
    || requireString(provenance.sourceRecommendationId, `${label} provenance sourceRecommendationId`) !== sourceRecommendationId
    || requireDigest(provenance.sourceDigest, `${label} provenance sourceDigest`) !== source.digest) {
    throw new Error(`${label} provenance does not match its source identity and digest`);
  }
  const evidence = requireStringArray(provenance.evidence, `${label} provenance evidence`);
  if (!evidence.includes(sourceId) || evidence.some((evidenceSourceId) => !sources.has(evidenceSourceId))) {
    throw new Error(`${label} provenance evidence contains an unknown source or omits its primary source`);
  }
  const detailReference = requireRecord(record.detailReference, `${label} detailReference`);
  const recommendation: AssuranceRecommendation = {
    id,
    sourceId,
    sourceFamily,
    sourceRecommendationId,
    title: requireString(record.title, `${label} title`),
    platform: requireString(record.platform, `${label} platform`),
    disposition,
    selectable,
    applicability,
    ...(mapping === undefined ? {} : { mapping }),
    constraints,
    parameters,
    provenance: { sourceId, sourceRecommendationId, sourceDigest: source.digest, evidence },
    dispositionReasons: requireStringArray(record.dispositionReasons, `${label} dispositionReasons`),
    detailReference: {
      detailsPath: requireString(detailReference.detailsPath, `${label} detailReference detailsPath`),
      lookupId: requireString(detailReference.lookupId, `${label} detailReference lookupId`),
      ...(detailReference.endpoint === undefined ? {} : { endpoint: requireString(detailReference.endpoint, `${label} detail endpoint`) }),
      ...(detailReference.recommendationId === undefined ? {} : { recommendationId: requireString(detailReference.recommendationId, `${label} detail recommendationId`) }),
      ...(detailReference.snapshotScoped === undefined ? {} : { snapshotScoped: requireBoolean(detailReference.snapshotScoped, `${label} snapshotScoped`) }),
    },
    rationale: requireNullableString(record.rationale, `${label} rationale`),
    impact: requireNullableString(record.impact, `${label} impact`),
    prerequisites: requireStringArray(record.prerequisites, `${label} prerequisites`),
    requirementStrength: requireEnum(record.requirementStrength, new Set(["must", "should", "may", "not-stated"]), `${label} requirementStrength`),
    errata: parseErrata(record.errata, label),
    refresh: parseRefresh(record.refresh, label),
  };
  validateSelectableRecommendation(recommendation, label);
  if (recommendation.detailReference.lookupId !== recommendation.id) throw new Error(`${label} detail lookup id must match its recommendation id`);
  return recommendation;
}

function validateSelectableRecommendation(recommendation: AssuranceRecommendation, label: string): void {
  if (!recommendation.selectable) return;
  if (recommendation.disposition !== "supported" && recommendation.disposition !== "parameter") {
    throw new Error(`${label} is selectable without a supported or parameterized disposition`);
  }
  if (recommendation.mapping === undefined || Object.keys(recommendation.mapping.values).length === 0) throw new Error(`${label} is selectable without one non-empty exact mapping`);
  if (recommendation.constraints.length === 0) throw new Error(`${label} is selectable without constraints`);
  if (recommendation.provenance.evidence.length === 0) throw new Error(`${label} is selectable without provenance evidence`);
  if ((recommendation.applicability.unresolvedRequirements?.length ?? 0) > 0) throw new Error(`${label} has unresolved applicability requirements`);
  const platformPredicate = recommendation.applicability.predicates.find((predicate) => predicate.field === "platform");
  if (platformPredicate === undefined || !predicateIncludes(platformPredicate.value, recommendation.platform)) {
    throw new Error(`${label} does not bind applicability to its platform`);
  }
  const parameterPaths = new Set(recommendation.parameters.map((parameter) => parameter.path));
  const constraintPaths = new Set(recommendation.constraints.map((constraint) => constraint.path));
  for (const path of leafPointers(recommendation.mapping.values)) {
    if (!constraintPaths.has(path)) throw new Error(`${label} mapping value is not covered by a source constraint: ${path}`);
  }
  for (const constraint of recommendation.constraints) {
    if (assuranceValueAtPointer(recommendation.mapping.values, constraint.path) === undefined && !parameterPaths.has(constraint.path)) {
      throw new Error(`${label} constraint path is absent from mapping values and parameters: ${constraint.path}`);
    }
  }
}

function parseApplicability(value: unknown, label: string): AssuranceApplicability {
  const record = requireRecord(value, `${label} applicability`);
  requireLiteral(record.operator, "all", `${label} applicability operator`);
  const predicates = requireArray(record.predicates, `${label} applicability predicates`).map((entry, index) => {
    const predicate = requireRecord(entry, `${label} applicability predicate ${String(index)}`);
    const field = requireEnum(predicate.field, APPLICABILITY_FIELDS, `${label} applicability field`);
    const operator = requireEnum(predicate.operator, OPERATORS, `${label} applicability operator`);
    const predicateValue = operator === "oneOf"
      ? requireStringArray(predicate.value, `${label} applicability oneOf value`, true)
      : requireString(predicate.value, `${label} applicability value`);
    if ((operator === "atLeast" || operator === "atMost") && field !== "osVersion") {
      throw new Error(`${label} applicability version operator is only valid for osVersion`);
    }
    return { field, operator, value: predicateValue };
  });
  return { operator: "all", predicates,
    ...(record.unresolvedRequirements === undefined ? {} : { unresolvedRequirements: requireStringArray(record.unresolvedRequirements, `${label} unresolved applicability requirements`) }) };
}

function parseMapping(value: unknown, label: string): AssuranceMapping {
  const record = requireRecord(value, `${label} mapping`);
  const values = requireRecord(record.values, `${label} mapping values`);
  assertPlainJson(values, `${label} mapping values`);
  assertSafeObjectKeys(values, `${label} mapping values`);
  const instanceId = record.instanceId === undefined ? undefined : requireString(record.instanceId, `${label} mapping instanceId`);
  return {
    family: requireEnum(record.family, FAMILIES, `${label} mapping family`),
    target: requireString(record.target, `${label} mapping target`),
    values,
    ...(instanceId === undefined ? {} : { instanceId }),
  };
}

function parseConstraint(value: unknown, label: string): AssuranceConstraint {
  const record = requireRecord(value, label);
  const path = record.path;
  if (!isAssurancePointer(path)) throw new Error(`${label} path must be a valid JSON pointer`);
  const operator = requireEnum(record.operator, CONSTRAINT_OPERATORS, `${label} operator`);
  if (record.value === undefined) throw new Error(`${label} value is required`);
  assertPlainJson(record.value, `${label} value`);
  if ((operator === "oneOf" || operator === "containsAll") && (!Array.isArray(record.value) || record.value.length === 0)) throw new Error(`${label} ${operator} value must be a non-empty array`);
  if ((operator === "atLeast" || operator === "atMost") && typeof record.value !== "number") throw new Error(`${label} numeric constraint requires a number`);
  const strength = record.strength === undefined ? undefined : requireRecord(record.strength, `${label} strength`);
  return { path, operator, value: record.value, ...(strength === undefined ? {} : { strength: {
    comparison: requireEnum(strength.comparison, new Set(["exact", "ordered", "set", "unknown"]), `${label} strength comparison`),
    strongerDirection: requireEnum(strength.strongerDirection, new Set(["not-defined", "higher", "lower", "superset"]), `${label} stronger direction`),
  } }) };
}

function parseParameter(value: unknown, label: string): AssuranceParameter {
  const record = requireRecord(value, label);
  const path = record.path;
  if (!isAssurancePointer(path)) throw new Error(`${label} path must be a valid JSON pointer`);
  const valueType = requireEnum(record.valueType, PARAMETER_TYPES, `${label} valueType`);
  const parameter: AssuranceParameter = {
    id: requireString(record.id, `${label} id`),
    path,
    label: requireString(record.label, `${label} label`),
    required: requireBoolean(record.required, `${label} required`),
    valueType,
    ...(record.defaultValue === undefined ? {} : { defaultValue: record.defaultValue }),
    ...(record.allowedValues === undefined ? {} : { allowedValues: requireArray(record.allowedValues, `${label} allowedValues`) }),
    ...(record.minimum === undefined ? {} : { minimum: requireFiniteNumber(record.minimum, `${label} minimum`) }),
    ...(record.maximum === undefined ? {} : { maximum: requireFiniteNumber(record.maximum, `${label} maximum`) }),
  };
  if (parameter.allowedValues !== undefined && parameter.allowedValues.length === 0) throw new Error(`${label} allowedValues must not be empty`);
  if (parameter.minimum !== undefined && parameter.maximum !== undefined && parameter.minimum > parameter.maximum) throw new Error(`${label} minimum exceeds maximum`);
  if (parameter.defaultValue !== undefined) validateParameterValue(parameter, parameter.defaultValue, `${label} defaultValue`);
  return parameter;
}

export function validateParameterValue(parameter: AssuranceParameter, value: unknown, label = parameter.id): void {
  const validType = parameter.valueType === "boolean" ? typeof value === "boolean"
    : parameter.valueType === "integer" ? Number.isSafeInteger(value)
      : parameter.valueType === "number" ? typeof value === "number" && Number.isFinite(value)
        : parameter.valueType === "string" ? typeof value === "string"
          : parameter.allowedValues?.some((candidate) => Object.is(candidate, value)) === true;
  if (!validType) throw new Error(`${label} has an invalid ${parameter.valueType} value`);
  if (typeof value === "number" && parameter.minimum !== undefined && value < parameter.minimum) throw new Error(`${label} is below its minimum`);
  if (typeof value === "number" && parameter.maximum !== undefined && value > parameter.maximum) throw new Error(`${label} exceeds its maximum`);
  if (parameter.allowedValues !== undefined && !parameter.allowedValues.some((candidate) => Object.is(candidate, value))) throw new Error(`${label} is not an allowed value`);
}

function parsePreset(value: unknown, index: number, recommendations: ReadonlyMap<string, AssuranceRecommendation>): AssurancePreset {
  const label = `Assurance preset ${String(index)}`;
  const record = requireRecord(value, label);
  const selections = requireArray(record.selections, `${label} selections`).map((entry, selectionIndex) => {
    const selectionLabel = `${label} selection ${String(selectionIndex)}`;
    const selection = requireRecord(entry, selectionLabel);
    const recommendationId = requireString(selection.recommendationId, `${selectionLabel} recommendationId`);
    const recommendation = recommendations.get(recommendationId);
    if (recommendation?.selectable !== true) throw new Error(`${selectionLabel} does not identify a selectable recommendation`);
    const fixedValues = parsePointerRecord(selection.fixedValues, `${selectionLabel} fixedValues`);
    const parameterDefaults = requireRecord(selection.parameterDefaults, `${selectionLabel} parameterDefaults`);
    assertPlainJson(parameterDefaults, `${selectionLabel} parameterDefaults`);
    const parameters = new Map(recommendation.parameters.map((parameter) => [parameter.id, parameter]));
    for (const path of Object.keys(fixedValues)) {
      if (assuranceValueAtPointer(recommendation.mapping!.values, path) === undefined && ![...parameters.values()].some((parameter) => parameter.path === path)) {
        throw new Error(`${selectionLabel} fixed value path is absent from its recommendation mapping: ${path}`);
      }
    }
    for (const [parameterId, parameterValue] of Object.entries(parameterDefaults)) {
      const parameter = parameters.get(parameterId);
      if (parameter === undefined) throw new Error(`${selectionLabel} has an unknown parameter default: ${parameterId}`);
      validateParameterValue(parameter, parameterValue, `${selectionLabel} parameter ${parameterId}`);
      if (Object.hasOwn(fixedValues, parameter.path)) throw new Error(`${selectionLabel} overlaps fixed value and parameter path ${parameter.path}`);
    }
    const settingRationales = parseStringPointerRecord(selection.settingRationales, `${selectionLabel} settingRationales`);
    const overrideJustifications = parseNullableStringPointerRecord(selection.overrideJustifications, `${selectionLabel} overrideJustifications`);
    for (const path of Object.keys(fixedValues)) {
      if (settingRationales[path] === undefined) throw new Error(`${selectionLabel} lacks a rationale for fixed value ${path}`);
      if (!Object.hasOwn(overrideJustifications, path)) throw new Error(`${selectionLabel} lacks an override justification decision for ${path}`);
      if (!isDeepStrictEqual(fixedValues[path], assuranceValueAtPointer(recommendation.mapping!.values, path))
        && overrideJustifications[path] === null) {
        throw new Error(`${selectionLabel} lacks an override justification for changed value ${path}`);
      }
    }
    for (const path of Object.keys(settingRationales)) {
      if (!Object.hasOwn(fixedValues, path)) throw new Error(`${selectionLabel} has a rationale without a fixed value: ${path}`);
    }
    const parameterDefaultPaths = new Set(Object.keys(parameterDefaults).map((parameterId) => parameters.get(parameterId)!.path));
    for (const path of Object.keys(overrideJustifications)) {
      if (!Object.hasOwn(fixedValues, path) && !parameterDefaultPaths.has(path)) {
        throw new Error(`${selectionLabel} has an override decision without a fixed value or parameter default: ${path}`);
      }
    }
    return { recommendationId, fixedValues, parameterDefaults, settingRationales, overrideJustifications };
  });
  assertUnique(selections.map((selection) => selection.recommendationId), `${label} recommendation selection`);
  const exclusions = requireArray(record.exclusions, `${label} exclusions`).map((entry, exclusionIndex) => {
    const exclusion = requireRecord(entry, `${label} exclusion ${String(exclusionIndex)}`);
    return {
      recommendationId: requireString(exclusion.recommendationId, `${label} exclusion recommendationId`),
      reason: requireString(exclusion.reason, `${label} exclusion reason`),
    };
  });
  return {
    id: requireString(record.id, `${label} id`),
    ...(record.description === undefined ? {} : { description: requireString(record.description, `${label} description`) }),
    ...(record.rationale === undefined ? {} : { rationale: requireString(record.rationale, `${label} rationale`) }),
    ...(record.profileOrigin === undefined ? {} : { profileOrigin: requireString(record.profileOrigin, `${label} profileOrigin`) }),
    ...(record.authorityClaim === undefined ? {} : { authorityClaim: requireString(record.authorityClaim, `${label} authorityClaim`) }),
    version: requireString(record.version, `${label} version`),
    title: requireString(record.title, `${label} title`),
    inherits: record.inherits === null ? null : requireString(record.inherits, `${label} inherits`),
    selections,
    exclusions,
    requiresReadinessReview: requireBoolean(record.requiresReadinessReview, `${label} requiresReadinessReview`),
    prerequisites: requireStringArray(record.prerequisites, `${label} prerequisites`),
    impact: requireNullableString(record.impact, `${label} impact`),
  };
}

function validatePresetInheritance(
  presets: readonly AssurancePreset[],
  recommendations: ReadonlyMap<string, AssuranceRecommendation>,
): void {
  const byId = new Map(presets.map((preset) => [preset.id, preset]));
  for (const preset of presets) {
    const seen = new Set([preset.id]);
    const chain = [preset];
    let current = preset;
    while (current.inherits !== null) {
      const parent = byId.get(current.inherits);
      if (parent === undefined) throw new Error(`Assurance preset ${current.id} inherits unknown preset ${current.inherits}`);
      if (seen.has(parent.id)) throw new Error(`Assurance preset inheritance cycle contains ${parent.id}`);
      seen.add(parent.id);
      chain.unshift(parent);
      current = parent;
    }
    const selected = new Set<string>();
    for (const member of chain) {
      for (const selection of member.selections) {
        selected.add(selection.recommendationId);
      }
    }
    assertUnique(preset.exclusions.map((entry) => entry.recommendationId), `Assurance preset ${preset.id} exclusion`);
    const excluded = new Set<string>();
    for (const exclusion of preset.exclusions) {
      if (!recommendations.has(exclusion.recommendationId)) {
        throw new Error(`Assurance preset ${preset.id} excludes unknown recommendation ${exclusion.recommendationId}`);
      }
      if (selected.has(exclusion.recommendationId)) {
        throw new Error(`Assurance preset ${preset.id} both selects and excludes ${exclusion.recommendationId}`);
      }
      excluded.add(exclusion.recommendationId);
    }
    if (selected.size + excluded.size !== recommendations.size
      || [...recommendations.keys()].some((recommendationId) => !selected.has(recommendationId) && !excluded.has(recommendationId))) {
      throw new Error(`Assurance preset ${preset.id} does not classify every catalog recommendation exactly once`);
    }
  }
}

function parsePointerRecord(value: unknown, label: string): JsonRecord {
  const record = requireRecord(value, label);
  assertPlainJson(record, label);
  for (const key of Object.keys(record)) if (!isAssurancePointer(key)) throw new Error(`${label} key must be a valid JSON pointer: ${key}`);
  return record;
}

function parseStringPointerRecord(value: unknown, label: string): Readonly<Record<string, string>> {
  const record = parsePointerRecord(value, label);
  for (const [path, entry] of Object.entries(record)) requireString(entry, `${label} ${path}`);
  return record as Readonly<Record<string, string>>;
}

function parseNullableStringPointerRecord(value: unknown, label: string): Readonly<Record<string, string | null>> {
  const record = parsePointerRecord(value, label);
  for (const [path, entry] of Object.entries(record)) requireNullableString(entry, `${label} ${path}`);
  return record as Readonly<Record<string, string | null>>;
}

function parseErrata(value: unknown, label: string): AssuranceRecommendation["errata"] {
  const record = requireRecord(value, `${label} errata`);
  const entries = requireArray(record.entries, `${label} errata entries`).map((entry, index) => {
    const parsed = requireRecord(entry, `${label} errata entry ${String(index)}`);
    assertPlainJson(parsed, `${label} errata entry ${String(index)}`);
    return parsed;
  });
  const present = requireBoolean(record.present, `${label} errata present`);
  if (present !== (entries.length > 0)) throw new Error(`${label} errata presence does not match its entries`);
  return { present, entries };
}

function parseRefresh(value: unknown, label: string): AssuranceRecommendation["refresh"] {
  const record = requireRecord(value, `${label} refresh`);
  const checkedAt = record.checkedAt === null ? null : requireDate(record.checkedAt, `${label} refresh checkedAt`);
  return {
    freshnessState: requireEnum(record.freshnessState, new Set(["outdated", "unknown"]), `${label} refresh freshnessState`),
    checkedAt,
    outcome: requireString(record.outcome, `${label} refresh outcome`),
    reportPath: requireString(record.reportPath, `${label} refresh reportPath`),
  };
}

function parseSourceSnapshot(value: unknown, label: string): AssuranceSource["snapshot"] {
  const record = requireRecord(value, `${label} snapshot`);
  return {
    bodyDigestAvailable: requireBoolean(record.bodyDigestAvailable, `${label} snapshot bodyDigestAvailable`),
    localPath: requireNullableString(record.localPath, `${label} snapshot localPath`),
    digestKind: requireString(record.digestKind, `${label} snapshot digestKind`),
  };
}

function predicateIncludes(value: string | readonly string[], expected: string): boolean {
  return typeof value === "string" ? value === expected : value.includes(expected);
}

function leafPointers(value: JsonRecord, base = ""): string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = `${base}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
    const child = asRecord(entry);
    return child !== undefined && Object.keys(child).length > 0 ? leafPointers(child, path) : [path];
  });
}

function assertSafeObjectKeys(value: unknown, label: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeObjectKeys(entry, `${label}[${String(index)}]`));
    return;
  }
  const record = asRecord(value);
  if (record === undefined) return;
  for (const [key, entry] of Object.entries(record)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error(`${label} contains unsafe object key ${key}`);
    assertSafeObjectKeys(entry, `${label}.${key}`);
  }
}

function requireRecord(value: unknown, label: string): JsonRecord {
  const record = asRecord(value);
  if (record === undefined) throw new Error(`${label} must be an object`);
  return record;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireNullableString(value: unknown, label: string): string | null {
  return value === null ? null : requireString(value, label);
}

function requireStringArray(value: unknown, label: string, nonEmpty = false): string[] {
  const result = requireArray(value, label).map((entry) => requireString(entry, label));
  if (nonEmpty && result.length === 0) throw new Error(`${label} must not be empty`);
  return result;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function requireDate(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO date`);
  return text;
}

function requireNullableDate(value: unknown, label: string): string | null {
  return value === null ? null : requireDate(value, label);
}

function requireHttpsUrl(value: unknown, label: string): string {
  const text = requireString(value, label);
  let url: URL;
  try { url = new URL(text); } catch { throw new Error(`${label} must be an absolute URL`); }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  return text;
}

function requireDigest(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (!DIGEST.test(text)) throw new Error(`${label} must be a SHA-256 digest`);
  return text;
}

function requireLiteral<T extends string | number>(value: unknown, expected: T, label: string): asserts value is T {
  if (value !== expected) throw new Error(`${label} must be ${String(expected)}`);
}

function requireEnum<T extends string>(value: unknown, values: ReadonlySet<T>, label: string): T {
  if (typeof value !== "string" || !values.has(value as T)) throw new Error(`${label} is unsupported: ${String(value)}`);
  return value as T;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}
