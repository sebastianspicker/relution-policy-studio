/** Serves recommendation catalogs and their derived analyses. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { browseRecommendationCatalog } from "../assurance/recommendation-browse.js";
import { sendJson } from "./editor-routes-utils.js";
import {
  loadRecommendationCoverage,
  loadRecommendationSemanticIndex,
  loadUnifiedRecommendationAnalysis,
} from "../assurance/recommendation-analysis-loader.js";
import { isRecommendationSource, listRecommendationCatalogs, loadRecommendationCatalog } from "../assurance/recommendation-catalog-loader.js";

export function handleRecommendationApiRequest(url: URL, _request: IncomingMessage, response: ServerResponse): boolean {
  if (url.pathname === "/api/recommendations") {
    sendJson(response, 200, listRecommendationCatalogs());
    return true;
  }
  if (url.pathname === "/api/recommendations/coverage") {
    sendJson(response, 200, loadRecommendationCoverage());
    return true;
  }
  if (url.pathname === "/api/recommendations/semantics") {
    sendJson(response, 200, loadRecommendationSemanticIndex());
    return true;
  }
  if (url.pathname === "/api/recommendations/semantic-analysis") {
    sendJson(response, 200, loadUnifiedRecommendationAnalysis());
    return true;
  }
  if (!url.pathname.startsWith("/api/recommendations/")) return false;
  const [source = "", operation, ...tail] = url.pathname.slice("/api/recommendations/".length).split("/");
  if (!isRecommendationSource(source)) {
    sendJson(response, 404, { error: `Unknown recommendation source: ${source}` });
    return true;
  }
  const catalog = loadRecommendationCatalog(source);
  if (operation === "browse" && tail.length === 0) sendJson(response, 200, browseRecommendationCatalog(catalog));
  else if (operation === "ruleset" && tail.length === 0) sendJson(response, catalog.ruleset === undefined ? 404 : 200, catalog.ruleset ?? { error: catalog.error ?? "Ruleset unavailable" });
  else if (operation === "records" && tail.length === 1) {
    let id: string;
    try { id = decodeURIComponent(tail[0]!); }
    catch { sendJson(response, 400, { error: "Malformed recommendation identifier" }); return true; }
    const record = catalog.recommendations.find((item) => item.id === id);
    sendJson(response, record === undefined ? 404 : 200, record ?? { error: "Recommendation not found" });
  } else if (operation === undefined) sendJson(response, 200, catalog);
  else sendJson(response, 404, { error: "Unknown recommendation endpoint" });
  return true;
}
