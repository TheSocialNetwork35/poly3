import { describe, expect, it } from "vitest";
import { parseReplayImport, parseReplayImports } from "../src/polyviewer/replay/ReplayImport";

describe("parseReplayImport", () => {
  it("keeps a bare PolyTrack recording string unchanged", () => {
    expect(parseReplayImport("  eNpNkEtK  ")).toEqual({ recording: "eNpNkEtK" });
  });

  it("imports an array and connects leaderboard nicknames by car style and frame count", () => {
    const recordings = JSON.stringify([
      { recording: "run-a", frames: 15178, carStyle: "style-a", verifiedState: 1 },
      { recording: "run-b", frames: 15226, carStyle: "style-b", verifiedState: 1 },
    ]);
    const leaderboard = JSON.stringify({ entries: [
      { nickname: "Second", frames: 15226, carStyle: "style-b" },
      { nickname: "First", frames: 15178, carStyle: "style-a" },
    ] });
    expect(parseReplayImports(recordings, leaderboard).map((entry) => entry.name)).toEqual([
      "First", "Second",
    ]);
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

  it("automatically identifies recording and CarStyle without field names", () => {
    const recording = `eN${"a".repeat(70)}`;
    const carStyle = "AAAAAP___wAAAAAAAP___w";
    expect(parseReplayImport(`${carStyle}\n${recording}`)).toEqual({ recording, carStyle });
    expect(parseReplayImport(JSON.stringify({ data: recording, appearance: carStyle }))).toEqual({
      recording,
      carStyle,
    });
  });

  it("accepts bare recordings inside replay arrays and explains a bare CarStyle", () => {
    const recording = `eN${"b".repeat(60)}`;
    expect(parseReplayImports(JSON.stringify([recording]))).toEqual([
      { payload: { recording }, name: undefined },
    ]);
    expect(() => parseReplayImport("AAAAAP___wAAAAAAAP___w")).toThrow(/CarStyle/);
  });
});
