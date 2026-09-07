/** Contracts shared by focused Relution editor route modules. */
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  RelutionAssessmentReport,
  RelutionDeviceQueryResult,
  RelutionDeviceSummary,
} from "../../../contracts/relution-assessment.js";
import type { RelutionConnection } from "../../../integrations/relution/relution-api-types.js";
import type { HttpServiceTransportOptions } from "../../../platform/network/http-service-transport.js";

export interface RelutionEditorRuntime {
  connection?: RelutionConnection;
  lastDevices: RelutionDeviceSummary[];
  lastDeviceQuery?: Pick<RelutionDeviceQueryResult, "count" | "total" | "truncated">;
  assessments?: Map<string, RelutionAssessmentReport>;
}

export type RelutionRouteHandler = (
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  runtime: RelutionEditorRuntime,
  workspace: string,
  allowLocalServiceHosts: boolean,
  transportOptions: HttpServiceTransportOptions,
) => boolean | Promise<boolean>;
