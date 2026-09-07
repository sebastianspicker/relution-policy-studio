/** Renders configuration picker filtering, grouped options, and selection actions. */
import type { JSX } from "react";
import { ConfigurationPickerOptions } from "./ConfigurationPickerOptions.js";
import type { ConfigurationPickerContentProps } from "./configuration-picker-contract.js";
import { ADD_GROUP_LABELS } from "./configuration-picker-options.js";
import type { AddGroup } from "../../shared/editor-contracts.js";

export function ConfigurationPickerContent(props: ConfigurationPickerContentProps): JSX.Element {
  const selectedVisible = props.filtered.some((option) => option.value === props.selectedType);
  const selectedOption = props.allOptions.find((option) => option.value === props.selectedType);
  return (
    <>
      <PickerFilters {...props} />
      <ConfigurationPickerOptions {...props} />
      <footer className="config-picker-footer">
        {selectedVisible && selectedOption !== undefined ? (
          <span className="config-picker-selection"><strong>{selectedOption.label}</strong><span className="config-card-meta">{selectedOption.meta}</span><span className="config-card-meta">Double-click or press Enter to add.</span></span>
        ) : <span className="config-picker-hint">Select a configuration above, or double-click to add immediately.</span>}
        <div className="config-picker-actions"><button type="button" onClick={props.onClose}>Cancel</button><button type="button" className="btn-primary" disabled={!selectedVisible} onClick={props.onAdd}>Add configuration</button></div>
      </footer>
    </>
  );
}

type PickerProps = Parameters<typeof ConfigurationPickerContent>[0];

function PickerFilters(props: PickerProps): JSX.Element {
  const groups = ["native", "apple-compat", "apple-profile", ...(props.customSettingsAvailable ? ["custom-settings"] : [])] as Exclude<AddGroup, "all">[];
  return (
    <div className="config-picker-search">
      <input ref={props.searchRef} name="configuration-search" type="search" autoComplete="off" aria-label="Search configurations" placeholder="Search configurations…" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} />
      <div className="config-picker-groups recommendation-source-switcher" role="group" aria-label="Filter by source">
        <button type="button" className={props.group === "all" ? "active" : ""} onClick={() => props.onGroupChange("all")}>All ({props.allOptions.length})</button>
        {groups.map((group) => <button key={group} type="button" className={props.group === group ? "active" : ""} onClick={() => props.onGroupChange(group)}>{ADD_GROUP_LABELS[group]} ({props.allOptions.filter((option) => option.group === group).length})</button>)}
      </div>
    </div>
  );
}
