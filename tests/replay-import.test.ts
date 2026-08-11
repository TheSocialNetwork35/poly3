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

  it("accepts the exact multi-line object format copied from browser developer tools", () => {
    expect(parseReplayImport(`carStyle\n:\n"AAAAAP___wAAAAAAAP___w"\nframes\n:\n22262\nrecording\n:\n"eNpNkEtK"\nverifiedState\n:\n1`)).toEqual({
      carStyle: "AAAAAP___wAAAAAAAP___w",
      frames: 22262,
      recording: "eNpNkEtK",
      verifiedState: 1,
    });
    expect(parseReplayImport('{recording: "abc"}')).toEqual({ recording: "abc" });
  });
});
