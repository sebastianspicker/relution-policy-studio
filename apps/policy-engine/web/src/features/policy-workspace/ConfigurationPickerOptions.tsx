/** Renders grouped policy configuration choices and immediate add interactions. */
import type { JSX } from "react";
import type { ConfigurationPickerContentProps } from "./configuration-picker-contract.js";
import { ADD_GROUP_LABELS, type ConfigurationOption } from "./configuration-picker-options.js";

export function ConfigurationPickerOptions(props: ConfigurationPickerContentProps): JSX.Element {
  function selectAndAdd(option: ConfigurationOption): void {
    props.onSelectedTypeChange(option.value);
    props.onAdd();
  }
  return (
    <div className="config-picker-body" role="listbox" aria-label="Available configurations" aria-multiselectable="false">
      {props.filtered.length === 0 ? <p className="config-picker-empty">No configurations match your search.</p> : props.groups.map((optionGroup) => (
        <section key={optionGroup.group} className="config-picker-group">
          <h3 className="config-picker-group-label">{ADD_GROUP_LABELS[optionGroup.group]}</h3>
          <div className="config-picker-grid">
            {optionGroup.options.map((option) => (
              <button key={option.value} type="button" role="option" aria-selected={props.selectedType === option.value} className={["config-picker-card-item", props.selectedType === option.value ? "selected" : ""].filter(Boolean).join(" ")} onClick={() => props.onSelectedTypeChange(option.value)} onDoubleClick={() => selectAndAdd(option)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); selectAndAdd(option); } }}>
                <span className="config-card-label">{option.label}</span><span className="config-card-meta">{option.meta}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
