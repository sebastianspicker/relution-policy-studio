import type { ZammadPublicSession, ZammadTicketDraft, ZammadTicketResult } from "../../../../src/browser/integrations.js";
import type { Protocol } from "./relution-dashboard-types.js";

export interface ZammadSectionProps {
  readonly protocol: Protocol; readonly host: string; readonly port: string; readonly token: string; readonly group: string; readonly customer: string;
  readonly session: ZammadPublicSession; readonly loading: boolean; readonly draft: ZammadTicketDraft | undefined; readonly result: ZammadTicketResult | undefined; readonly confirming: boolean;
  readonly onProtocol: (value: Protocol) => void; readonly onHost: (value: string) => void; readonly onPort: (value: string) => void; readonly onToken: (value: string) => void; readonly onGroup: (value: string) => void; readonly onCustomer: (value: string) => void;
  readonly onSubmit: () => void; readonly onTest: () => void; readonly onReview: () => void; readonly onCancel: () => void; readonly onCreate: () => void;
}
export type ZammadConnectionProps = Pick<ZammadSectionProps, "protocol" | "host" | "port" | "token" | "group" | "customer" | "loading" | "session" | "onProtocol" | "onHost" | "onPort" | "onToken" | "onGroup" | "onCustomer" | "onSubmit" | "onTest">;
export type ZammadTicketDraftProps = Pick<ZammadSectionProps, "draft" | "result" | "confirming" | "loading" | "session" | "host" | "group" | "customer" | "onReview" | "onCancel" | "onCreate">;
