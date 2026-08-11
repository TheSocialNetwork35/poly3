import { afterEach, describe, expect, it, vi } from "vitest";
import { handlePolyTrackProxy } from "../src/server/polytrackProxy";

afterEach(() => vi.restoreAllMocks());

describe("PolyTrack Pages proxy", () => {
  it("rejects paths outside the verified v6 endpoint allowlist", async () => {
    const response = await handlePolyTrackProxy(
      new Request("https://polyviewer.example/api/polytrack/v6/multiplayer/host"),
      ["v6", "multiplayer", "host"],
    );
    expect(response.status).toBe(404);
  });

  it("rejects cross-origin browser requests", async () => {
    const response = await handlePolyTrackProxy(
      new Request("https://polyviewer.example/api/polytrack/v6/user", {
        headers: { Origin: "https://attacker.example" },
      }),
      ["v6", "user"],
    );
    expect(response.status).toBe(403);
  });

  it("accepts Wrangler's localhost normalization for a same-origin browser request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("profile"));
    const response = await handlePolyTrackProxy(
      new Request("http://localhost:4173/api/polytrack/v6/user", {
        headers: { Origin: "http://127.0.0.1:4173", "Sec-Fetch-Site": "same-origin" },
      }),
      ["v6", "user"],
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("streams an allowed request to the exact upstream endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("profile", { status: 200, headers: { "Content-Type": "text/plain" } }),
    );
    const response = await handlePolyTrackProxy(
      new Request("https://polyviewer.example/api/polytrack/v6/user?version=0.6.2&userToken=test", {
        headers: { Origin: "https://polyviewer.example", "Sec-Fetch-Site": "same-origin" },
      }),
      ["v6", "user"],
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("profile");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://vps.kodub.com/v6/user?version=0.6.2&userToken=test");
    expect(init?.method).toBe("GET");
  });
});
