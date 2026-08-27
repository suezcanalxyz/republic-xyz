/**
 * Shared geolocation hotspot dictionary.
 * Used by rss-news, telegram, reddit, gdelt enrichment.
 * Covers ~90% of high-frequency geopolitical locations.
 */

export interface GeoMatch {
  coords: [number, number];
  name: string;
  country: string | null;
  category?: string;
}

const HOTSPOTS: Array<{ terms: string[]; coords: [number, number]; name: string; country: string | null; category?: string }> = [
  // Active conflicts
  { terms: ['gaza', 'rafah', 'khan younis', 'jabalia', 'beit lahia'],     coords: [34.3, 31.4],  name: 'Gaza Strip',           country: 'Palestine',  category: 'remote_warfare' },
  { terms: ['ukraine', 'kyiv', 'kharkiv', 'donetsk', 'zaporizhzhia', 'kherson', 'kursk', 'sumy', 'bakhmut', 'avdiivka'], coords: [32.0, 49.0], name: 'Ukraine', country: 'Ukraine', category: 'remote_warfare' },
  { terms: ['russia', 'moscow', 'kremlin', 'putin', 'wagner', 'russian army'], coords: [37.6, 55.7], name: 'Russia', country: 'Russia' },
  { terms: ['sudan', 'khartoum', 'darfur', 'rsf', 'rapid support'], coords: [32.5, 15.5],  name: 'Sudan',                country: 'Sudan',      category: 'remote_warfare' },
  { terms: ['red sea', 'houthi', 'bab el-mandeb', 'yemen', 'sanaa', 'aden', 'hodeidah'], coords: [43.5, 14.0], name: 'Red Sea / Yemen', country: 'Yemen', category: 'maritime_routes' },
  { terms: ['iran', 'tehran', 'isfahan', 'irgc', 'nuclear', 'uranium'],   coords: [51.4, 35.7],  name: 'Iran',                 country: 'Iran' },
  { terms: ['israel', 'tel aviv', 'jerusalem', 'idf', 'netanyahu'],        coords: [34.8, 31.5],  name: 'Israel',               country: 'Israel' },
  { terms: ['west bank', 'ramallah', 'settler', 'jenin', 'nablus'],        coords: [35.3, 31.9],  name: 'West Bank',            country: 'Palestine',  category: 'border_regimes' },
  { terms: ['lebanon', 'beirut', 'hezbollah', 'south lebanon'],            coords: [35.5, 33.9],  name: 'Lebanon',              country: 'Lebanon',    category: 'remote_warfare' },
  { terms: ['syria', 'damascus', 'aleppo', 'idlib', 'deir ez-zor'],        coords: [38.0, 35.0],  name: 'Syria',                country: 'Syria',      category: 'remote_warfare' },
  { terms: ['iraq', 'baghdad', 'mosul', 'pmu', 'popular mobilization'],    coords: [44.4, 33.3],  name: 'Iraq',                 country: 'Iraq',       category: 'remote_warfare' },
  { terms: ['taiwan', 'taipei', 'taiwan strait', 'pla navy'],              coords: [120.9, 23.7], name: 'Taiwan',               country: 'Taiwan',     category: 'maritime_routes' },
  { terms: ['south china sea', 'spratly', 'paracel', 'nine-dash'],         coords: [113.0, 13.0], name: 'South China Sea',      country: null,         category: 'maritime_routes' },
  { terms: ['north korea', 'pyongyang', 'dprk', 'kim jong'],               coords: [125.7, 39.0], name: 'North Korea',          country: 'North Korea', category: 'arms_trade' },
  { terms: ['mali', 'bamako', 'sahel', 'wagner africa'],                   coords: [-8.0, 17.0],  name: 'Mali / Sahel',         country: 'Mali',       category: 'remote_warfare' },
  { terms: ['burkina faso', 'ouagadougou', 'jnim'],                        coords: [-1.5, 12.4],  name: 'Burkina Faso',         country: 'Burkina Faso', category: 'remote_warfare' },
  { terms: ['niger', 'niamey', 'jnim niger'],                              coords: [2.1, 13.5],   name: 'Niger',                country: 'Niger',      category: 'remote_warfare' },
  { terms: ['somalia', 'mogadishu', 'al-shabaab', 'jubaland'],             coords: [45.3, 2.0],   name: 'Somalia',              country: 'Somalia',    category: 'remote_warfare' },
  { terms: ['ethiopia', 'addis ababa', 'tigray', 'amhara', 'oromia'],      coords: [38.7, 9.0],   name: 'Ethiopia',             country: 'Ethiopia',   category: 'remote_warfare' },
  { terms: ['myanmar', 'burma', 'naypyidaw', 'yangon', 'tatmadaw'],        coords: [96.1, 19.7],  name: 'Myanmar',              country: 'Myanmar',    category: 'remote_warfare' },
  { terms: ['afghanistan', 'kabul', 'taliban', 'islamic emirate'],         coords: [69.2, 34.5],  name: 'Afghanistan',          country: 'Afghanistan', category: 'remote_warfare' },
  { terms: ['haiti', 'port-au-prince', 'gang', 'haitian'],                 coords: [-72.3, 18.5], name: 'Haiti',                country: 'Haiti',      category: 'remote_warfare' },
  { terms: ['venezuela', 'caracas', 'maduro', 'guyana border'],            coords: [-66.9, 10.5], name: 'Venezuela',            country: 'Venezuela',  category: 'border_regimes' },
  { terms: ['colombia', 'bogota', 'farc', 'eln colombia'],                 coords: [-74.1, 4.7],  name: 'Colombia',             country: 'Colombia',   category: 'remote_warfare' },
  { terms: ['congo', 'drc', 'm23', 'kinshasa', 'goma', 'eastern congo'],   coords: [26.0, -4.0],  name: 'DRC / Eastern Congo',  country: 'DRC',        category: 'remote_warfare' },
  { terms: ['mozambique', 'cabo delgado', 'pemba', 'isis mozambique'],     coords: [40.5, -13.0], name: 'Mozambique',           country: 'Mozambique', category: 'remote_warfare' },
  { terms: ['central african republic', 'bangui', 'car'],                  coords: [18.6, 4.4],   name: 'Central African Republic', country: 'CAR',    category: 'remote_warfare' },
  { terms: ['chad', 'ndjamena', 'boko haram chad'],                        coords: [15.0, 13.5],  name: 'Chad',                 country: 'Chad',       category: 'remote_warfare' },
  // Maritime / Strategic
  { terms: ['mediterranean', 'lampedusa', 'crossing', 'migrant boat'],     coords: [13.0, 35.5],  name: 'Mediterranean',        country: null,         category: 'migration_rescue' },
  { terms: ['english channel', 'small boat', 'dover', 'calais'],           coords: [1.5, 51.0],   name: 'English Channel',      country: null,         category: 'migration_rescue' },
  { terms: ['libya', 'tripoli', 'benghazi', 'libyan coast guard'],         coords: [13.2, 32.9],  name: 'Libya',                country: 'Libya',      category: 'migration_rescue' },
  { terms: ['tunisia', 'sfax', 'tunis', 'lampedusa boat'],                 coords: [10.2, 36.8],  name: 'Tunisia',              country: 'Tunisia',    category: 'migration_rescue' },
  { terms: ['suez canal', 'suez', 'port said', 'ismailia'],                coords: [32.6, 30.0],  name: 'Suez Canal',           country: 'Egypt',      category: 'canal_politics' },
  { terms: ['strait of hormuz', 'hormuz', 'gulf of oman'],                 coords: [56.5, 26.5],  name: 'Strait of Hormuz',     country: null,         category: 'maritime_routes' },
  { terms: ['strait of malacca', 'malacca', 'singapore strait'],           coords: [104.0, 1.5],  name: 'Strait of Malacca',    country: null,         category: 'maritime_routes' },
  { terms: ['panama canal', 'panama'],                                     coords: [-79.7, 9.1],  name: 'Panama Canal',         country: 'Panama',     category: 'canal_politics' },
  { terms: ['bosporus', 'turkish strait', 'black sea'],                    coords: [29.0, 41.0],  name: 'Bosphorus / Black Sea', country: 'Turkey',    category: 'maritime_routes' },
  { terms: ['gulf of guinea', 'nigeria offshore', 'piracy atlantic'],      coords: [3.0, 3.0],    name: 'Gulf of Guinea',       country: null,         category: 'maritime_routes' },
  // Infrastructure / Energy
  { terms: ['gas pipeline', 'nord stream', 'baltic pipe', 'energy infra'], coords: [20.0, 55.0],  name: 'Energy infrastructure', country: null,        category: 'energy_extraction' },
  { terms: ['oil price', 'opec', 'crude', 'brent'],                        coords: [47.0, 24.0],  name: 'Gulf / OPEC',          country: null,         category: 'energy_extraction' },
  { terms: ['arctic', 'northern sea route', 'greenland', 'svalbard'],      coords: [25.0, 75.0],  name: 'Arctic',               country: null,         category: 'climate_fire_desert' },
  { terms: ['submarine cable', 'undersea cable', 'fiber cut', 'internet cable'], coords: [35.0, 30.0], name: 'Submarine cable',  country: null,        category: 'infrastructure_failure' },
  // Cyber / Surveillance
  { terms: ['cyber attack', 'hack', 'ransomware', 'apt group'],            coords: [0.0, 40.0],   name: 'Cyberspace',           country: null,         category: 'tech_surveillance' },
  { terms: ['drone strike', 'uav strike', 'shahed', 'loitering munition'], coords: [45.0, 35.0],  name: 'Drone operations',     country: null,         category: 'remote_warfare' },
  { terms: ['spyware', 'pegasus', 'surveillance', 'nso group'],            coords: [0.0, 25.0],   name: 'Surveillance ops',     country: null,         category: 'tech_surveillance' },
  // Geopolitical / Diplomatic
  { terms: ['nato', 'alliance', 'eastern flank', 'article 5'],             coords: [20.0, 52.0],  name: 'NATO Eastern Flank',   country: null },
  { terms: ['china', 'beijing', 'pla', 'xinjiang', 'tibet', 'hong kong'], coords: [116.4, 39.9],  name: 'China',                country: 'China' },
  { terms: ['pakistan', 'islamabad', 'karachi', 'isi pakistan'],           coords: [67.0, 30.0],  name: 'Pakistan',             country: 'Pakistan' },
  { terms: ['india', 'new delhi', 'kashmir', 'loc india'],                 coords: [77.1, 28.6],  name: 'India',                country: 'India' },
  { terms: ['arms transfer', 'weapons supply', 'military aid', 'f-16'],   coords: [0.0, 30.0],   name: 'Arms transfer',        country: null,         category: 'arms_trade' },
  { terms: ['sanctions', 'embargo', 'asset freeze', 'export control'],     coords: [0.0, 25.0],   name: 'Sanctions',            country: null,         category: 'gov_docs' },
  // Climate
  { terms: ['amazon', 'deforestation', 'brazil forest', 'cerrado'],        coords: [-60.0, -5.0], name: 'Amazon',               country: 'Brazil',     category: 'climate_fire_desert' },
  { terms: ['wildfire', 'forest fire', 'bushfire', 'incendio'],            coords: [0.0, 20.0],   name: 'Wildfire zone',        country: null,         category: 'climate_fire_desert' },
  { terms: ['flood', 'inundation', 'cyclone', 'typhoon'],                  coords: [90.0, 20.0],  name: 'Flood / storm zone',   country: null,         category: 'climate_fire_desert' },
];

export function geocodeText(text: string): GeoMatch | null {
  const lower = text.toLowerCase();
  for (const h of HOTSPOTS) {
    if (h.terms.some(t => lower.includes(t))) {
      return { coords: h.coords, name: h.name, country: h.country, category: h.category };
    }
  }
  return null;
}
