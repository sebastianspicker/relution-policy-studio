import {
  listBaselineTemplateOptions,
  loadBaselineExpertOptions,
  loadBaselineTemplate,
  parseBaselineTemplatePlatform,
  parseBaselineTemplateShape,
  parseBaselineTemplateTier,
} from "./baseline-templates.js";

export interface BaselineTemplateApiResponse {
  readonly status: number;
  readonly body: unknown;
}

export function baselineTemplateApiResponse(url: URL, method: string | undefined): BaselineTemplateApiResponse | undefined {
  if (method !== "GET") {
    return undefined;
  }
  if (url.pathname === "/api/baseline-templates") {
    return { status: 200, body: listBaselineTemplateOptions() };
  }
  if (url.pathname === "/api/baseline-templates/expert") {
    try {
      return {
        status: 200,
        body: loadBaselineExpertOptions({
          platform: parseBaselineTemplatePlatform(url.searchParams.get("platform")),
          shape: parseBaselineTemplateShape(url.searchParams.get("shape")),
        }),
      };
    } catch (error) {
      return { status: 400, body: { error: error instanceof Error ? error.message : String(error) } };
    }
  }
  if (url.pathname !== "/api/baseline-templates/template") {
    return undefined;
  }
  try {
    return {
      status: 200,
      body: loadBaselineTemplate({
        platform: parseBaselineTemplatePlatform(url.searchParams.get("platform")),
        tier: parseBaselineTemplateTier(url.searchParams.get("tier")),
        shape: parseBaselineTemplateShape(url.searchParams.get("shape")),
      }),
    };
  } catch (error) {
    return { status: 400, body: { error: error instanceof Error ? error.message : String(error) } };
  }
}
