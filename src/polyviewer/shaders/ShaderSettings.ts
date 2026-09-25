/** No rendering imports here: editing a look must not load or allocate the GPU pipeline. */
const number = (label: string, value: number, min: number, max: number, step = 0.01) => ({ label, value, min, max, step });
const toggle = (label: string, value = false) => ({ label, value });
const choice = (label: string, value: string, choices: readonly string[]) => ({ label, value, choices });
export const shaderControls = {
  toneMappingMode: choice("Operator", "ACES_FILMIC", ["LINEAR", "REINHARD", "REINHARD2", "REINHARD2_ADAPTIVE", "UNCHARTED2", "CINEON", "ACES_FILMIC", "AGX", "NEUTRAL"]),
  toneMappingExposure: number("Exposure", 1.05, 0, 2),
  toneMappingWhitePoint: number("White point · Reinhard 2", 4, 2, 32, 0.1),
  toneMappingMiddleGrey: number("Middle grey · Reinhard 2", 0.6, 0, 2, 0.001),
  toneMappingMinLuminance: number("Minimum luminance", 0.01, 0.001, 1, 0.001),
  toneMappingAverageLuminance: number("Average luminance", 1, 0.001, 2, 0.001),
  toneMappingAdaptationRate: number("Adaptation rate", 1, 0, 3, 0.1),
  toneMappingBlendMode: choice("Blend", "NORMAL", ["SKIP", "SET", "ADD", "ALPHA", "AVERAGE", "COLOR", "COLOR_BURN", "COLOR_DODGE", "DARKEN", "DIFFERENCE", "DIVIDE", "DST", "EXCLUSION", "HARD_LIGHT", "HARD_MIX", "HUE", "INVERT", "INVERT_RGB", "LIGHTEN", "LINEAR_BURN", "LINEAR_DODGE", "LINEAR_LIGHT", "LUMINOSITY", "MULTIPLY", "NEGATION", "NORMAL", "OVERLAY", "PIN_LIGHT", "REFLECT", "SATURATION", "SCREEN", "SOFT_LIGHT", "SRC", "SUBTRACT", "VIVID_LIGHT"]),
  toneMappingOpacity: number("Tonemapping opacity", 1, 0, 1),
  aoEnabled: toggle("Contact shadows", true),
  aoIntensity: number("Shadow strength", 1.15, 0, 3),
  aoRadius: number("Shadow radius", 0.08, 0.01, 0.4),
  bloomEnabled: toggle("Bloom", true),
  bloomIntensity: number("Bloom strength", 0.3, 0, 10, 0.05),
  bloomThreshold: number("Highlight threshold", 1.1, 0, 2, 0.05),
  bloomRadius: number("Bloom radius", 0.65, 0, 1, 0.05),
  greyscale: number("Greyscale", 0, 0, 1),
  brightness: number("Brightness", 0, -1, 1),
  contrast: number("Contrast", 0.04, -1, 1),
  hue: number("Hue (degrees)", 0, 0, 360, 1),
  saturation: number("Saturation", 0.03, -1, 1),
  sepia: number("Sepia", 0, 0, 1),
  dofEnabled: toggle("Depth of field"),
  dofOpacity: number("Blur opacity", 1, 0, 1, 0.05),
  dofFocusDistance: number("Focus distance (world units)", 6, 0, 1000, 0.1),
  dofFocusRange: number("Focus range (world units)", 20, 0.01, 100, 0.01),
  dofBokehScale: number("Bokeh size", 5, 1, 7),
  dofResolutionScale: choice("Blur resolution", "0.5", ["0.1", "0.25", "0.5", "0.75", "1"]),
  dofKernelSize: choice("Blur kernel", "MEDIUM", ["VERY_SMALL", "SMALL", "MEDIUM", "LARGE", "VERY_LARGE", "HUGE"]),
  smaaEnabled: toggle("SMAA", true),
  smaaPreset: choice("SMAA quality", "HIGH", ["LOW", "MEDIUM", "HIGH", "ULTRA"]),
  fxaaEnabled: toggle("FXAA"),
  fxaaSamples: number("FXAA samples", 12, 0, 48, 1),
  msaaSamples: number("MSAA samples (device limited)", 0, 0, 8, 1),
  invertEnabled: toggle("Invert colours"),
  asciiEnabled: toggle("ASCII"),
  wireframeEnabled: toggle("Vehicle wireframe"),
  outlineEnabled: toggle("Vehicle outlines"),
  outlineStrength: number("Outline strength", 5, 0, 5, 1),
} as const;
export type ShaderSettings = { [K in keyof typeof shaderControls]: (typeof shaderControls)[K]["value"] };
export type ShaderKey = keyof ShaderSettings;
export const shaderGroups: { title: string; keys: ShaderKey[] }[] = [
  { title: "Light & shadows", keys: ["aoEnabled", "aoIntensity", "aoRadius", "bloomEnabled", "bloomIntensity", "bloomThreshold", "bloomRadius"] },
  { title: "Tone mapping", keys: ["toneMappingMode", "toneMappingExposure", "toneMappingOpacity", "toneMappingBlendMode", "toneMappingWhitePoint", "toneMappingMiddleGrey", "toneMappingMinLuminance", "toneMappingAverageLuminance", "toneMappingAdaptationRate"] },
  { title: "Colour grading", keys: ["brightness", "contrast", "hue", "saturation", "greyscale", "sepia"] },
  { title: "Depth of field", keys: ["dofEnabled", "dofFocusDistance", "dofFocusRange", "dofBokehScale", "dofOpacity", "dofResolutionScale", "dofKernelSize"] },
  { title: "Anti-aliasing", keys: ["smaaEnabled", "smaaPreset", "fxaaEnabled", "fxaaSamples", "msaaSamples"] },
  { title: "Creative effects", keys: ["outlineEnabled", "outlineStrength", "wireframeEnabled", "invertEnabled", "asciiEnabled"] },
];
export const DEFAULT_SHADERS = Object.fromEntries(Object.entries(shaderControls).map(([key, control]) => [key, control.value])) as ShaderSettings;
export const SHADER_PRESETS: Record<string, ShaderSettings> = {
  Cinematic: { ...DEFAULT_SHADERS },
  "Soft daylight": { ...DEFAULT_SHADERS, toneMappingMode: "AGX", contrast: 0, saturation: 0.08, bloomIntensity: 0.18, aoIntensity: 0.8 },
  "Night glow": { ...DEFAULT_SHADERS, toneMappingMode: "AGX", toneMappingExposure: 0.85, bloomIntensity: 1.2, bloomThreshold: 0.75, contrast: 0.12 },
  "PolyProcessing defaults": { ...DEFAULT_SHADERS, aoEnabled: false, bloomEnabled: false, bloomIntensity: 2, bloomThreshold: 1.25, toneMappingMode: "LINEAR", toneMappingExposure: 1, contrast: 0, saturation: 0, smaaEnabled: false, smaaPreset: "MEDIUM" },
};

export function normalizeShaderSettings(input: unknown): ShaderSettings {
  const result = { ...DEFAULT_SHADERS };
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  const source = input as Record<string, unknown>;
  for (const key of Object.keys(shaderControls) as ShaderKey[]) {
    const control = shaderControls[key];
    const value = source[key];
    if ("min" in control && typeof value === "number" && Number.isFinite(value)) {
      const clamped = Math.min(control.max, Math.max(control.min, value));
      Object.assign(result, { [key]: control.step === 1 ? Math.round(clamped) : clamped });
    } else if ("choices" in control && typeof value === "string" && control.choices.includes(value)) {
      Object.assign(result, { [key]: value });
    } else if (typeof control.value === "boolean" && typeof value === "boolean") Object.assign(result, { [key]: value });
  }
  return result;
}
export function loadShaderSettings(): ShaderSettings {
  try { return normalizeShaderSettings(JSON.parse(localStorage.getItem("polyviewer.shaders.v2") ?? "null")); }
  catch { return { ...DEFAULT_SHADERS }; }
}
export function saveShaderSettings(settings: ShaderSettings): void {
  try { localStorage.setItem("polyviewer.shaders.v2", JSON.stringify(settings)); } catch { /* Storage is optional. */ }
}
