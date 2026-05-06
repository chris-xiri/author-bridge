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
