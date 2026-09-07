import type { JSX } from "react";
import type { Protocol } from "./relution-dashboard-types.js";
import { StatusChip } from "../../ui/StatusChip.js";

export interface RelutionConnectionSectionProps {
  readonly protocol: Protocol;
  readonly host: string;
  readonly port: string;
  readonly apiToken: string;
  readonly loading: boolean;
  readonly configured: boolean;
  readonly onProtocol: (value: Protocol) => void;
  readonly onHost: (value: string) => void;
  readonly onPort: (value: string) => void;
  readonly onToken: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onTest: () => void;
}

export function RelutionConnectionSection(props: RelutionConnectionSectionProps): JSX.Element {
  return (
    <details className="audit-disclosure" open>
      <summary>
        <span>Connection &amp; session</span>
        <StatusChip kind={props.configured ? "success" : "neutral"}>
          {props.configured ? "Configured" : "Not configured"}
        </StatusChip>
      </summary>
      <div className="audit-form-grid">
        <label>
          <span>Protocol</span>
          <select name="relution-protocol" value={props.protocol} onChange={(event) => props.onProtocol(event.target.value as Protocol)}>
            <option value="https">https</option>
            <option value="http">http</option>
          </select>
        </label>
        <label>
          <span>Server</span>
          <input name="relution-host" autoComplete="off" value={props.host} placeholder="relution.example.org" onChange={(event) => props.onHost(event.target.value)} />
        </label>
        <label>
          <span>Port</span>
          <input name="relution-port" autoComplete="off" value={props.port} inputMode="numeric" placeholder="443" onChange={(event) => props.onPort(event.target.value)} />
        </label>
        <label>
          <span>API token</span>
          <input name="relution-api-token" type="password" value={props.apiToken} autoComplete="off" onChange={(event) => props.onToken(event.target.value)} />
        </label>
        <div className="audit-form-actions">
          <button
            type="button"
            disabled={props.loading || props.host.trim().length === 0 || props.apiToken.trim().length === 0}
            onClick={props.onSubmit}
          >
            Set session
          </button>
          <button type="button" disabled={props.loading || !props.configured} onClick={props.onTest}>
            Test
          </button>
        </div>
      </div>
    </details>
  );
}
