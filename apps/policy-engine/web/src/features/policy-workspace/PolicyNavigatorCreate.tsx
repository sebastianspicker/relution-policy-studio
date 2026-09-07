/** Renders the expandable new-policy form. */
import type { JSX } from "react";

export function PolicyNavigatorCreate(props: {
  readonly visible: boolean;
  readonly name: string;
  readonly platform: string;
  readonly platforms: readonly string[];
  readonly onNameChange: (name: string) => void;
  readonly onPlatformChange: (platform: string) => void;
  readonly onCreate: () => void;
  readonly onClose: () => void;
}): JSX.Element {
  function createPolicy(): void {
    props.onCreate();
    props.onClose();
  }
  return (
    <div className={props.visible ? "new-policy-form-wrapper new-policy-form-wrapper--open" : "new-policy-form-wrapper"}>
      <div className="new-policy-form">
        <label>
          <span className="field-label">Name</span>
          <input aria-label="New policy name" placeholder="Policy name" value={props.name} onChange={(event) => props.onNameChange(event.target.value)} />
        </label>
        <label>
          <span className="field-label">Platform</span>
          <select aria-label="New policy platform" value={props.platform} onChange={(event) => props.onPlatformChange(event.target.value)}>
            {props.platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
          </select>
        </label>
        <div className="new-policy-form-actions">
          <button type="button" className="btn-primary" onClick={createPolicy}>Create</button>
          <button type="button" onClick={props.onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
