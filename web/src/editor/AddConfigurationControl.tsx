import type { JSX } from "react";
import type { AppleCompatSetting } from "../../../src/apple-compat.js";
import type { AppleSchemaEntry } from "../../../src/apple-schema.js";
import type { ConfigurationTemplate } from "../../../src/templates.js";
import { APPLE_COMPAT_ADD_PREFIX, APPLE_SCHEMA_ADD_PREFIX, CUSTOM_SETTINGS_ADD_VALUE, NATIVE_ADD_PREFIX } from "./editor-utils.js";
import type { AddGroup } from "./types.js";

export type ConfigurationOption = {
  readonly group: Exclude<AddGroup, "all">;
  readonly value: string;
  readonly label: string;
  readonly meta: string;
};

export type ConfigurationOptionGroup = {
  readonly group: Exclude<AddGroup, "all">;
  readonly label: string;
  readonly options: readonly ConfigurationOption[];
};

const ADD_GROUP_ORDER: readonly Exclude<AddGroup, "all">[] = ["native", "apple-compat", "apple-profile", "custom-settings"];

const ADD_GROUP_LABELS: Record<Exclude<AddGroup, "all">, string> = {
  native: "Relution native",
  "apple-compat": "Apple mobileconfig gaps",
  "apple-profile": "Apple schema profiles",
  "custom-settings": "Custom settings",
};

export function AddConfigurationControl(props: {
  readonly availableTemplates: readonly ConfigurationTemplate[];
  readonly presentNativeTypes: readonly string[];
  readonly availableAppleCompatSettings: readonly AppleCompatSetting[];
  readonly availableAppleSchemaProfiles: readonly AppleSchemaEntry[];
  readonly customSettingsAvailable: boolean;
  readonly selectedType: string;
  readonly query: string;
  readonly group: AddGroup;
  readonly onSelectedTypeChange: (value: string) => void;
  readonly onQueryChange: (value: string) => void;
  readonly onGroupChange: (value: AddGroup) => void;
  readonly onAdd: () => void;
}): JSX.Element {
  const options = configurationOptions(props).filter((option) => optionMatches(option, props.query, props.group));
  const optionGroups = groupConfigurationOptions(options);
  const selectedOptionVisible = options.some((option) => option.value === props.selectedType);
  return (
    <div className="add-config">
      <input
        aria-label="Search configurations"
        placeholder="Search configurations"
        value={props.query}
        onChange={(event) => props.onQueryChange(event.target.value)}
      />
      <select aria-label="Configuration source" value={props.group} onChange={(event) => props.onGroupChange(parseAddGroup(event.target.value))}>
        <option value="all">All</option>
        <option value="native">Relution native</option>
        <option value="apple-compat">Apple mobileconfig gaps</option>
        <option value="apple-profile">Apple schema profiles</option>
        {props.customSettingsAvailable ? <option value="custom-settings">Custom settings</option> : null}
      </select>
      <select
        aria-label="Configuration template"
        value={selectedOptionVisible ? props.selectedType : ""}
        onChange={(event) => props.onSelectedTypeChange(event.target.value)}
      >
        <option value="">{options.length} matching configurations</option>
        {optionGroups.map((optionGroup) => (
          <optgroup key={optionGroup.group} label={`${optionGroup.label} (${optionGroup.options.length})`}>
            {optionGroup.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.meta})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button type="button" disabled={!selectedOptionVisible} onClick={props.onAdd}>
        Add
      </button>
    </div>
  );
}

export function optionMatches(option: ConfigurationOption, query: string, group: AddGroup): boolean {
  if (group !== "all" && option.group !== group) {
    return false;
  }
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }
  return `${option.label} ${option.meta}`.toLowerCase().includes(normalized);
}

export function groupConfigurationOptions(options: readonly ConfigurationOption[]): ConfigurationOptionGroup[] {
  return ADD_GROUP_ORDER.map((group) => ({
    group,
    label: ADD_GROUP_LABELS[group],
    options: options.filter((option) => option.group === group),
  })).filter((optionGroup) => optionGroup.options.length > 0);
}

export function configurationOptions(props: {
  readonly availableTemplates: readonly ConfigurationTemplate[];
  readonly presentNativeTypes: readonly string[];
  readonly availableAppleCompatSettings: readonly AppleCompatSetting[];
  readonly availableAppleSchemaProfiles: readonly AppleSchemaEntry[];
  readonly customSettingsAvailable: boolean;
}): ConfigurationOption[] {
  return [
    ...props.availableTemplates
      .filter((candidate) => candidate.multiConfig || !props.presentNativeTypes.includes(candidate.type))
      .map((candidate) => ({
        group: "native" as const,
        value: `${NATIVE_ADD_PREFIX}${candidate.type}`,
        label: candidate.label,
        meta: candidate.type,
      })),
    ...props.availableAppleCompatSettings.map((candidate) => ({
      group: "apple-compat" as const,
      value: `${APPLE_COMPAT_ADD_PREFIX}${candidate.id}`,
      label: `${candidate.label} *`,
      meta: candidate.payloadType,
    })),
    ...props.availableAppleSchemaProfiles.map((candidate) => ({
      group: "apple-profile" as const,
      value: `${APPLE_SCHEMA_ADD_PREFIX}${candidate.id}`,
      label: candidate.title,
      meta: candidate.identifier,
    })),
    ...(props.customSettingsAvailable
      ? [{ group: "custom-settings" as const, value: CUSTOM_SETTINGS_ADD_VALUE, label: "Application & Custom Settings", meta: "macOS" }]
      : []),
  ];
}

function parseAddGroup(value: string): AddGroup {
  return value === "native" || value === "apple-compat" || value === "apple-profile" || value === "custom-settings" ? value : "all";
}
