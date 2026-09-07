import type { JSX } from "react";
import type { Protocol } from "./relution-dashboard-types.js";
import type { ZammadConnectionProps } from "./relution-dashboard-zammad-contract.js";

export function ZammadConnectionForm(props: ZammadConnectionProps): JSX.Element {
  return (
    <div className="audit-form-grid audit-form-grid--zammad">
      <label><span>Protocol</span><select name="zammad-protocol" value={props.protocol} onChange={(event) => props.onProtocol(event.target.value as Protocol)}><option value="https">https</option><option value="http">http</option></select></label>
      <label><span>Server</span><input name="zammad-host" autoComplete="off" value={props.host} placeholder="zammad.example.org" onChange={(event) => props.onHost(event.target.value)} /></label>
      <label><span>Port</span><input name="zammad-port" autoComplete="off" value={props.port} inputMode="numeric" placeholder="443" onChange={(event) => props.onPort(event.target.value)} /></label>
      <label><span>API token</span><input name="zammad-api-token" type="password" value={props.token} autoComplete="off" onChange={(event) => props.onToken(event.target.value)} /></label>
      <label><span>Group</span><input name="zammad-group" autoComplete="off" value={props.group} onChange={(event) => props.onGroup(event.target.value)} /></label>
      <label><span>Customer</span><input name="zammad-customer" autoComplete="off" value={props.customer} placeholder="it@example.org" onChange={(event) => props.onCustomer(event.target.value)} /></label>
      <div className="audit-form-actions">
        <button
          type="button"
          disabled={props.loading || props.host.trim().length === 0 || props.token.trim().length === 0 || props.group.trim().length === 0 || props.customer.trim().length === 0}
          onClick={props.onSubmit}
        >
          Set Zammad
        </button>
        <button type="button" disabled={props.loading || !props.session.configured} onClick={props.onTest}>Test Zammad</button>
      </div>
    </div>
  );
}
