/** Owns the shared editable endpoint fields used by external dashboard sessions. */
import { useState } from "react";
import type { Protocol } from "./relution-dashboard-types.js";

export function useDashboardConnectionFields() {
  const [protocol, setProtocol] = useState<Protocol>("https");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [token, setToken] = useState("");
  return { protocol, setProtocol, host, setHost, port, setPort, token, setToken };
}
