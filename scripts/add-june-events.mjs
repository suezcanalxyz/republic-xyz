import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, '../lib/seed-data.json');
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

const newEvents = [
  {
    id: 'iran-israel-ceasefire-fragile-2026',
    title: 'Iran-Israel Ceasefire: Fragile Pause',
    slug: 'iran-israel-ceasefire-2026',
    category: 'remote_warfare',
    tags: ['iran', 'israel', 'ceasefire', 'middle-east', 'escalation'],
    location: { name: 'Tehran / Tel Aviv corridor', country: null, region: 'mena', coordinates: [49.0, 32.0], confidence: 'high' },
    date: '2026-06-01', lastUpdated: '2026-06-14',
    summary: 'Ceasefire brokered in May 2026 between Iran and Israel remains under pressure. Proxy channels in Yemen, Lebanon and Iraq show continued activation. Both sides retain strike readiness.',
    whatHappened: 'Following direct strikes in April-May 2026, a US-mediated ceasefire halted major operations. Houthi and Hezbollah activity continues as pressure valves. IAEA access to Iranian facilities blocked.',
    status: 'published', visible: true, score: 91,
    verification: 'corroborated',
    sourceDiversity: ['cross_region', 'satellite_support'],
    sourceCluster: [
      { outlet: 'IAEA', country: null, region: 'institutional', url: 'https://www.iaea.org', publishedAt: '2026-06-10', language: 'en', title: 'IAEA Iran Nuclear Monitoring', sourceType: 'institutional', reliability: 'high' },
      { outlet: 'ACLED', country: null, region: 'institutional', url: 'https://acleddata.com', publishedAt: '2026-06-12', language: 'en', title: 'ACLED Middle East conflict tracker', sourceType: 'institutional', reliability: 'high' }
    ],
    perspectives: null,
    republicReading: 'The ceasefire formalizes a temporary equilibrium while structural confrontation — nuclear program, proxy networks, US guarantees — remains unresolved.',
    methodNote: 'Curated seed based on open-source intelligence synthesis.'
  },
  {
    id: 'ukraine-front-june-2026',
    title: 'Ukraine: Attrition Warfare — Drone Corridors and Kursk Salient',
    slug: 'ukraine-front-june-2026',
    category: 'remote_warfare',
    tags: ['ukraine', 'russia', 'frontline', 'kursk', 'drone-warfare', 'attrition'],
    location: { name: 'Eastern Ukraine / Kursk Oblast', country: 'Ukraine', region: 'europe', coordinates: [36.0, 50.5], confidence: 'high' },
    date: '2026-06-01', lastUpdated: '2026-06-14',
    summary: 'Ukrainian and Russian forces maintain attrition warfare across 1,000km+ front. Drone corridors dominate. No major territorial shifts since late 2025.',
    whatHappened: 'Summer 2026: drone warfare dominant. Both sides conducting deep strikes on infrastructure. Kursk salient contested. Air defense consumption critical constraint.',
    status: 'published', visible: true, score: 88,
    verification: 'corroborated',
    sourceDiversity: ['cross_region', 'satellite_support'],
    sourceCluster: [
      { outlet: 'ACLED', country: null, region: 'institutional', url: 'https://acleddata.com', publishedAt: '2026-06-14', language: 'en', title: 'ACLED Ukraine conflict tracker', sourceType: 'institutional', reliability: 'high' }
    ],
    perspectives: null, republicReading: null,
    methodNote: 'Curated from open-source conflict monitoring.'
  },
  {
    id: 'mediterranean-migration-summer-2026',
    title: 'Central Mediterranean: Summer Peak Crossing Season 2026',
    slug: 'med-crossing-summer-2026',
    category: 'migration_rescue',
    tags: ['migration', 'mediterranean', 'frontex', 'libya', 'tunisia', 'sar', 'summer'],
    location: { name: 'Central Mediterranean', country: null, region: 'mena', coordinates: [13.5, 34.0], confidence: 'high' },
    date: '2026-06-01', lastUpdated: '2026-06-14',
    summary: 'June 2026 summer crossing season: departure rates from Libya and Tunisia elevated. IOM reports sustained dead and missing toll. SAR coordination gaps persist.',
    whatHappened: 'Calmer summer seas driving departure increase from Libyan and Tunisian coasts. Italian port blocks contested legally. NGO SAR vessels active.',
    status: 'published', visible: true, score: 76,
    verification: 'corroborated',
    sourceDiversity: ['cross_region', 'local_available'],
    sourceCluster: [
      { outlet: 'IOM Missing Migrants Project', country: null, region: 'institutional', url: 'https://missingmigrants.iom.int', publishedAt: '2026-06-14', language: 'en', title: 'IOM Missing Migrants tracker June 2026', sourceType: 'institutional', reliability: 'high' },
      { outlet: 'UNHCR', country: null, region: 'institutional', url: 'https://data.unhcr.org', publishedAt: '2026-06-12', language: 'en', title: 'UNHCR Mediterranean arrivals 2026', sourceType: 'institutional', reliability: 'high' }
    ],
    perspectives: null,
    republicReading: 'Summer 2026 crossing peak follows seasonal pattern unchanged by policy: deterrence shifts routes, not volumes.',
    methodNote: 'Curated from IOM, UNHCR and NGO field reports.'
  },
  {
    id: 'red-sea-houthi-june-2026',
    title: 'Red Sea: Houthi Anti-Ship Operations Resume June 2026',
    slug: 'red-sea-houthi-june-2026',
    category: 'maritime_routes',
    tags: ['red-sea', 'houthi', 'yemen', 'shipping', 'anti-ship', 'suez-traffic'],
    location: { name: 'Red Sea / Bab el-Mandeb', country: 'Yemen', region: 'mena', coordinates: [43.5, 13.0], confidence: 'high' },
    date: '2026-06-03', lastUpdated: '2026-06-14',
    summary: 'Houthi anti-ship operations resumed in early June following collapse of US-Houthi talks. Cape route diversion remains dominant. Suez Canal revenues suppressed.',
    whatHappened: 'After brief pause in May, Houthi forces relaunched drone and missile strikes. Several tankers rerouted. US/allied naval presence maintained.',
    status: 'published', visible: true, score: 85,
    verification: 'corroborated',
    sourceDiversity: ['cross_region', 'ais_support', 'satellite_support'],
    sourceCluster: [
      { outlet: 'IMB Piracy Reporting Centre', country: null, region: 'institutional', url: 'https://www.icc-ccs.org', publishedAt: '2026-06-12', language: 'en', title: 'IMB Red Sea maritime security update', sourceType: 'institutional', reliability: 'high' },
      { outlet: 'Suez Canal Authority', country: 'Egypt', region: 'institutional', url: 'https://www.suezcanal.gov.eg', publishedAt: '2026-06-10', language: 'en', title: 'SCA Traffic and revenue statistics', sourceType: 'institutional', reliability: 'high' }
    ],
    perspectives: null,
    republicReading: 'Houthi maritime operations function as leverage in Yemen negotiations and Iranian proxy signaling — disruption is the instrument, not the goal.',
    methodNote: 'Curated from AIS data, IMB alerts and SCA statistics.'
  },
  {
    id: 'sudan-rsf-darfur-june-2026',
    title: 'Sudan: RSF Controls Darfur, 10M+ Displaced — Largest Crisis Globally',
    slug: 'sudan-rsf-darfur-june-2026',
    category: 'remote_warfare',
    tags: ['sudan', 'rsf', 'darfur', 'khartoum', 'ethnic-violence', 'humanitarian'],
    location: { name: 'Darfur / Khartoum', country: 'Sudan', region: 'africa', coordinates: [26.0, 14.5], confidence: 'high' },
    date: '2026-06-01', lastUpdated: '2026-06-14',
    summary: 'RSF controls most of Darfur and western Sudan. Khartoum split between SAF and RSF. UN estimates 10M+ displaced — largest displacement crisis globally.',
    whatHappened: 'Conflict enters third year with no ceasefire. RSF ethnic targeting documented. Humanitarian access severely restricted. SAF conducting airstrikes on RSF-held areas.',
    status: 'published', visible: true, score: 89,
    verification: 'corroborated',
    sourceDiversity: ['cross_region', 'satellite_support'],
    sourceCluster: [
      { outlet: 'UNOCHA', country: null, region: 'institutional', url: 'https://www.unocha.org/sudan', publishedAt: '2026-06-10', language: 'en', title: 'UNOCHA Sudan Humanitarian Update', sourceType: 'institutional', reliability: 'high' },
      { outlet: 'ACLED', country: null, region: 'institutional', url: 'https://acleddata.com', publishedAt: '2026-06-14', language: 'en', title: 'ACLED Sudan conflict tracker', sourceType: 'institutional', reliability: 'high' }
    ],
    perspectives: null,
    republicReading: 'Sudan 2026 is the largest displacement crisis in the world with the least international media coverage — structural invisibility in northern media systems.',
    methodNote: 'Curated from UNOCHA, ACLED and Human Rights Watch field reports.'
  },
  {
    id: 'gaza-ceasefire-stalled-june-2026',
    title: 'Gaza: Phase 2 Ceasefire Stalled, 50,000+ Dead',
    slug: 'gaza-june-2026',
    category: 'remote_warfare',
    tags: ['gaza', 'israel', 'hamas', 'ceasefire', 'humanitarian', 'reconstruction'],
    location: { name: 'Gaza Strip', country: 'Palestine', region: 'mena', coordinates: [34.3, 31.4], confidence: 'high' },
    date: '2026-06-01', lastUpdated: '2026-06-14',
    summary: 'Ceasefire Phase 2 negotiations stalled as of June 2026. Limited aid access, reconstruction blocked. Over 50,000 confirmed dead since October 2023. IDF maintains presence in northern Gaza.',
    whatHappened: 'Phase 2 hostage/prisoner exchange talks collapsed. International aid mechanisms partially restored but capacity far below need. ICC arrest warrants unexecuted.',
    status: 'published', visible: true, score: 93,
    verification: 'corroborated',
    sourceDiversity: ['cross_region', 'satellite_support', 'visual_evidence'],
    sourceCluster: [
      { outlet: 'UNOCHA', country: null, region: 'institutional', url: 'https://www.unocha.org/gaza', publishedAt: '2026-06-13', language: 'en', title: 'UNOCHA Gaza Humanitarian Situation Report', sourceType: 'institutional', reliability: 'high' },
      { outlet: 'ICC', country: null, region: 'institutional', url: 'https://www.icc-cpi.int', publishedAt: '2026-05-20', language: 'en', title: 'ICC Gaza arrest warrant status', sourceType: 'institutional', reliability: 'high' }
    ],
    perspectives: null, republicReading: null,
    methodNote: 'Curated from UNOCHA, UNWRA and ICC documentation.'
  },
  {
    id: 'sahel-aes-africa-corps-june-2026',
    title: 'Sahel AES Bloc: Africa Corps Consolidation, Jihadist Expansion',
    slug: 'sahel-aes-june-2026',
    category: 'remote_warfare',
    tags: ['sahel', 'mali', 'burkina-faso', 'niger', 'aes', 'africa-corps', 'jihadist'],
    location: { name: 'Sahel — Mali / Burkina Faso / Niger', country: null, region: 'africa', coordinates: [-2.0, 14.0], confidence: 'high' },
    date: '2026-06-01', lastUpdated: '2026-06-14',
    summary: 'Alliance des Etats du Sahel consolidates under Russian Africa Corps presence. JNIM and ISGS active across tri-border. French and ECOWAS influence near zero.',
    whatHappened: 'AES established security pact with Russia. Africa Corps operating in all three countries. Civilian atrocity reports from multiple fronts. MINUSMA fully withdrawn.',
    status: 'published', visible: true, score: 80,
    verification: 'corroborated',
    sourceDiversity: ['cross_region', 'satellite_support'],
    sourceCluster: [
      { outlet: 'ACLED', country: null, region: 'institutional', url: 'https://acleddata.com', publishedAt: '2026-06-14', language: 'en', title: 'ACLED Sahel conflict tracker', sourceType: 'institutional', reliability: 'high' }
    ],
    perspectives: null,
    republicReading: 'The Sahel realignment is not a security vacuum but a sovereignty experiment — AES states choosing a different external patron with different terms.',
    methodNote: 'Curated from ACLED and open-source Sahel monitoring.'
  },
  {
    id: 'taiwan-strait-pla-june-2026',
    title: 'Taiwan Strait: PLA Exercises Escalate After US Arms Deal',
    slug: 'taiwan-strait-pla-june-2026',
    category: 'maritime_routes',
    tags: ['taiwan', 'china', 'pla', 'strait', 'exercises', 'us-arms', 'deterrence'],
    location: { name: 'Taiwan Strait', country: null, region: 'asia-pacific', coordinates: [120.5, 24.5], confidence: 'high' },
    date: '2026-06-05', lastUpdated: '2026-06-14',
    summary: 'PLA naval exercises in Taiwan Strait escalated in June 2026 following US approval of new arms package. Commercial traffic disrupted 72h. US carrier group repositioned.',
    whatHappened: 'China announced live-fire exercise zones after US$8B arms deal approval. Civilian airline routes modified. Taiwan ADIZ incursions daily. US 7th Fleet repositioned.',
    status: 'published', visible: true, score: 87,
    verification: 'corroborated',
    sourceDiversity: ['cross_region', 'ais_support', 'satellite_support'],
    sourceCluster: [
      { outlet: 'CSIS China Power', country: 'US', region: 'west', url: 'https://chinapower.csis.org', publishedAt: '2026-06-10', language: 'en', title: 'CSIS Taiwan Strait incident tracker', sourceType: 'think_tank', reliability: 'medium' }
    ],
    perspectives: null, republicReading: null,
    methodNote: 'Curated from open-source AIS, ADIZ tracking and official statements.'
  }
];

const existingIds = new Set(data.events.map(e => e.id));
const toAdd = newEvents.filter(e => !existingIds.has(e.id));
data.events = [...toAdd, ...data.events];
data.updated = '2026-06-14';

writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log('Added', toAdd.length, 'events. Total:', data.events.length);
