import { useEffect, useRef, type JSX } from "react";
import type { AppleCompatSetting } from "../../../src/apple-compat.js";
import type { AppleSchemaEntry } from "../../../src/apple-schema.js";
import type { ConfigurationTemplate } from "../../../src/templates.js";
import { configurationOptions, groupConfigurationOptions, optionMatches } from "./AddConfigurationControl.js";
import type { AddGroup } from "./types.js";

const ADD_GROUP_LABELS: Record<Exclude<AddGroup, "all">, string> = {
  native: "Relution native",
  "apple-compat": "Apple mobileconfig gaps",
  "apple-profile": "Apple schema profiles",
  "custom-settings": "Custom settings",
};

type ConfigurationPickerModalProps = {
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
};

export function ConfigurationPickerModal(props: ConfigurationPickerModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dialogRef.current !== null && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        props.onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [props.onClose]);

  const allOptions = configurationOptions(props);
  const filtered = allOptions.filter((opt) => optionMatches(opt, props.query, props.group));
  const groups = groupConfigurationOptions(filtered);
  const selectedVisible = filtered.some((opt) => opt.value === props.selectedType);
  const selectedOption = allOptions.find((opt) => opt.value === props.selectedType);

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>): void {
    if (event.target === dialogRef.current) {
      props.onClose();
    }
  }

  function parseAddGroup(value: string): AddGroup {
    return value === "native" || value === "apple-compat" || value === "apple-profile" || value === "custom-settings" ? value : "all";
  }

  return (
    <dialog ref={dialogRef} className="config-picker-dialog" aria-label="Add configuration" onClick={handleBackdropClick}>
      <div className="config-picker-card">
        <header className="config-picker-header">
          <h2>Add configuration</h2>
          <button type="button" className="config-picker-close" aria-label="Close" onClick={props.onClose}>
            ×
          </button>
        </header>

        <div className="config-picker-search">
          <input
            ref={searchRef}
            type="search"
            aria-label="Search configurations"
            placeholder="Search configurations…"
            value={props.query}
            onChange={(e) => props.onQueryChange(e.target.value)}
          />
          <div className="config-picker-groups recommendation-source-switcher" role="group" aria-label="Filter by source">
            <button
              type="button"
              className={props.group === "all" ? "active" : ""}
              onClick={() => props.onGroupChange("all")}
            >
              All ({allOptions.length})
            </button>
            {(["native", "apple-compat", "apple-profile", ...(props.customSettingsAvailable ? ["custom-settings"] : [])] as Exclude<AddGroup, "all">[]).map((g) => {
              const count = allOptions.filter((o) => o.group === g).length;
              return (
                <button
                  key={g}
                  type="button"
                  className={props.group === g ? "active" : ""}
                  onClick={() => props.onGroupChange(g)}
                >
                  {ADD_GROUP_LABELS[g]} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="config-picker-body" role="listbox" aria-label="Available configurations" aria-multiselectable="false">
          {filtered.length === 0 ? (
            <p className="config-picker-empty">No configurations match your search.</p>
          ) : (
            groups.map((optGroup) => (
              <section key={optGroup.group} className="config-picker-group">
                <h3 className="config-picker-group-label">{ADD_GROUP_LABELS[optGroup.group]}</h3>
                <div className="config-picker-grid">
                  {optGroup.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={props.selectedType === opt.value}
                      className={["config-picker-card-item", props.selectedType === opt.value ? "selected" : ""].filter(Boolean).join(" ")}
                      onClick={() => props.onSelectedTypeChange(opt.value)}
                      onDoubleClick={() => {
                        props.onSelectedTypeChange(opt.value);
                        props.onAdd();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          props.onSelectedTypeChange(opt.value);
                          props.onAdd();
                        }
                      }}
                    >
                      <span className="config-card-label">{opt.label}</span>
                      <span className="config-card-meta">{opt.meta}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <footer className="config-picker-footer">
          {selectedVisible && selectedOption !== undefined ? (
            <span className="config-picker-selection">
              <strong>{selectedOption.label}</strong>
              <span className="config-card-meta">{selectedOption.meta}</span>
              <span className="config-card-meta">Double-click or press Enter to add.</span>
            </span>
          ) : (
            <span className="config-picker-hint">Select a configuration above, or double-click to add immediately.</span>
          )}
          <div className="config-picker-actions">
            <button type="button" onClick={props.onClose}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!selectedVisible} onClick={props.onAdd}>
              Add configuration
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
