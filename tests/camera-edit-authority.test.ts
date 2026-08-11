import { describe, expect, it } from "vitest";
import { CameraEditAuthority } from "../src/polyviewer/camera/CameraEditAuthority";

describe("CameraEditAuthority", () => {
  it("keeps a manually moved camera free while paused and returns to the path on play", () => {
    const authority = new CameraEditAuthority();
    expect(authority.shouldApplyPath(false)).toBe(true);
    authority.beginManualEdit();
    expect(authority.shouldApplyPath(false)).toBe(false);
    expect(authority.shouldApplyPath(true)).toBe(true);
    expect(authority.shouldApplyPath(false)).toBe(true);
  });

  it("returns to the path after a seek, step, or selected point requests it", () => {
    const authority = new CameraEditAuthority();
    authority.beginManualEdit();
    authority.resumePath();
    expect(authority.shouldApplyPath(false)).toBe(true);
  });
});
