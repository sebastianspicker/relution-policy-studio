/** Renders one configuration row and its move/remove actions. */
import type { JSX } from "react";
import { findAppleCompatSettingForDetails } from "../../../../src/browser/apple.js";
import type { ConfigurationTemplate } from "../../../../src/browser/workspace.js";
import { asRecord } from "../../shared/editor-record-utils.js";
import type { Selection } from "../../shared/editor-contracts.js";

export function PolicyTreeConfiguration(props: {
  readonly configuration: unknown;
  readonly configurationIndex: number;
  readonly configurationCount: number;
  readonly policyIndex: number;
  readonly versionIndex: number;
  readonly selection: Selection | undefined;
  readonly templatesByType: ReadonlyMap<string, ConfigurationTemplate>;
  readonly onSelect: (selection: Selection) => void;
  readonly onMove: (selection: Selection, direction: "up" | "down") => void;
  readonly onRemove: (selection: Selection) => void;
}): JSX.Element {
  const row = configurationRenderModel(props);
  return (
    <div className="tree-item-row">
      <button className={row.className} onClick={() => props.onSelect(row.selection)}>
        <span className="tree-item-label">{row.label}</span>
        {renderConfigurationCount(row.controlCount)}
        {renderConfigurationMeta(row.meta)}
        {renderConfigurationControlCount(row.controlCount)}
      </button>
      <div className="tree-item-actions">
        <button type="button" className="icon-button" title="Move up" aria-label={`Move ${row.label} up`} disabled={row.moveUpDisabled} onClick={() => props.onMove(row.selection, "up")}>↑</button>
        <button type="button" className="icon-button" title="Move down" aria-label={`Move ${row.label} down`} disabled={row.moveDownDisabled} onClick={() => props.onMove(row.selection, "down")}>↓</button>
        <button type="button" className="icon-button" title="Remove" aria-label={`Remove ${row.label}`} onClick={() => props.onRemove(row.selection)}>×</button>
      </div>
    </div>
  );
}

function configurationRenderModel(props: {
  readonly configuration: unknown;
  readonly configurationIndex: number;
  readonly configurationCount: number;
  readonly policyIndex: number;
  readonly versionIndex: number;
  readonly selection: Selection | undefined;
  readonly templatesByType: ReadonlyMap<string, ConfigurationTemplate>;
}): {
  readonly active: boolean;
  readonly className: string;
  readonly controlCount: { readonly configured: number; readonly total: number } | undefined;
  readonly label: string;
  readonly meta: string | undefined;
  readonly moveDownDisabled: boolean;
  readonly moveUpDisabled: boolean;
  readonly selection: Selection;
} {
  const details = asRecord(asRecord(props.configuration)?.details);
  const type = configurationType(details);
  const template = props.templatesByType.get(type);
  const appleCompatSetting = findAppleCompatSettingForDetails(details);
  const selection = { policyIndex: props.policyIndex, versionIndex: props.versionIndex, configurationIndex: props.configurationIndex };
  const active = selectionMatches(props.selection, selection);
  return {
    active,
    className: active ? "tree-item tree-item-select active" : "tree-item tree-item-select",
    controlCount: configurationControlCount(details, template),
    label: configurationLabel(appleCompatSetting, template, type),
    meta: configurationMeta(appleCompatSetting, template, type),
    moveDownDisabled: props.configurationIndex >= props.configurationCount - 1,
    moveUpDisabled: props.configurationIndex === 0,
    selection,
  };
}

function configurationType(details: Readonly<Record<string, unknown>> | undefined): string {
  return typeof details?.type === "string" ? details.type : "UNKNOWN";
}

function configurationLabel(
  appleCompatSetting: ReturnType<typeof findAppleCompatSettingForDetails>,
  template: ConfigurationTemplate | undefined,
  type: string,
): string {
  return appleCompatSetting === undefined ? template?.label ?? type : `${appleCompatSetting.label} *`;
}

function configurationMeta(
  appleCompatSetting: ReturnType<typeof findAppleCompatSettingForDetails>,
  template: ConfigurationTemplate | undefined,
  type: string,
): string | undefined {
  if (appleCompatSetting !== undefined) return `APPLE_MOBILECONFIG / ${appleCompatSetting.payloadType}`;
  return template === undefined ? undefined : type;
}

function renderConfigurationCount(controlCount: { readonly configured: number; readonly total: number } | undefined): JSX.Element | null {
  if (controlCount === undefined) return null;
  return <span className="tree-count" aria-hidden="true">{controlCount.configured}</span>;
}

function renderConfigurationMeta(meta: string | undefined): JSX.Element | null {
  if (meta === undefined) return null;
  return <span className="tree-item-meta">{meta}</span>;
}

function renderConfigurationControlCount(controlCount: { readonly configured: number; readonly total: number } | undefined): JSX.Element | null {
  if (controlCount === undefined) return null;
  return <span className="tree-item-meta tree-item-meta--controls">{controlCount.configured} / {controlCount.total} controls</span>;
}

function configurationControlCount(
  details: Readonly<Record<string, unknown>> | undefined,
  template: ConfigurationTemplate | undefined,
): { readonly configured: number; readonly total: number } | undefined {
  if (template === undefined || template.fields.length === 0) return undefined;
  const total = template.fields.length;
  const configured = template.fields.filter((field) => {
    const value = details?.[field.path];
    return value !== undefined && value !== null && value !== "";
  }).length;
  return { configured, total };
}

function selectionMatches(selection: Selection | undefined, candidate: Selection): boolean {
  return selection?.policyIndex === candidate.policyIndex
    && selection.versionIndex === candidate.versionIndex
    && selection.configurationIndex === candidate.configurationIndex;
}
