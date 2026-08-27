import {
  onRequestGet as getReport,
  onRequestPost as postReport,
} from "../functions/api/report.js";
import { onRequestGet as getRegions } from "../functions/api/regions.js";
import {
  onRequestGet as getJoin,
  onRequestPost as postJoin,
} from "../functions/api/join.js";

type Handler = (context: { request: Request; env: Record<string, unknown> }) =>
  | Response
  | Promise<Response>;

type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

const worker = {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    const { pathname } = new URL(request.url);
    let handler: Handler | undefined;

    if (
      (pathname.startsWith("/data/") || pathname.startsWith("/public-data/")) &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      const assets = env.ASSETS as AssetsBinding | undefined;
      if (!assets) return json({ ok: false, error: "Assets unavailable" }, 503);

      const assetRequest = pathname.startsWith("/public-data/")
        ? new Request(request.url.replace("/public-data/", "/data/"), request)
        : request;
      const response = await assets.fetch(assetRequest);
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    if (pathname === "/api/report") {
      handler = request.method === "POST" ? postReport : request.method === "GET" ? getReport : undefined;
    } else if (pathname === "/api/regions" && request.method === "GET") {
      handler = getRegions;
    } else if (pathname === "/api/join") {
      handler = request.method === "POST" ? postJoin : request.method === "GET" ? getJoin : undefined;
    }

    if (!handler) {
      return json({ ok: false, error: "Not found" }, 404);
    }

    return handler({ request, env });
  },
};

export default worker;
