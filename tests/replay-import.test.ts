import { describe, expect, it } from "vitest";
import { parseReplayImport } from "../src/polyviewer/replay/ReplayImport";

describe("parseReplayImport", () => {
  it("keeps a bare PolyTrack recording string unchanged", () => {
    expect(parseReplayImport("  eNpNkEtK  ")).toEqual({ recording: "eNpNkEtK" });
  });

  it("accepts the structured run object including native car style metadata", () => {
    expect(parseReplayImport(JSON.stringify({
      carStyle: "AAAAAP___wAAAAAAAP___w",
      frames: 22262,
      recording: "eNpNkEtK",
      verifiedState: 1,
    }))).toEqual({
      carStyle: "AAAAAP___wAAAAAAAP___w",
      frames: 22262,
      recording: "eNpNkEtK",
      verifiedState: 1,
    });
  });

  it("gives a useful error for JavaScript inspector text that is not JSON", () => {
    expect(() => parseReplayImport('{recording: "abc"}')).toThrow(/valid JSON/);
  });
});
