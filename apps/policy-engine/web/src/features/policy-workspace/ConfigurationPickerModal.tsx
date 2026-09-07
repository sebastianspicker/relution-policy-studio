/** Presents a filtered, keyboard-accessible policy configuration chooser. */
import { useEffect, useRef, type JSX } from "react";
import { ConfigurationPickerContent } from "./ConfigurationPickerContent.js";
import type { ConfigurationPickerModalProps } from "./configuration-picker-contract.js";
import { configurationOptions, groupConfigurationOptions, optionMatches } from "./configuration-picker-options.js";

/** Moves focus into the modal and restores the invoking control when it closes. */
export function ConfigurationPickerModal(props: ConfigurationPickerModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    if (dialogRef.current !== null && !dialogRef.current.open) dialogRef.current.showModal();
    searchRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected === true) previouslyFocused.focus();
    };
  }, []);

  const allOptions = configurationOptions(props);
  const filtered = allOptions.filter((option) => optionMatches(option, props.query, props.group));
  const groups = groupConfigurationOptions(filtered);

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>): void {
    if (event.target === dialogRef.current) props.onClose();
  }

  return (
    <dialog ref={dialogRef} className="config-picker-dialog" aria-label="Add configuration" onCancel={(event) => { event.preventDefault(); props.onClose(); }} onClick={handleBackdropClick}>
      <div className="config-picker-card">
        <header className="config-picker-header">
          <h2>Add configuration</h2>
          <button type="button" className="config-picker-close" aria-label="Close" onClick={props.onClose}>×</button>
        </header>
        <ConfigurationPickerContent
          searchRef={searchRef}
          query={props.query}
          group={props.group}
          customSettingsAvailable={props.customSettingsAvailable}
          allOptions={allOptions}
          filtered={filtered}
          groups={groups}
          selectedType={props.selectedType}
          onQueryChange={props.onQueryChange}
          onGroupChange={props.onGroupChange}
          onSelectedTypeChange={props.onSelectedTypeChange}
          onAdd={props.onAdd}
          onClose={props.onClose}
        />
      </div>
    </dialog>
  );
}
