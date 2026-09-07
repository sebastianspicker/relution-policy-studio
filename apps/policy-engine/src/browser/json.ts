/** Browser-only JSON and mobileconfig helpers. Every owner below is synchronous and Node-free. */
export { asRecord, uniqueStrings } from "../platform/serialization/json-guards.js";
export type { JsonRecord } from "../platform/serialization/json-guards.js";
export { deepMergePreservingExistingUuids } from "../assurance/compliance-deep-values.js";
export { inspectMobileConfigText } from "../platform/serialization/plist-inspection.js";
