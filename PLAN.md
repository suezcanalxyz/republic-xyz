# ATLAS — republic.suezcanal.xyz
## Piano operativo e ottimizzazioni

---

## DEPLOY IMMEDIATO

### 1. Vercel setup
- Push repo su GitHub (nuovo repo `republic-atlas` o monorepo)
- Importa su Vercel → Framework: Next.js → Root directory: `republic-xyz/`
- Env vars da impostare:
  - `NEXT_PUBLIC_CESIUM_TOKEN` → vedi `.env.local`
  - `DATABASE_URL` → Neon o Supabase (opzionale per MVP, API usa seed JSON)
  - `DIRECT_URL` → come sopra
- DNS: aggiungi CNAME `republic` → `cname.vercel-dns.com` su Aruba

### 2. Database (Phase 1 completo)
- Crea DB Postgres su [Neon](https://neon.tech) (free tier ok per MVP)
- Abilita estensioni: `CREATE EXTENSION postgis; CREATE EXTENSION vector;`
- `npm run db:push` per creare schema
- `npm run db:seed` per popolare con eventi da events.json (script da scrivere in `scripts/seed-db.ts`)

---

## PHASE 2 — Ingestion pipeline

### GDELT live feed
- [ ] Scrivere `lib/ingest/gdelt.ts` — query DOC 2.0 API per categoria
- [ ] Vercel Cron job: `app/api/cron/ingest/route.ts` (ogni 15 min)
- [ ] Geolocalizzazione headline → PostGIS point via gazetteer o geocoder
- [ ] Deduplicazione idempotente via `externalId`
- [ ] Archiviazione su oggetto storage (R2 o S3) per archivio storico

### RSS feeds curati
- [ ] Scrivere `lib/ingest/rss.ts` — parser per feed istituzionali
- [ ] Feed prioritari: ACLED, UNHCR, IOM, UNCTAD, SIPRI, UN OCHA, Bellingcat, Global Fishing Watch
- [ ] Score automatico per ogni segnale ingestito (formula in `lib/seed.ts` già implementata)

### Claim extraction
- [ ] Pipeline NLP per estrarre claims da articoli (verbo + soggetto + oggetto)
- [ ] Linkare claims a segnali esistenti via GraphEdge `CONTAINS_CLAIM`
- [ ] Contradiction detection: stessa location, stessa finestra temporale, claims opposti

---

## PHASE 3 — Layer di evidenza

### Satellite / Remote sensing
- [ ] NASA FIRMS: `lib/layers/firms.ts` — fire alerts via `NEXT_PUBLIC_NASA_FIRMS_KEY`
  - Endpoint: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_SNPP_NRT/{bbox}/{days}`
- [ ] Copernicus/Sentinel Hub: placeholder `lib/layers/sentinel.ts`
  - Priorità: SST anomalie Med, flood detection, smoke/fumo da incendi
- [ ] Google Earth Engine: future integration via EE API key

### AIS / Maritime layer
- [ ] `lib/layers/ais.ts` — solo vessel reference, no live tracking generico
- [ ] Attivazione solo inside: SeaCommons module, investigation aperta, vessel linkato a segnale
- [ ] Sources: Global Fishing Watch API, Vessel Finder (polled, non streaming)
- [ ] Privacy: nessun real-time omnibus — solo evidence-linked, event-scoped

### ADS-B / Aviation layer
- [ ] `lib/layers/adsb.ts` — aircraft traces from public sources
- [ ] Sources: ADS-B Exchange API, OpenSky Network, ADSBHub
- [ ] Use cases: surveillance flights, border patrol, military (dove pubblicamente disponibile)
- [ ] Delay minimo 15 min per operazioni militari sensibili

### Social / Visual evidence
- [ ] `lib/layers/social.ts` — schema SocialTrace già in DB
- [ ] Flusso manuale per ora: curator aggiunge URL + note geolocalizzazione
- [ ] Futuro: Telegram webhook per feed OSINT (CIT, OSINTdefender, war_monitor, etc.)

---

## PHASE 4 — Moduli futuri

### SeaCommons
- [ ] Rotta: `app/seacommons/page.tsx`
- [ ] Globe filtrato: solo migration_rescue + maritime_routes + border_regimes
- [ ] Layer extra: SAR zones, NGO vessels, Alarm Phone reports, Frontex operations
- [ ] Integration: UNHCR Mediterranean data portal, IOM Missing Migrants, GEOSAR

### Investigations
- [ ] Rotta: `app/investigations/[slug]/page.tsx`
- [ ] Ogni caso: segnali selezionati + timeline + mappa dedicata + evidence stack + Republic Reading
- [ ] Editor privato per curatori (auth Phase 4)
- [ ] Export: PDF dossier, GeoJSON, timeline embed

### Technology Signals
- [ ] Rotta: `app/tech/page.tsx`
- [ ] Track: AI model releases, chip export controls, data center incidents, satellite launches
- [ ] Sources: Bloomberg, Reuters, The Register, SemiAnalysis, Import-Export records

### Dispatch
- [ ] `app/dispatch/page.tsx` — archivio report settimanali
- [ ] Newsletter via Resend o Mailchimp API

### Auth / Private rooms
- [ ] Auth: NextAuth.js + Credentials o Magic Link
- [ ] Ruoli: `public_viewer | contributor | verifier | curator | admin`
- [ ] Private routes: `/private/investigations`, `/private/queue`, `/private/drafts`

---

## OTTIMIZZAZIONI TECNICHE

### Globe performance
- [ ] Viewport-based loading: il client manda bbox+zoom, API restituisce solo segnali visibili
  → già struttura pronta in `/api/atlas/globe`, da connettere al camera move event di Cesium
- [ ] Debounce camera move: 250ms prima di refetch (evita flood su pan rapido)
- [ ] Pre-aggregazione server-side per zoom bassi (planetary): max 50 cluster, top seeds only
- [ ] 3D Tiles: attiva Cesium World Terrain solo se token valido (già gestito nel component)
- [ ] LOD: zoom 0-3 → solo SEED signals; zoom 4-6 → +MEDIUM; zoom 7+ → tutto

### API
- [ ] Edge Runtime per `/api/atlas/globe` (rimuovi fs.readFileSync, usa fetch da URL)
- [ ] Cache tile-based: chiave = `{zoom}:{x}:{y}:{timeWindow}:{layers}` → Redis o Vercel KV
- [ ] Endpoint `/api/atlas/cluster/:id` per espandere cluster senza refetch globe

### DB queries
- [ ] Indice PostGIS spatial: `CREATE INDEX signals_geom_idx ON signals USING GIST(location_geom)`
- [ ] Indice pgvector: per futuro similarity search su summary embeddings
- [ ] `ST_ClusterKMeans` per clustering server-side a basso zoom

### UI
- [ ] Semantic zoom reattivo: usare `viewer.camera.changed` event per aggiornare zoom state
- [ ] Pulse animation per SHORT_ALERT attivi (Cesium entity property animation)
- [ ] Cluster tooltip: "28 segnali / 6 disputed / 3 satellite" (campo già in ClusteredSignal)
- [ ] Mobile: drawer bottom sheet al posto di pannello laterale (già CSS ready in SignalInspector)
- [ ] Dark basemap alternativa: Mapbox Dark Vector (richiede token Mapbox, già pattern nel forensic map)

### Seed data
- [ ] Aggiornare `events.json` in suezcanal.xyz/republic/atlas/data/ con nuovi segnali settimanali
- [ ] Curare `republicReading` per i 8 segnali published esistenti
- [ ] Aggiungere `perspectives` strutturate agli auto_collected più rilevanti (guerra Gaza, Sudan, etc.)

---

## ARCHITETTURA MULTI-MAP (futuro)

```
ATLAS Core Graph
      │
      ├── Main Map (republic.suezcanal.xyz/)
      ├── SeaCommons (/seacommons)
      ├── Investigations (/investigations/:slug)
      ├── Tech Signals (/tech)
      └── Dispatch (/dispatch)
```

Tutti i moduli leggono dallo stesso DB `graph_nodes` + `graph_edges`.
Ogni modulo è un filtro sul core graph, non un silo separato.

---

## NOTE IDENTITÀ

- `suezcanal.xyz` = archivio opere e progetti (resta su Aruba/static)
- `republic.suezcanal.xyz` = sistema operativo della Repubblica (Vercel/Next.js)
- Republic Works **non** appaiono mai sulla mappa
- Ogni segnale risponde alle 9 domande del prompt (cosa/dove/chi/prove/contraddizioni/narrazioni/infrastrutture/incertezza/perché alla Repubblica)
