export type GeoMode = "metro_first" | "county_sweep" | "radius" | "zip_clusters";

export interface StateGeoData {
  state: string;
  cities: string[];
  counties: string[];
  clusters: string[];
  radiusMap?: Record<string, string[]>;
  nearbyKeywords?: Record<string, string[]>;
  countyCityMap?: Record<string, string[]>;
}

export const GEO_DATA: StateGeoData[] = [
  {
    state: "NY",
    cities: [
      "New York, NY",
      "Buffalo, NY",
      "Rochester, NY",
      "Albany, NY",
      "Syracuse, NY",
      "Yonkers, NY",
      "White Plains, NY",
      "Hempstead, NY",
    ],
    counties: [
      "Kings County, NY",
      "Queens County, NY",
      "New York County, NY",
      "Suffolk County, NY",
      "Nassau County, NY",
      "Erie County, NY",
      "Monroe County, NY",
      "Albany County, NY",
    ],
    clusters: [
      "100xx Manhattan, NY",
      "112xx Brooklyn, NY",
      "113xx Queens, NY",
      "117xx Long Island, NY",
    ],
    radiusMap: {
      "New York, NY": ["Yonkers, NY", "White Plains, NY", "Hempstead, NY"],
      "Buffalo, NY": ["Rochester, NY", "Syracuse, NY"],
      "Great Neck, NY": [
        "Manhasset, NY",
        "Port Washington, NY",
        "Roslyn, NY",
        "Garden City, NY",
        "Hempstead, NY",
      ],
      "Hempstead, NY": ["Garden City, NY", "Mineola, NY", "Great Neck, NY", "Uniondale, NY"],
      "White Plains, NY": ["Yonkers, NY", "New Rochelle, NY", "Scarsdale, NY", "Mount Vernon, NY"],
    },
    nearbyKeywords: {
      "great neck": ["Great Neck, NY", "Manhasset, NY", "Port Washington, NY", "Roslyn, NY"],
      manhasset: ["Manhasset, NY", "Great Neck, NY", "Port Washington, NY", "Roslyn, NY"],
      roslyn: ["Roslyn, NY", "Manhasset, NY", "Great Neck, NY", "Port Washington, NY"],
      "port washington": ["Port Washington, NY", "Great Neck, NY", "Manhasset, NY", "Roslyn, NY"],
      "garden city": ["Garden City, NY", "Mineola, NY", "Hempstead, NY", "Uniondale, NY"],
      "white plains": ["White Plains, NY", "Scarsdale, NY", "Yonkers, NY", "New Rochelle, NY"],
    },
    countyCityMap: {
      "Nassau County, NY": [
        "Great Neck, NY",
        "Manhasset, NY",
        "Port Washington, NY",
        "Roslyn, NY",
        "Garden City, NY",
        "New Hyde Park, NY",
        "Mineola, NY",
        "Westbury, NY",
        "East Meadow, NY",
        "Levittown, NY",
        "Massapequa, NY",
        "Long Beach, NY",
        "Hempstead, NY",
        "Uniondale, NY",
      ],
      "Suffolk County, NY": [
        "Huntington, NY",
        "Smithtown, NY",
        "Islip, NY",
        "Brookhaven, NY",
        "Patchogue, NY",
        "Babylon, NY",
      ],
      "Queens County, NY": [
        "Flushing, NY",
        "Astoria, NY",
        "Jamaica, NY",
        "Forest Hills, NY",
      ],
      "Kings County, NY": ["Brooklyn, NY", "Williamsburg, NY", "Park Slope, NY"],
      "New York County, NY": ["Manhattan, NY", "Harlem, NY", "Upper West Side, NY"],
      "Erie County, NY": ["Buffalo, NY", "Cheektowaga, NY", "Amherst, NY"],
      "Monroe County, NY": ["Rochester, NY", "Greece, NY", "Irondequoit, NY"],
      "Albany County, NY": ["Albany, NY", "Colonie, NY", "Guilderland, NY"],
    },
  },
  {
    state: "CA",
    cities: ["Los Angeles, CA", "San Diego, CA", "San Jose, CA", "San Francisco, CA", "Sacramento, CA"],
    counties: ["Los Angeles County, CA", "San Diego County, CA", "Orange County, CA", "Santa Clara County, CA"],
    clusters: ["900xx Los Angeles, CA", "921xx San Diego, CA", "941xx San Francisco, CA"],
  },
  {
    state: "TX",
    cities: ["Houston, TX", "Dallas, TX", "Austin, TX", "San Antonio, TX", "Fort Worth, TX"],
    counties: ["Harris County, TX", "Dallas County, TX", "Tarrant County, TX", "Bexar County, TX", "Travis County, TX"],
    clusters: ["770xx Houston, TX", "752xx Dallas, TX", "787xx Austin, TX"],
  },
  {
    state: "FL",
    cities: ["Miami, FL", "Orlando, FL", "Tampa, FL", "Jacksonville, FL", "St. Petersburg, FL"],
    counties: ["Miami-Dade County, FL", "Broward County, FL", "Orange County, FL", "Hillsborough County, FL"],
    clusters: ["331xx Miami, FL", "328xx Orlando, FL", "336xx Tampa, FL"],
  },
];

export const ALL_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

export interface ZipMapping {
  zip: string;
  town: string;
  county: string;
  state: string;
}

export const KNOWN_ZIP_MAP: Record<string, ZipMapping> = {
  "11020": { zip: "11020", town: "Great Neck, NY", county: "Nassau County, NY", state: "NY" },
  "11021": { zip: "11021", town: "Great Neck, NY", county: "Nassau County, NY", state: "NY" },
  "11022": { zip: "11022", town: "Great Neck, NY", county: "Nassau County, NY", state: "NY" },
  "11023": { zip: "11023", town: "Great Neck, NY", county: "Nassau County, NY", state: "NY" },
  "11024": { zip: "11024", town: "Great Neck, NY", county: "Nassau County, NY", state: "NY" },
  "11030": { zip: "11030", town: "Manhasset, NY", county: "Nassau County, NY", state: "NY" },
  "11040": { zip: "11040", town: "New Hyde Park, NY", county: "Nassau County, NY", state: "NY" },
  "11050": { zip: "11050", town: "Port Washington, NY", county: "Nassau County, NY", state: "NY" },
  "11501": { zip: "11501", town: "Mineola, NY", county: "Nassau County, NY", state: "NY" },
  "11530": { zip: "11530", town: "Garden City, NY", county: "Nassau County, NY", state: "NY" },
  "11550": { zip: "11550", town: "Hempstead, NY", county: "Nassau County, NY", state: "NY" },
  "11576": { zip: "11576", town: "Roslyn, NY", county: "Nassau County, NY", state: "NY" },
  "11787": { zip: "11787", town: "Smithtown, NY", county: "Suffolk County, NY", state: "NY" },
  "11743": { zip: "11743", town: "Huntington, NY", county: "Suffolk County, NY", state: "NY" },
  "11751": { zip: "11751", town: "Islip, NY", county: "Suffolk County, NY", state: "NY" },
  "11702": { zip: "11702", town: "Babylon, NY", county: "Suffolk County, NY", state: "NY" },
  "11772": { zip: "11772", town: "Patchogue, NY", county: "Suffolk County, NY", state: "NY" },
  "10601": { zip: "10601", town: "White Plains, NY", county: "Westchester County, NY", state: "NY" },
  "10701": { zip: "10701", town: "Yonkers, NY", county: "Westchester County, NY", state: "NY" },
  "12203": { zip: "12203", town: "Albany, NY", county: "Albany County, NY", state: "NY" },
  "14201": { zip: "14201", town: "Buffalo, NY", county: "Erie County, NY", state: "NY" },
  "14604": { zip: "14604", town: "Rochester, NY", county: "Monroe County, NY", state: "NY" },
};

export interface ResolvedGeoQuery {
  type: "zip" | "town" | "county" | "text";
  rawQuery: string;
  primaryLabel: string;
  state: string;
  county?: string;
  towns: string[];
  zipCode?: string;
}

export function resolveGeoQuery(query: string): ResolvedGeoQuery {
  const clean = query.trim().toLowerCase();
  const digits = clean.replace(/\D/g, "");

  // Check 5-digit zip or 3-digit prefix (e.g. 11023 or 117xx)
  if (digits.length >= 3 && digits.length <= 5 && /^\d+$/.test(digits)) {
    const exactZip = KNOWN_ZIP_MAP[digits];
    if (exactZip) {
      return {
        type: "zip",
        rawQuery: query,
        primaryLabel: `Zip ${digits} (${exactZip.town})`,
        state: exactZip.state,
        county: exactZip.county,
        towns: [exactZip.town],
        zipCode: digits,
      };
    }

    // Check cluster prefix e.g. 117 -> Long Island / Suffolk / Nassau
    if (digits.startsWith("110") || digits.startsWith("115")) {
      return {
        type: "zip",
        rawQuery: query,
        primaryLabel: `Zip Code ${digits}xx (Nassau County, NY)`,
        state: "NY",
        county: "Nassau County, NY",
        towns: ["Great Neck, NY", "Manhasset, NY", "Port Washington, NY", "Garden City, NY", "Mineola, NY"],
        zipCode: digits,
      };
    }
    if (digits.startsWith("117") || digits.startsWith("119")) {
      return {
        type: "zip",
        rawQuery: query,
        primaryLabel: `Zip Code ${digits}xx (Suffolk County, NY)`,
        state: "NY",
        county: "Suffolk County, NY",
        towns: ["Smithtown, NY", "Huntington, NY", "Islip, NY", "Patchogue, NY", "Babylon, NY"],
        zipCode: digits,
      };
    }
  }

  // Check NY County match
  const nyData = GEO_DATA.find((g) => g.state === "NY");
  if (nyData) {
    const matchedCounty = nyData.counties.find(
      (c) => c.toLowerCase().includes(clean) || clean.includes(c.toLowerCase().replace(" county, ny", ""))
    );
    if (matchedCounty) {
      const towns = nyData.countyCityMap?.[matchedCounty] ?? [];
      return {
        type: "county",
        rawQuery: query,
        primaryLabel: matchedCounty,
        state: "NY",
        county: matchedCounty,
        towns: towns.length > 0 ? towns : [matchedCounty],
      };
    }

    // Check Town match
    const matchedTown = nyData.cities.find((c) => c.toLowerCase().includes(clean));
    if (matchedTown) {
      // Find county for this town
      let parentCounty = "";
      if (nyData.countyCityMap) {
        for (const [cnty, tList] of Object.entries(nyData.countyCityMap)) {
          if (tList.some((t) => t.toLowerCase() === matchedTown.toLowerCase())) {
            parentCounty = cnty;
            break;
          }
        }
      }
      return {
        type: "town",
        rawQuery: query,
        primaryLabel: matchedTown,
        state: "NY",
        county: parentCounty || "Nassau County, NY",
        towns: [matchedTown],
      };
    }
  }

  // Default fallback text query
  const titleCaseQuery = query
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim();
  const hasState = /,?\s*[A-Z]{2}$/i.test(titleCaseQuery);
  const formattedTown = hasState ? titleCaseQuery : `${titleCaseQuery}, NY`;

  return {
    type: "text",
    rawQuery: query,
    primaryLabel: formattedTown,
    state: "NY",
    towns: [formattedTown],
  };
}

export interface GeoSuggestion {
  id: string;
  label: string;
  sublabel: string;
  type: "town" | "county" | "zip";
  value: string;
}

export function getGeoSuggestions(input: string): GeoSuggestion[] {
  const clean = input.trim().toLowerCase();
  if (!clean || clean.length < 2) return [];

  const list: GeoSuggestion[] = [];

  // 1. Zip suggestions
  for (const [z, info] of Object.entries(KNOWN_ZIP_MAP)) {
    if (z.startsWith(clean) || clean.includes(z)) {
      list.push({
        id: `zip-${z}`,
        label: `ZIP ${z}`,
        sublabel: `${info.town} • ${info.county}`,
        type: "zip",
        value: z,
      });
    }
  }

  const ny = GEO_DATA.find((g) => g.state === "NY");
  if (ny) {
    // 2. County suggestions
    for (const c of ny.counties) {
      if (c.toLowerCase().includes(clean)) {
        list.push({
          id: `county-${c}`,
          label: c,
          sublabel: "County Sweep Target",
          type: "county",
          value: c,
        });
      }
    }

    // 3. Town suggestions
    for (const t of ny.cities) {
      if (t.toLowerCase().includes(clean)) {
        list.push({
          id: `town-${t}`,
          label: t,
          sublabel: "Town / City Target",
          type: "town",
          value: t,
        });
      }
    }
  }

  return list.slice(0, 8);
}

