/** Public contracts for normalized HTTP service connections. */
export type HttpProtocol = "http" | "https";

export interface NormalizedConnectionBase {
  protocol: HttpProtocol;
  host: string;
  port?: number;
  basePath: string;
  baseUrl: string;
  allowLocalServiceHosts: boolean;
}
