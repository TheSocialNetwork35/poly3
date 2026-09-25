import { loadShaderSettings, normalizeShaderSettings, saveShaderSettings, shaderControls, shaderGroups, SHADER_PRESETS, type ShaderKey, type ShaderSettings } from "../shaders/ShaderSettings";

export class ShaderPanel {
  readonly element = document.createElement("dialog");
  settings = loadShaderSettings();
  enabled = false;
  private status: HTMLElement;
  constructor(private onChange: (settings: ShaderSettings, preview: boolean) => void) {
    window.addEventListener("keydown", event => {
      if (event.code !== "Home" || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault();
      if (this.element.open) this.element.close(); else this.open();
    });
    this.element.className = "polyviewer-shader-panel";
    this.element.setAttribute("aria-labelledby", "shader-title");
    this.element.innerHTML = `
      <header><div><small>LOOK DEVELOPMENT</small><h2 id="shader-title">Shaders</h2></div><button type="button" data-close aria-label="Close shader settings">✕</button></header>
      <p class="shader-intro">Lighting, lens & colour · Home to toggle</p>
      <label class="shader-preview"><span>Live preview<small>Off keeps the original rendering performance.</small></span><input type="checkbox" role="switch" data-preview></label>
      <p class="shader-status" role="status">Preview off · native rendering</p>
      <label class="shader-preset">Look<select data-preset><option value="">Custom</option>${Object.keys(SHADER_PRESETS).map(name => `<option>${name}</option>`).join("")}</select></label>
      <div class="shader-controls">${shaderGroups.map((group, i) => `<details ${i === 0 ? "open" : ""}><summary>${group.title}</summary><div>${group.keys.map(key => this.control(key)).join("")}</div></details>`).join("")}</div>
      <footer><span>Use this look in Render → Use shader settings.<br>Depth of field uses fixed world distances.</span><button type="button" data-reset>Reset look</button></footer>
      <a href="https://git.polymodloader.com/Jade/PolyProcessing" target="_blank" rel="noopener noreferrer">Inspired by Jade’s PolyProcessing ↗</a>`;
    this.element.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.element.close(); }
    });
    this.status = this.element.querySelector(".shader-status")!;
    this.element.querySelector("[data-close]")!.addEventListener("click", () => this.element.close());
    this.element.querySelector("[data-preview]")!.addEventListener("change", event => {
      this.enabled = (event.target as HTMLInputElement).checked;
      this.onChange({ ...this.settings }, this.enabled);
    });
    this.element.querySelector("[data-preset]")!.addEventListener("change", event => {
      const preset = SHADER_PRESETS[(event.target as HTMLSelectElement).value];
      if (preset) this.setSettings(preset);
    });
    this.element.querySelector("[data-reset]")!.addEventListener("click", () => this.setSettings(SHADER_PRESETS.Cinematic!));
    this.element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-shader]").forEach(input => {
      input.addEventListener("input", () => {
        const output = input.closest("label")?.querySelector("output");
        if (output) output.value = input.value;
      });
      input.addEventListener("change", () => {
        const key = input.dataset.shader as ShaderKey;
        const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked
          : typeof this.settings[key] === "number" ? Number(input.value) : input.value;
        this.settings = normalizeShaderSettings({ ...this.settings, [key]: value });
        this.changed();
      });
    });
    this.sync();
    document.body.append(this.element);
  }
  open(): void { if (!this.element.open) this.element.show(); }
  setStatus(message: string, active: boolean): void {
    this.status.textContent = message;
    this.element.dataset.active = String(active);
    if (message.startsWith("Shaders unavailable")) {
      this.enabled = false;
      this.element.querySelector<HTMLInputElement>("[data-preview]")!.checked = false;
    }
  }
  private setSettings(settings: ShaderSettings): void { this.settings = { ...settings }; this.sync(); this.changed(); }
  private changed(): void {
    saveShaderSettings(this.settings);
    this.syncPreset();
    this.onChange({ ...this.settings }, this.enabled);
  }
  private syncPreset(): void {
    this.element.querySelector<HTMLSelectElement>("[data-preset]")!.value = Object.entries(SHADER_PRESETS).find(([, preset]) => Object.keys(preset).every(key => preset[key as ShaderKey] === this.settings[key as ShaderKey]))?.[0] ?? "";
  }
  private sync(): void {
    this.element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-shader]").forEach(input => {
      const value = this.settings[input.dataset.shader as ShaderKey];
      if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(value);
      else input.value = String(value);
      const output = input.closest("label")?.querySelector("output");
      if (output) output.value = String(value);
    });
    this.syncPreset();
  }
  private control(key: ShaderKey): string {
    const c = shaderControls[key];
    const input = "choices" in c
      ? `<select data-shader="${key}">${c.choices.map(value => `<option value="${value}">${value.replaceAll("_", " ")}</option>`).join("")}</select>`
      : "min" in c
        ? `<span class="shader-range"><input data-shader="${key}" type="range" min="${c.min}" max="${c.max}" step="${c.step}"><output></output></span>`
        : `<input data-shader="${key}" type="checkbox">`;
    return `<label><span>${c.label}</span>${input}</label>`;
  }
}
