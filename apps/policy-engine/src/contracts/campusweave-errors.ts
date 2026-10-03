/** Domain and adapter failures translated by the loopback HTTP boundary. */
export class CampusWeaveInputError extends Error {}
export class CampusWeaveNotFoundError extends Error {}
export class CampusWeaveRevisionConflictError extends Error {}
export class CampusWeaveStoreBusyError extends Error {}
export class CampusWeaveCapacityError extends Error {}

export class CampusWeavePlannerError extends Error {
  readonly kind: "capacity" | "rejected" | "unavailable" | "timeout";

  constructor(kind: CampusWeavePlannerError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}
