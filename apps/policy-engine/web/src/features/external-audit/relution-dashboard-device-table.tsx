import type { JSX } from "react";
import type { RelutionDeviceAssessment } from "../../../../src/browser/integrations.js";
import { deviceKey } from "./relution-dashboard-findings-data.js";
import { StatusChip } from "../../ui/StatusChip.js";

export interface DeviceFindingTableProps {
  readonly assessments: readonly RelutionDeviceAssessment[];
  readonly selected: RelutionDeviceAssessment | undefined;
  readonly onSelect: (key: string) => void;
}

export function DeviceFindingTable(props: DeviceFindingTableProps): JSX.Element {
  return (
    <div className="audit-device-table-wrap">
      <table className="audit-device-table">
        <thead>
          <tr>
            <th scope="col">Device</th>
            <th scope="col">Platform</th>
            <th scope="col">Status</th>
            <th scope="col">Policy</th>
            <th scope="col">Last connection</th>
            <th scope="col">Issues</th>
            <th scope="col"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {props.assessments.map((entry) => (
            <DeviceFindingRow
              key={deviceKey(entry)}
              entry={entry}
              selected={entry === props.selected}
              onSelect={() => props.onSelect(deviceKey(entry))}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeviceFindingRow(props: {
  readonly entry: RelutionDeviceAssessment;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): JSX.Element {
  const { device, issues } = props.entry;
  return (
    <tr className={props.selected ? "audit-device-row audit-device-row--selected" : "audit-device-row"}>
      <td><strong>{device.name}</strong><small>{device.userEmail ?? device.userName ?? "Unknown user"}</small></td>
      <td>{device.platform ?? "Unknown"}</td>
      <td><StatusChip kind={assessmentStatusKind(props.entry.status)}>{props.entry.status}</StatusChip></td>
      <td>{device.policyStatus ?? "Unknown"}</td>
      <td>{lastConnectionText(device)}</td>
      <td>{issues.length}</td>
      <td><button type="button" aria-pressed={props.selected} onClick={props.onSelect}>View</button></td>
    </tr>
  );
}

function assessmentStatusKind(status: RelutionDeviceAssessment["status"]): "success" | "danger" | "warning" {
  if (status === "compliant") return "success";
  return status === "issue" ? "danger" : "warning";
}

function lastConnectionText(device: RelutionDeviceAssessment["device"]): string {
  const lastConnection = device.lastConnectionDate ?? "Unknown";
  return device.inactiveDays === undefined ? lastConnection : `${lastConnection} (${String(device.inactiveDays)}d)`;
}
