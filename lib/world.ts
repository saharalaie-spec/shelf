import type { Area, Destination, Item } from "./types";

/**
 * The world map's projection: Natural Earth I, on the same 1000-wide canvas as lib/data/world.json (continent shapes
 * from Natural Earth, public domain, via world-atlas 2.0.2; Antarctica left out; latitudes 84°N to 57°S).
 */
const RAD = Math.PI / 180;
const TOP = 84;
const BOTTOM = -57;
function ne1(lon: number, lat: number): [number, number] {
  const l = lon * RAD, p = lat * RAD, p2 = p * p, p4 = p2 * p2;
  return [
    l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
    p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))),
  ];
}
const X0 = ne1(-180, 0)[0];
const Y_TOP = ne1(0, TOP)[1];
const K = 1000 / (ne1(180, 0)[0] - X0);

/** Longitude and latitude to a point on the map canvas (x 0–1000 west to east, y down from 84°N). */
export function project(lon: number, lat: number): [number, number] {
  const [x, y] = ne1(lon, Math.max(BOTTOM - 2, Math.min(TOP, lat)));
  return [(x - X0) * K, (Y_TOP - y) * K];
}

/** The part of the canvas a world view shows: from the Arctic islands down past Cape Horn. */
export const WORLD_VIEW = (() => {
  const top = project(0, 80)[1];
  const bottom = project(0, -56)[1];
  return { x: 0, y: top, width: 1000, height: bottom - top };
})();

/** A place on the map: where it is, how many spots it holds, and a few of them. */
export type MapPlace = {
  id: string;
  name: string;
  country: string | null;
  lon: number;
  lat: number;
  spots: number;
  been: number;
  some: { title: string; been: boolean }[];
};

/**
 * Places that can go on the map: the place's own location, or else the middle of its spots (a country or a name you
 * typed may have no location of its own). Places with neither stay off the map.
 */
export function placesOnMap(destinations: (Destination | (Area & { id: string }))[], items: Item[]): MapPlace[] {
  const spotsIn = new Map<string, Item[]>();
  for (const i of items) if (i.destinationId) spotsIn.set(i.destinationId, [...(spotsIn.get(i.destinationId) ?? []), i]);
  return destinations.flatMap((d) => {
    const spots = spotsIn.get(d.id) ?? [];
    let lon = d.lon;
    let lat = d.lat;
    if (lon == null || lat == null) {
      const located = spots.filter((s) => s.place);
      if (!located.length) return [];
      lon = located.reduce((n, s) => n + s.place!.lon, 0) / located.length;
      lat = located.reduce((n, s) => n + s.place!.lat, 0) / located.length;
    }
    const been = spots.filter((s) => s.status === "read");
    // A few to show: been first, the latest first within each.
    const some = [...spots]
      .sort((a, b) => Number(b.status === "read") - Number(a.status === "read") || b.statusAt - a.statusAt)
      .slice(0, 3)
      .map((s) => ({ title: s.title, been: s.status === "read" }));
    return [{ id: d.id, name: d.name, country: d.country, lon, lat, spots: spots.length, been: been.length, some }];
  });
}
