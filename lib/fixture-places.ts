import { placeCategory } from "./place-categories";
import { keepCountry, photonSpot, rankAreas, rankSpots, type PhotonFeature } from "./places";
import type { Area, AreaHit, BBox, Hit } from "./types";

// A small offline map used when BOOKS_PROVIDER=fixture (tests, or working without network). Spots carry raw
// OSM tags and Photon-style address parts, so they go through the same mapping as live Photon results.

// [name, other names, country (null for a country itself), label, lat, lon, [west, south, east, north]]
const AREAS: [string, string[], string | null, string, number, number, BBox][] = [
  ["Spain", ["España"], null, "Country", 39.3260685, -4.8379791, [-18.1606948, 27.6377504, 4.3282001, 43.7930856]],
  ["Portugal", [], null, "Country", 39.6621648, -8.1353519, [-31.5575303, 29.8288021, -6.1891593, 42.1543112]],
  ["Japan", ["Nippon"], null, "Country", 36.5748441, 139.2394179, [122.7141754, 20.2145811, 154.205541, 45.7112046]],
  ["France", [], null, "Country", 46.603354, 1.8883335, [-5.4534286, 41.2632185, 9.8678344, 51.268318]],
  ["Mexico", ["México"], null, "Country", 23.6585116, -102.0077097, [-118.59919, 14.3886243, -86.493266, 32.7186553]],
  ["Italy", ["Italia"], null, "Country", 42.6384261, 12.674297, [6.6272658, 35.2889616, 18.7844746, 47.0921462]],
  ["Valencia", ["València"], "Spain", "City", 39.4697065, -0.3763353, [-0.4325512, 39.2784496, -0.272574, 39.5666828]],
  ["Valencia", [], "Venezuela", "City", 10.1620865, -68.0076532, [-68.0975, 10.0886, -67.9289, 10.2981]],
  ["Valencian Community", ["Comunitat Valenciana", "Comunidad Valenciana"], "Spain", "Region", 39.4015, -0.5546, [-1.5291, 37.8434, 0.6909, 40.7891]],
  ["Mallorca", ["Majorca"], "Spain", "Island", 39.613432, 2.8829184, [2.3036, 39.2626, 3.4799, 39.9628]],
  ["Barcelona", [], "Spain", "City", 41.3828939, 2.1774322, [2.0524977, 41.3170353, 2.2283555, 41.4679135]],
  ["Madrid", [], "Spain", "City", 40.4167047, -3.7035825, [-3.8889539, 40.3119774, -3.5179163, 40.6437293]],
  ["Lisbon", ["Lisboa"], "Portugal", "City", 38.7077507, -9.1365919, [-9.2298356, 38.6913994, -9.0863328, 38.7967584]],
  ["Porto", ["Oporto"], "Portugal", "City", 41.1494512, -8.6107884, [-8.6913482, 41.1383506, -8.5526022, 41.1859353]],
  ["Tokyo", ["東京"], "Japan", "City", 35.6768601, 139.7638947, [138.9428, 35.5014, 139.9198, 35.8986]],
  ["Kyoto", ["京都"], "Japan", "City", 35.0115754, 135.7681441, [135.559, 34.8768, 135.8816, 35.3215]],
  ["Paris", [], "France", "City", 48.8588897, 2.320041, [2.224122, 48.8155755, 2.4697602, 48.902156]],
  ["Mexico City", ["Ciudad de México", "CDMX"], "Mexico", "City", 19.4326296, -99.1331785, [-99.3649242, 19.0482366, -98.9403017, 19.5927572]],
  ["Rome", ["Roma"], "Italy", "City", 41.8933203, 12.4829321, [12.2344669, 41.6556417, 12.8557603, 42.1410039]],
  ["New York", ["New York City", "NYC"], "United States", "City", 40.7127281, -74.0060152, [-74.2590879, 40.476578, -73.7002721, 40.91763]],
];

// Per city: [name, OSM tag, lat, lon, neighborhood, "street number"]
const SPOTS: Record<string, [string, string, number, number, string | null, string | null][]> = {
  "Valencia, Spain": [
    ["Mercado Central", "amenity:marketplace", 39.47372, -0.37877, "El Mercat", "Plaça de la Ciutat de Bruges"],
    ["Ciudad de las Artes y las Ciencias", "tourism:attraction", 39.45487, -0.35036, "Penya-roja", "Avinguda del Professor López Piñero 7"],
    ["Playa de la Malvarrosa", "natural:beach", 39.47906, -0.32386, "La Malva-rosa", null],
    ["Casa Montaña", "amenity:restaurant", 39.46664, -0.32867, "El Cabanyal", "Carrer de Josep Benlliure 69"],
    ["Horchatería Santa Catalina", "amenity:cafe", 39.47506, -0.37609, "Ciutat Vella", "Plaça de Santa Caterina 6"],
    ["Jardín del Turia", "leisure:park", 39.47552, -0.3696, null, null],
    ["Bar Ricardo", "amenity:bar", 39.46055, -0.3735, "Ruzafa", "Carrer de Sant Valer 10"],
    ["Torres de Serranos", "historic:city_gate", 39.47917, -0.37583, "Ciutat Vella", "Plaça dels Furs"],
  ],
  "Barcelona, Spain": [
    ["Sagrada Família", "tourism:attraction", 41.40363, 2.17436, "Eixample", "Carrer de Mallorca 401"],
    ["Mercat de la Boqueria", "amenity:marketplace", 41.38174, 2.17166, "El Raval", "La Rambla 91"],
    ["Park Güell", "leisure:park", 41.41449, 2.15269, "Gràcia", null],
    ["Museu Picasso", "tourism:museum", 41.38522, 2.18085, "El Born", "Carrer de Montcada 15"],
    ["Platja de la Barceloneta", "natural:beach", 41.37836, 2.1925, "La Barceloneta", null],
    ["Bar Cañete", "amenity:restaurant", 41.37904, 2.17345, "El Raval", "Carrer de la Unió 17"],
    ["El Xampanyet", "amenity:bar", 41.38464, 2.18128, "El Born", "Carrer de Montcada 22"],
    ["Bunkers del Carmel", "tourism:viewpoint", 41.41893, 2.16172, "El Carmel", null],
  ],
  "Madrid, Spain": [
    ["Mercado de San Miguel", "amenity:marketplace", 40.41543, -3.70897, "Sol", "Plaza de San Miguel"],
    ["Museo del Prado", "tourism:museum", 40.41378, -3.69212, "Jerónimos", "Calle de Ruiz de Alarcón 23"],
    ["Parque del Retiro", "leisure:park", 40.4153, -3.6845, "Retiro", null],
    ["Chocolatería San Ginés", "amenity:cafe", 40.41696, -3.70699, "Sol", "Pasadizo de San Ginés 5"],
    ["Sobrino de Botín", "amenity:restaurant", 40.41421, -3.70815, "Centro", "Calle de Cuchilleros 17"],
    ["Templo de Debod", "historic:archaeological_site", 40.42402, -3.71776, "Argüelles", "Calle de Ferraz 1"],
    ["Museo Reina Sofía", "tourism:museum", 40.40795, -3.6944, "Embajadores", "Calle de Santa Isabel 52"],
  ],
  "Lisbon, Portugal": [
    ["Time Out Market Lisboa", "amenity:food_court", 38.707, -9.1459, "Cais do Sodré", "Avenida 24 de Julho 49"],
    ["Miradouro da Senhora do Monte", "tourism:viewpoint", 38.71919, -9.13283, "Graça", null],
    ["Pastéis de Belém", "amenity:cafe", 38.69754, -9.20322, "Belém", "Rua de Belém 84"],
    ["MAAT", "tourism:museum", 38.69575, -9.19395, "Belém", "Avenida Brasília"],
    ["Torre de Belém", "tourism:attraction", 38.69158, -9.21598, "Belém", "Avenida Brasília"],
    ["Castelo de São Jorge", "historic:castle", 38.71394, -9.1335, "Castelo", "Rua de Santa Cruz do Castelo"],
    ["A Ginjinha", "amenity:bar", 38.7146, -9.1384, "Baixa", "Largo de São Domingos 8"],
    ["LX Factory", "tourism:attraction", 38.7035, -9.1784, "Alcântara", "Rua Rodrigues de Faria 103"],
  ],
  "Porto, Portugal": [
    ["Livraria Lello", "shop:books", 41.14693, -8.61484, "Baixa", "Rua das Carmelitas 144"],
    ["Ponte Luís I", "man_made:bridge", 41.14004, -8.60941, "Ribeira", null],
    ["Majestic Café", "amenity:cafe", 41.14713, -8.60666, "Baixa", "Rua de Santa Catarina 112"],
    ["Mercado do Bolhão", "amenity:marketplace", 41.14944, -8.60574, "Baixa", "Rua Formosa"],
    ["Museu de Serralves", "tourism:museum", 41.15969, -8.65968, "Lordelo do Ouro", "Rua Dom João de Castro 210"],
    ["Praia do Homem do Leme", "natural:beach", 41.15925, -8.68272, "Nevogilde", null],
    ["Torre dos Clérigos", "tourism:attraction", 41.14573, -8.61437, "Baixa", "Rua de São Filipe de Nery"],
    ["Casa Guedes", "amenity:restaurant", 41.1457, -8.603, "Bonfim", "Praça dos Poveiros 130"],
  ],
  "Tokyo, Japan": [
    ["Tsukiji Outer Market", "amenity:marketplace", 35.66543, 139.77068, "Tsukiji", null],
    ["Meiji Jingu", "amenity:place_of_worship", 35.67637, 139.69934, "Shibuya", null],
    ["teamLab Planets", "tourism:museum", 35.64912, 139.78977, "Toyosu", null],
    ["Golden Gai", "amenity:bar", 35.69395, 139.70457, "Shinjuku", null],
    ["Shibuya Sky", "tourism:viewpoint", 35.65848, 139.70221, "Shibuya", null],
    ["Sensō-ji", "amenity:place_of_worship", 35.71477, 139.79665, "Asakusa", null],
    ["Ueno Park", "leisure:park", 35.71556, 139.77345, "Ueno", null],
    ["Fuunji", "amenity:restaurant", 35.6873, 139.6986, "Yoyogi", null],
  ],
  "Kyoto, Japan": [
    ["Fushimi Inari Taisha", "amenity:place_of_worship", 34.96714, 135.77267, "Fushimi", null],
    ["Kinkaku-ji", "tourism:attraction", 35.03937, 135.72924, "Kita", null],
    ["Arashiyama Bamboo Grove", "natural:wood", 35.017, 135.6713, "Arashiyama", null],
    ["Nishiki Market", "amenity:marketplace", 35.005, 135.7647, "Nakagyō", null],
    ["Kiyomizu-dera", "amenity:place_of_worship", 34.99485, 135.78505, "Higashiyama", null],
    ["% Arabica Kyoto Higashiyama", "amenity:cafe", 34.9983, 135.7801, "Higashiyama", null],
    ["Pontochō", "highway:pedestrian", 35.0076, 135.771, "Nakagyō", null],
  ],
  "Paris, France": [
    ["Musée du Louvre", "tourism:museum", 48.86061, 2.33764, "1st Arrondissement", "Rue de Rivoli"],
    ["Eiffel Tower", "tourism:attraction", 48.85826, 2.2945, "7th Arrondissement", "Avenue Anatole France 5"],
    ["Musée d'Orsay", "tourism:museum", 48.85998, 2.32656, "7th Arrondissement", "Esplanade Valéry Giscard d'Estaing 1"],
    ["Café de Flore", "amenity:cafe", 48.85417, 2.33256, "Saint-Germain-des-Prés", "Boulevard Saint-Germain 172"],
    ["Jardin du Luxembourg", "leisure:park", 48.8462, 2.3372, "6th Arrondissement", null],
    ["Le Comptoir du Relais", "amenity:restaurant", 48.85213, 2.33893, "Odéon", "Carrefour de l'Odéon 9"],
    ["Sacré-Cœur", "amenity:place_of_worship", 48.8867, 2.3431, "Montmartre", "Parvis du Sacré-Cœur 35"],
    ["Marché des Enfants Rouges", "amenity:marketplace", 48.8628, 2.3618, "Le Marais", "Rue de Bretagne 39"],
  ],
  "Mexico City, Mexico": [
    ["Museo Nacional de Antropología", "tourism:museum", 19.426, -99.1863, "Chapultepec", "Avenida Paseo de la Reforma"],
    ["Bosque de Chapultepec", "leisure:park", 19.4204, -99.1819, "Chapultepec", null],
    ["Museo Frida Kahlo", "tourism:museum", 19.35511, -99.16245, "Coyoacán", "Londres 247"],
    ["Mercado de Coyoacán", "amenity:marketplace", 19.3518, -99.1619, "Coyoacán", "Ignacio Allende"],
    ["Palacio de Bellas Artes", "amenity:theatre", 19.4352, -99.1412, "Centro Histórico", "Avenida Juárez"],
    ["Contramar", "amenity:restaurant", 19.4196, -99.1667, "Roma Norte", "Calle de Durango 200"],
    ["Café de Tacuba", "amenity:restaurant", 19.4363, -99.1365, "Centro Histórico", "Calle de Tacuba 28"],
    ["Bar La Ópera", "amenity:bar", 19.4344, -99.1389, "Centro Histórico", "Avenida 5 de Mayo 10"],
  ],
  "Rome, Italy": [
    ["Colosseum", "tourism:attraction", 41.89021, 12.49223, "Monti", "Piazza del Colosseo"],
    ["Pantheon", "tourism:attraction", 41.89861, 12.47687, "Pigna", "Piazza della Rotonda"],
    ["Trevi Fountain", "amenity:fountain", 41.90093, 12.48331, "Trevi", "Piazza di Trevi"],
    ["Galleria Borghese", "tourism:museum", 41.9142, 12.4921, "Pinciano", "Piazzale Scipione Borghese 5"],
    ["Villa Borghese", "leisure:park", 41.9128, 12.4852, "Pinciano", null],
    ["Campo de' Fiori", "amenity:marketplace", 41.89565, 12.47221, "Parione", null],
    ["Roscioli", "amenity:restaurant", 41.894, 12.4744, "Regola", "Via dei Giubbonari 21"],
    ["Sant'Eustachio Il Caffè", "amenity:cafe", 41.8981, 12.4754, "Sant'Eustachio", "Piazza di Sant'Eustachio 82"],
  ],
  "New York, United States": [
    ["The Metropolitan Museum of Art", "tourism:museum", 40.77941, -73.96323, "Upper East Side", "Fifth Avenue 1000"],
    ["Central Park", "leisure:park", 40.78253, -73.96559, "Manhattan", null],
    ["Katz's Delicatessen", "amenity:restaurant", 40.72223, -73.98742, "Lower East Side", "East Houston Street 205"],
    ["The High Line", "leisure:park", 40.74799, -74.00476, "Chelsea", null],
    ["Top of the Rock", "tourism:viewpoint", 40.75927, -73.97945, "Midtown", "Rockefeller Plaza 30"],
    ["Brooklyn Bridge", "man_made:bridge", 40.70608, -73.99686, "Lower Manhattan", null],
    ["Chelsea Market", "amenity:food_court", 40.74241, -74.0061, "Chelsea", "Ninth Avenue 75"],
    ["The Dead Rabbit", "amenity:bar", 40.70317, -74.0111, "Financial District", "Water Street 30"],
  ],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ'’]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
const slug = (s: string) => norm(s).replace(/ /g, "-");
const words = (s: string) => norm(s).split(" ").filter(Boolean);

type FixtureArea = AreaHit & { names: string[] };

const AREA_HITS: FixtureArea[] = AREAS.map(([name, alt, country, label, lat, lon, bbox]) => ({
  key: `fx:area:${slug(country ? `${name} ${country}` : name)}`,
  name,
  country,
  label,
  lat,
  lon,
  bbox,
  names: [name, ...alt],
}));

const cityOf = (where: string) => AREA_HITS.find((a) => a.country && `${a.name}, ${a.country}` === where)!;
const countryOf = (name: string) => AREA_HITS.find((a) => !a.country && a.name === name);

type Spot = { slug: string; feature: PhotonFeature; country: string; names: string[]; hay: string[] };

const ALL_SPOTS: Spot[] = Object.entries(SPOTS).flatMap(([where, spots]) => {
  const city = cityOf(where);
  const country = countryOf(city.country!);
  return spots.map(([name, tag, lat, lon, hood, street], i): Spot => {
    const [osm_key, osm_value] = tag.split(":");
    const feature: PhotonFeature = {
      geometry: { coordinates: [lon, lat] },
      properties: {
        osm_type: "N",
        osm_id: i,
        osm_key,
        osm_value,
        type: "house",
        name,
        street: street ?? undefined,
        district: hood ?? undefined,
        city: city.name,
        country: city.country!,
      },
    };
    return {
      slug: slug(name),
      feature,
      country: city.country!,
      // What a spot can be found by when an area has no bounds: its city's and country's names.
      names: [...city.names, ...(country?.names ?? [city.country!])].map(norm),
      hay: words(`${name} ${hood ?? ""} ${city.names.join(" ")}`),
    };
  });
});

function inBBox([west, south, east, north]: BBox, lat: number, lon: number) {
  const inLon = west <= east ? lon >= west && lon <= east : lon >= west || lon <= east;
  return inLon && lat >= south && lat <= north;
}

const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const rad = Math.PI / 180;
  const x = (bLon - aLon) * rad * Math.cos(((aLat + bLat) / 2) * rad);
  const y = (bLat - aLat) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
};

/** Inside the bbox; with none, near the position or named like the spot's city or country. */
function spotsIn(area: Area): Spot[] {
  const inside = ALL_SPOTS.filter((s) => {
    const [lon, lat] = s.feature.geometry!.coordinates!;
    if (area.bbox) return inBBox(area.bbox, lat, lon);
    if (area.country && norm(area.country) !== norm(s.country)) return false;
    if (s.names.includes(norm(area.name))) return true;
    return area.lat != null && area.lon != null && km(area.lat, area.lon, lat, lon) <= 30;
  });
  return keepCountry(inside, (s) => s.country, area, true);
}

function toHit(s: Spot, area: Area): Hit {
  return { ...photonSpot(s.feature, area)!, key: `fx:spot:${s.slug}` };
}

/** Destinations whose name starts with the query's words; country names narrow it ("valencia spain"). */
export function fixtureAreas(text: string, limit: number): AreaHit[] {
  const wanted = words(text);
  if (!wanted.length) return [];
  const hits = AREA_HITS.filter((a) => {
    const names = a.names.flatMap(words);
    const hay = [...names, ...words(a.country ?? "")];
    return wanted.every((w) => hay.some((t) => t.startsWith(w))) && wanted.some((w) => names.some((t) => t.startsWith(w)));
  }).map(({ names, ...hit }) => hit);
  return rankAreas(hits, text, limit);
}

/** Spots inside `area` whose name, neighborhood, city or type has words starting with every query word. */
export function fixtureSpots(text: string, area: Area, limit: number): Hit[] {
  const wanted = words(text);
  if (!wanted.length) return [];
  const hits = spotsIn(area)
    .map((s) => ({ s, hit: toHit(s, area) }))
    .filter(({ s, hit }) => {
      const hay = [...s.hay, ...words(hit.place?.type ?? "")];
      return wanted.every((w) => hay.some((t) => t.startsWith(w)));
    })
    .map(({ hit }) => hit);
  return rankSpots(hits, text, limit);
}

/** The spots of one category inside `area`, in list order. Unknown categories are searched as text, like browseSpots. */
export function fixtureBrowse(category: string, area: Area, limit: number): Hit[] {
  const known = placeCategory(category);
  if (!known) return fixtureSpots(category, area, limit);
  return spotsIn(area)
    .map((s) => toHit(s, area))
    .filter((h) => h.categories.includes(known))
    .slice(0, limit);
}
