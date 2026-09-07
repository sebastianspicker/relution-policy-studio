/** Defines the policy-specific configuration picker input and content contracts. */
import type { RefObject } from "react";
import type { AppleCompatSetting } from "../../../../src/browser/apple.js";
import type { AppleSchemaEntry } from "../../../../src/browser/apple.js";
import type { ConfigurationTemplate } from "../../../../src/browser/workspace.js";
import type { ConfigurationOption, ConfigurationOptionGroup } from "./configuration-picker-options.js";
import type { AddGroup } from "../../shared/editor-contracts.js";

export interface ConfigurationPickerModalProps {
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
  readonly onClose: () => void;
}

export interface ConfigurationPickerContentProps {
  readonly searchRef: RefObject<HTMLInputElement | null>;
  readonly query: string;
  readonly group: AddGroup;
  readonly customSettingsAvailable: boolean;
  readonly allOptions: readonly ConfigurationOption[];
  readonly filtered: readonly ConfigurationOption[];
  readonly groups: readonly ConfigurationOptionGroup[];
  readonly selectedType: string;
  readonly onQueryChange: (value: string) => void;
  readonly onGroupChange: (value: AddGroup) => void;
  readonly onSelectedTypeChange: (value: string) => void;
  readonly onAdd: () => void;
  readonly onClose: () => void;
}
