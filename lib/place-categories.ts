// Spot categories. Client-safe (no server-only import): the UI uses these lists for filters and quick browsing.

/** The categories we auto-assign to spots, like PODCAST_CATEGORIES in lib/genres.ts. Users can also type their own. */
export const PLACE_CATEGORIES = [
  "Food & Drink",
  "Cafés",
  "Bars & Nightlife",
  "Museums & Culture",
  "Sights",
  "Beaches & Nature",
  "Shopping",
  "Stays",
  "Activities",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];
export const isPlaceCategory = (c: unknown): c is PlaceCategory => PLACE_CATEGORIES.includes(c as PlaceCategory);

/** Icon hints for quick browsing. The UI maps them to its own icons. */
export type SpotBrowseIcon = "food" | "coffee" | "glass" | "museum" | "camera" | "leaf" | "bag";

/** One-tap browsing inside a destination ("Museums in Valencia"). */
export const SPOT_BROWSE: readonly { category: PlaceCategory; label: string; icon: SpotBrowseIcon }[] = [
  { category: "Food & Drink", label: "Restaurants", icon: "food" },
  { category: "Cafés", label: "Cafés", icon: "coffee" },
  { category: "Bars & Nightlife", label: "Bars", icon: "glass" },
  { category: "Museums & Culture", label: "Museums", icon: "museum" },
  { category: "Sights", label: "Sights", icon: "camera" },
  { category: "Beaches & Nature", label: "Beaches & parks", icon: "leaf" },
  { category: "Shopping", label: "Shops", icon: "bag" },
];

/** A category from its name or its quick-browse label, ignoring case ("museums" → "Museums & Culture"). */
export function placeCategory(input: string): PlaceCategory | null {
  const s = input.trim().toLowerCase();
  return (
    PLACE_CATEGORIES.find((c) => c.toLowerCase() === s) ??
    SPOT_BROWSE.find((b) => b.label.toLowerCase() === s)?.category ??
    null
  );
}

// Each rule matches raw OpenStreetMap tags ("amenity:restaurant", "shop:bakery") and Google Places types
// ("restaurant", "spanish_restaurant", "lodging"). OSM rules are anchored on their key; Google types have no colon.
// One tag can land in two categories (a market is food and shopping). Order matters: earlier rules come first.
const RULES: [PlaceCategory, RegExp][] = [
  [
    "Food & Drink",
    /^amenity:(restaurant|fast_food|food_court|marketplace)$|^shop:(deli|cheese|seafood|butcher)$|^(restaurant|\w+_restaurant|meal_takeaway|meal_delivery|food_court|diner|steak_house|deli|sandwich_shop|bar_and_grill|market|farmers_market)$/,
  ],
  [
    "Cafés",
    /^amenity:(cafe|ice_cream)$|^shop:(coffee|tea|pastry|confectionery|chocolate|bakery)$|^(cafe|coffee_shop|tea_house|cafeteria|cat_cafe|dog_cafe|ice_cream_shop|bakery|dessert_shop|donut_shop|bagel_shop|confectionery|chocolate_shop|juice_shop|acai_shop)$/,
  ],
  [
    "Bars & Nightlife",
    /^amenity:(bar|pub|nightclub|biergarten)$|^craft:(brewery|winery)$|^(bar|\w+_bar|bar_and_grill|pub|\w+_pub|night_club|brewpub|beer_garden|brewery|winery|karaoke)$/,
  ],
  [
    "Museums & Culture",
    /^tourism:(museum|gallery)$|^amenity:(theatre|arts_centre|concert_hall|library|planetarium|exhibition_centre)$|^(museum|\w+_museum|art_gallery|performing_arts_theater|opera_house|concert_hall|philharmonic_hall|cultural_center|auditorium|amphitheatre|library|planetarium)$/,
  ],
  [
    "Sights",
    /^tourism:(attraction|viewpoint|artwork)$|^historic:|^amenity:(place_of_worship|fountain)$|^building:(cathedral|church|chapel|basilica|mosque|temple|shrine|synagogue)$|^man_made:(lighthouse|tower|bridge|pier|obelisk)$|^highway:pedestrian$|^(tourist_attraction|historical_landmark|historical_place|cultural_landmark|monument|sculpture|observation_deck|plaza|town_square|church|hindu_temple|buddhist_temple|shinto_shrine|mosque|synagogue|place_of_worship|castle|bridge)$/,
  ],
  [
    "Beaches & Nature",
    /^natural:|^leisure:(park|garden|nature_reserve|beach_resort|dog_park)$|^boundary:(national_park|protected_area)$|^waterway:waterfall$|^tourism:picnic_site$|^(beach|park|city_park|national_park|state_park|dog_park|garden|botanical_garden|hiking_area|nature_preserve|natural_feature|wildlife_park|wildlife_refuge|scenic_spot|lake|island|mountain_peak|woods)$/,
  ],
  [
    "Shopping",
    /^shop:(?!(deli|cheese|seafood|butcher|coffee|tea|pastry|confectionery|chocolate|bakery|ice_cream)$)|^amenity:marketplace$|^(\w+_store|shopping_mall|outlet_mall|department_store|market|flea_market|gift_shop|supermarket|discount_supermarket)$/,
  ],
  [
    "Stays",
    /^tourism:(hotel|hostel|guest_house|motel|apartment|chalet|camp_site|caravan_site|alpine_hut|wilderness_hut)$|^(lodging|hotel|\w+_hotel|hostel|motel|bed_and_breakfast|guest_house|inn|japanese_inn|budget_japanese_inn|campground|camping_cabin|rv_park|cottage|farmstay|private_guest_room)$/,
  ],
  [
    "Activities",
    /^tourism:(zoo|aquarium|theme_park)$|^leisure:(water_park|stadium|sports_centre|amusement_arcade|escape_game|bowling_alley|golf_course|miniature_golf|ice_rink|marina|horse_riding)$|^amenity:(cinema|casino|public_bath)$|^(amusement_park|water_park|zoo|aquarium|bowling_alley|casino|movie_theater|stadium|arena|ski_resort|golf_course|marina|spa|tour_agency|go_karting_venue|ice_skating_rink|skateboard_park|sports_complex|adventure_sports_center|hiking_area)$/,
  ],
];

/** Broad Google types, used only when nothing more specific matched. */
const GENERIC: [PlaceCategory, RegExp][] = [
  ["Food & Drink", /^food$/],
  ["Shopping", /^store$/],
];

function apply(tags: string[], rules: [PlaceCategory, RegExp][], out: Set<PlaceCategory>) {
  for (const tag of tags) for (const [category, re] of rules) if (re.test(tag)) out.add(category);
}

/**
 * Map a spot's raw tags to one or two categories. Takes OSM "key:value" tags ("amenity:restaurant",
 * "natural:beach"; "key=value" works too) or Google Places types ("restaurant", "tourist_attraction"),
 * most important first. Gives [] when nothing is recognizable (a bank, an office).
 */
export function categorizeSpot(tags: string[]): PlaceCategory[] {
  const clean = tags.slice(0, 20).map((t) => t.trim().toLowerCase().replace("=", ":")).filter(Boolean);
  const out = new Set<PlaceCategory>();
  apply(clean, RULES, out);
  if (!out.size) apply(clean, GENERIC, out);
  return [...out].slice(0, 2);
}
