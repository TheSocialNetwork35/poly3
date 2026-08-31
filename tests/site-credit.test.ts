import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("site credit", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  it("ships a semantic, crawlable ZhStudio footer link in the public HTML", () => {
    expect(html).toMatch(/<footer\b[^>]*class="polyviewer-site-credit"[^>]*>/);
    expect(html).toContain('Made by <a href="https://zhstudio.ch">ZhStudio</a>');
    expect(html.match(/href="https:\/\/zhstudio\.ch"/g)).toHaveLength(1);
  });
});
