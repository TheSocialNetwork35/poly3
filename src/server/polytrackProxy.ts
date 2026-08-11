const UPSTREAM_ORIGIN = "https://vps.kodub.com";
const MAX_REQUEST_BYTES = 256 * 1024;

const allowedMethods = new Map<string, ReadonlySet<string>>([
  ["leaderboard", new Set(["GET", "POST"])],
  ["leaderboardUserEntry", new Set(["GET"])],
  ["recordings", new Set(["GET"])],
  ["user", new Set(["GET", "POST"])],
  ["verifyRecordings", new Set(["POST"])],
  ["iceServers", new Set(["GET"])],
]);

export async function handlePolyTrackProxy(
  request: Request,
  rawPath: string | string[] | undefined,
): Promise<Response> {
  const path = normalizePath(rawPath);
  if (!path) return textResponse("Not found", 404);

  const [version, endpoint, ...remaining] = path;
  if (version !== "v6" || !endpoint || remaining.length > 0) {
    return textResponse("Not found", 404);
  }

  const methods = allowedMethods.get(endpoint);
  if (!methods?.has(request.method)) {
    return textResponse("Method not allowed", methods ? 405 : 404, methods);
  }

  const incomingUrl = new URL(request.url);
  if (!isSameOriginBrowserRequest(request, incomingUrl)) {
    return textResponse("Forbidden", 403);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_REQUEST_BYTES) {
    return textResponse("Request too large", 413);
  }

  const upstreamUrl = new URL(`/v6/${endpoint}${incomingUrl.search}`, UPSTREAM_ORIGIN);
  const headers = new Headers({ Accept: "text/plain, application/json;q=0.9, */*;q=0.1" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? null : request.body,
      redirect: "manual",
    });
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete("access-control-allow-origin");
    responseHeaders.delete("set-cookie");
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return textResponse("PolyTrack service unavailable", 502);
  }
}

function normalizePath(rawPath: string | string[] | undefined): string[] | null {
  if (Array.isArray(rawPath)) return rawPath.filter(Boolean);
  if (typeof rawPath === "string") return rawPath.split("/").filter(Boolean);
  return null;
}

function isSameOriginBrowserRequest(request: Request, requestUrl: URL): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";
  const origin = request.headers.get("origin");
  return !origin || origin === requestUrl.origin;
}

function textResponse(message: string, status: number, methods?: ReadonlySet<string>): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  if (status === 405 && methods) headers.set("Allow", [...methods].join(", "));
  return new Response(message, { status, headers });
}
