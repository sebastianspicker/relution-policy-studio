/** Domain and adapter failures translated by the loopback HTTP boundary. */
export class CampusWeaveInputError extends Error {}
export class CampusWeaveNotFoundError extends Error {}
export class CampusWeaveRevisionConflictError extends Error {}
export class CampusWeaveStoreBusyError extends Error {}
export class CampusWeaveCapacityError extends Error {}

export class CampusWeavePlannerError extends Error {
  readonly kind: "capacity" | "rejected" | "unavailable" | "timeout";
  /** Bounded planner stderr for the host log; never sent to the client. */
  readonly diagnostic: string | undefined;

  constructor(kind: CampusWeavePlannerError["kind"], message: string, diagnostic?: string) {
    super(message);
    this.kind = kind;
    this.diagnostic = diagnostic === undefined || diagnostic.length === 0 ? undefined : diagnostic;
  }
}
