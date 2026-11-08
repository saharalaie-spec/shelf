import { afterEach, describe, expect, it, vi } from "vitest";
import { matchCountries } from "@/lib/countries";
import { searchAreas } from "@/lib/places";

afterEach(() => vi.unstubAllGlobals());

describe("finding a city or country to group spots under", () => {
  it("knows every country, by its other names too", () => {
    expect(matchCountries("azer").map((c) => c.name)).toEqual(["Azerbaijan"]);
    expect(matchCountries("usa").map((c) => c.name)).toEqual(["United States"]);
    expect(matchCountries("united").map((c) => c.name)).toEqual(expect.arrayContaining(["United Kingdom", "United States"]));
    expect(matchCountries("x")).toEqual([]);
  });

  it("tries Photon again, then OpenStreetMap's own search, when Photon fails", async () => {
    const hosts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        hosts.push(url.hostname);
        if (url.hostname === "photon.komoot.io") return new Response("busy", { status: 503 });
        return Response.json([
          {
            osm_type: "relation",
            osm_id: 364110,
            name: "Baku",
            addresstype: "city",
            lat: "40.37",
            lon: "49.83",
            boundingbox: ["40.0", "40.6", "49.5", "50.4"],
            address: { country: "Azerbaijan" },
          },
        ]);
      }),
    );
    const hits = await searchAreas("Baku test 1");
    expect(hosts).toEqual(["photon.komoot.io", "photon.komoot.io", "nominatim.openstreetmap.org"]);
    expect(hits[0]).toMatchObject({ name: "Baku", label: "City", country: "Azerbaijan", bbox: [49.5, 40.0, 50.4, 40.6] });
  });

  it("still finds a country with both maps down, and says so when there's nothing at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect((await searchAreas("Azerbai")).map((h) => [h.name, h.label])).toEqual([["Azerbaijan", "Country"]]);
    await expect(searchAreas("Qwzx Nowhere")).rejects.toThrow(/couldn't be reached/);
  });
});
