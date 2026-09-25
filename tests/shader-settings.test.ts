import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SHADERS, normalizeShaderSettings, SHADER_PRESETS, loadShaderSettings } from "../src/polyviewer/shaders/ShaderSettings";

describe("shader settings at the persistence boundary", () => {
  it("rejects malformed values and clamps expensive GPU controls", () => {
    const settings = normalizeShaderSettings({ msaaSamples: 999, fxaaSamples: 3.9, dofFocusRange: 0, aoIntensity: NaN, toneMappingMode: "UNKNOWN", bloomEnabled: "true", sepia: -50, hue: Infinity });
    expect(settings).toMatchObject({ msaaSamples: 8, fxaaSamples: 4, dofFocusRange: 0.01, aoIntensity: DEFAULT_SHADERS.aoIntensity, toneMappingMode: "ACES_FILMIC", bloomEnabled: true, sepia: 0, hue: 0 });
    expect(normalizeShaderSettings(null)).toEqual(DEFAULT_SHADERS);
  });
  it("round-trips every preset without losing or silently changing settings", () => {
    for (const preset of Object.values(SHADER_PRESETS)) expect(normalizeShaderSettings(JSON.parse(JSON.stringify(preset)))).toEqual(preset);
  });
  it("falls back safely when storage is blocked or corrupt", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(loadShaderSettings()).toEqual(DEFAULT_SHADERS);
    vi.stubGlobal("localStorage", { getItem: () => "{broken" });
    expect(loadShaderSettings()).toEqual(DEFAULT_SHADERS);
    vi.unstubAllGlobals();
  });
});
