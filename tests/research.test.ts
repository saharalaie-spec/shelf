import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@/lib/ai", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai")>()),
  anthropic: () => ({ beta: { messages: { create } } }),
}));

const { researchPlaces, RESEARCH_BUDGET_MS } = await import("@/lib/research");

const input = {
  request: "Brunch on a Wednesday in the West Village, fall trees",
  taste: "",
  area: { name: "New York", country: "United States", lat: 40.7, lon: -74, bbox: null },
  exclude: [],
  count: 5,
};

afterEach(() => create.mockReset());

describe("researching places on the web", () => {
  it("is quick: low effort, three searches, and a time limit with no retries", async () => {
    create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", name: "submit_places", input: { places: [{ name: "Buvette", neighborhood: "West Village", why: "Brunch.", source_url: "https://x.com/a" }] } }],
    });
    const { places } = await researchPlaces(input);
    expect(places.map((p) => p.name)).toEqual(["Buvette"]);
    const [params, options] = create.mock.calls[0];
    expect(params.output_config.effort).toBe("low");
    expect(params.tools[0].max_uses).toBe(3);
    expect(options.maxRetries).toBe(0);
    expect(options.timeout).toBeLessThanOrEqual(RESEARCH_BUDGET_MS);
  });

  it("running out of time hands back nothing, quietly, so the quicker way takes over", async () => {
    create.mockRejectedValue(new Anthropic.APIConnectionTimeoutError());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(researchPlaces(input)).resolves.toEqual({ places: [], seen: new Set() });
    warn.mockRestore();
  });

  it("a search that pauses carries on, but only within the time limit", async () => {
    create.mockResolvedValue({ stop_reason: "pause_turn", content: [] });
    await researchPlaces(input);
    expect(create.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
