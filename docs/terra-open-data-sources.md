# Terra open-data source map — US and worldwide

Checked 2026-11-25. Every URL was requested live. For ArcGIS layers the record count and field list were read live too.

**Status key:**
- **V:** the endpoint answered and was read.
- **P:** the page is reachable; the licence or detail comes from a summary.
- **U:** UNVERIFIED (blocked to scripts, or no endpoint found).

**Michigan:** see `docs/terra-transaction-room.md` §11. Michigan has no open statewide layer. Oakland and Ottawa are live in Terra (`services/terra/countyParcels.ts`).

Goal: near-global coverage over 10–15 years, ordered by **coverage per integration**.

## 1. Top 25 by coverage per integration

| # | Source | Why |
|---|---|---|
| 1 | **ArcGIS REST adapter** (FeatureServer/MapServer query + `arcgis.com/sharing/rest/search`) | 20 of the 24 statewide layers below, plus most counties and cities. Terra already has it (`queryArcGisGeoJson`). |
| 2 | **Socrata SODA adapter** (`/resource/{id}.json`) | NYC, Chicago, Cook County, SF, Seattle, Austin, Detroit, LA County: permits, 311, code enforcement |
| 3 | **EU High-Value Datasets Reg. 2023/138 + INSPIRE Cadastral Parcels** | Since June 2024 every EU member must publish parcels free, via API, under CC BY 4.0 or more permissive. One WFS/ATOM adapter covers about 27 countries. |
| 4 | Florida Statewide Cadastral | 10.9M parcels with owner, value and sale |
| 5 | Ohio Statewide Parcels | 6.3M parcels, geometry only |
| 6 | NC OneMap | 5.9M parcels with owner, value and sale date |
| 7 | Virginia VGIN | 4.2M parcels, geometry and IDs |
| 8 | NYS Tax Parcels Public | 3.8M parcels: 38 counties plus NYC |
| 9 | Indiana | 3.7M parcels with values |
| 10 | Wisconsin V12 | 3.6M parcels with owner, value and sale |
| 11 | New Jersey Parcels + MOD-IV | 3.5M parcels with owner, value and sale |
| 12 | France PCI Etalab cadastre + DVF sales | Whole country, plus every sale since 2014 (no names). Licence Ouverte 2. |
| 13 | Washington Current Parcels | 3.3M parcels, no owner |
| 14 | Australia: NSW + QLD | 3.4M and 3.5M lots; QLD is CC BY 4.0 |
| 15 | Minnesota Open Parcels | 2.7M parcels (opt-in counties) |
| 16 | Colorado Public Parcels | 2.6M parcels with owner, value and sale |
| 17 | Massachusetts L3 | 2.6M parcels with owner and value |
| 18 | Maryland parcel points + CAMA | 2.4M parcels with owner, value and sale |
| 19 | Arkansas CAMP | 2.1M parcels with owner and value |
| 20 | UK: HMLR INSPIRE polygons + Price Paid | England and Wales polygons plus every sale since 1995 |
| 21 | Netherlands Kadastrale Kaart (PDOK WFS) | Whole country |
| 22 | Spain Catastro INSPIRE | Whole country except the Basque Country and Navarre |
| 23 | Italy AdE cadastre | Whole country, CC BY 4.0 since 2020 |
| 24 | **Legistar Web API** | One adapter covers hundreds of city councils (feeds the Terra Civic Forum) |
| 25 | **OpenStates v3 + Congress.gov v3** | All 50 state legislatures plus Congress (free key) |

## 2. US statewide parcel programs

| State | Endpoint | Records | Owner / Val / Sale | Terms | Status |
|---|---|---|---|---|---|
| FL | services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0 | 10,949,394 | Y/Y/Y | Disclaimer | V |
| OH | services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/OhioStatewidePacels_full_view/FeatureServer/0 | 6,313,610 | N/N/N | Public use, own risk | V |
| NC | services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/1 | 5,942,236 | Y/Y/Y | Not stated | V |
| VA | vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0 | 4,174,364 | N/N/N | Own risk | V |
| NY | nysgeohub.ny.gov/arcgis/rest/services/Parcels/NYS_Tax_Parcels_Public/FeatureServer/1 | 3,827,530 | partial/Y/N | As is; counties control distribution | V |
| IN | gisdata.in.gov/server/rest/services/Hosted/Parcel_Boundaries_of_Indiana_Current/FeatureServer/0 | 3,682,675 | N/Y/N | Citation requested | V |
| WI | services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0 | 3,574,646 | Y/Y/Y | Free, no warranty | V |
| NJ | services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0 | 3,481,240 | Y/Y/Y | Not survey data | V |
| WA | services.arcgis.com/jsIt88o09Q0r1j8h/arcgis/rest/services/Current_Parcels/FeatureServer/0 | 3,321,859 | N/Y/N | Ownership version restricted to state agencies | V |
| MN | enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/FeatureServer/0 | 2,714,537 | Y/Y/Y | Disclaimer | V |
| CO | gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/FeatureServer/0 | 2,599,954 | Y/Y/Y | No warranty | V |
| MA | services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0 | 2,559,749 | Y/Y/N | Not authoritative | V |
| MD | mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0 | 2,395,737 | Y/Y/Y | As is | V |
| AR | gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer/6 | 2,149,447 | Y/Y/N | Not a legal boundary | V |
| CT | services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0 | 1,320,686 | Y/Y/Y | **CC0** | V |
| MT | ftpgeoinfo.msl.mt.gov/Data/Spatial/MSDI/Cadastral/Parcels/Statewide/ | 887,716 | Y/Y/N | Not read | V |
| ND | services1.arcgis.com/GOcSXpzwBHyk2nog/arcgis/rest/services/NDGISHUB_Parcels/FeatureServer/0 | 719,461 | Y/N/N | Not for navigation | V |
| ME | services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer/10 | 708,382 | N/N/N | Public, user risk | V |
| DE | enterprise.firstmap.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/FeatureServer/0 | 455,785 | N/N/N | No warranty | V |
| HI | geodata.hawaii.gov/arcgis/rest/services/ParcelsZoning/MapServer/25 | 384,035 | N/N/N | State terms of use | V |
| ID | services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/Public_Idaho_Parcels_/FeatureServer/7 | 381,144 (partial) | Y/Y/N | **County user agreement** | V |
| VT | services1.arcgis.com/BkFxaEFNwHqX3tAw/.../FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0 | 344,215 | Y/Y/N | Not read | V |
| UT | services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/Parcels_<County>[_LIR]/FeatureServer/0 (all 29 counties) | — | owner type / LIR values / N | "No constraints"; cite SGID | V |
| TX | feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0 | not all counties | Y/Y/N | Yearly | V/P |

**No open statewide layer** (go county by county or use a licensed feed):
- PA (per-county via PASDA);
- TN, WV, OR (restricted), IA, KY, NV, NM, AK, MI, GA, SC, KS, MS;
- NE (university snapshot only).

**Big jurisdictions outside a statewide layer:**

| Jurisdiction | Source |
|---|---|
| NYC | PLUTO `data.cityofnewyork.us/resource/64uk-42ks.json` (858k lots) |
| Cook County / Chicago | Parcel Universe `nj4t-kc8j`, Sales `wvhk-k5uv`; Chicago permits `ydr8-5enu` |
| Harris County | `gis.hctx.net/arcgishcpid/rest/services/HCAD/Parcels/MapServer/0` (1.55M, owner + value) |
| LA County | `public.gis.lacounty.gov/.../LACounty_Parcel/MapServer` |
| Maricopa | `gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer` |
| King County | `PARCEL_ADDRESS_PUB_AREA_3069` (637k) |
| Philadelphia | Carto `opa_properties_public` (584k) |

**National aggregators:**
- Regrid, ReportAll and LandRecords are **paid**.
- HIFLD Open **shut down Aug 2025**; archives exist on source.coop.
- FGDC publishes standards only; there is no open national parcel layer.

## 3. Civic data standards (one adapter, many governments)

| Standard / API | Notes |
|---|---|
| Socrata SODA, ArcGIS Hub, CKAN | The three open-data platform families |
| Open311 GeoReport v2 | **Live:** Chicago, Boston, SF, Bloomington IN, Köln, Zürich. **Dead or blocked:** Baltimore, DC, Toronto, Bonn and others. The server list (wiki.open311.org) is stale. |
| BLDS permits | A schema to map to; few live adopters |
| OCD division IDs | Use as Terra's jurisdiction key (`ocd-division/country:us/state:mi/place:detroit`) |
| **Legistar Web API** `webapi.legistar.com/v1/{client}` | **Open:** seattle, sfgov, detroit, denver, oakland, boston, sanantonio, austintexas, milwaukee, metro, kingcounty, cook-county. **Token needed:** nyc, phila. **Erroring:** chicago (now its own eLMS API), lacity, houston, sandiego. |
| OpenStates v3, Congress.gov v3, Federal Register, Regulations.gov | Free keys |
| Municode, American Legal, eCode360 | No API, and they block scripts. Link out or license. |
| Akoma Ntoso | OASIS LegalDocML; legislation.gov.uk serves it |

## 4. International cadastre

| Country / region | Source | Licence | Owners |
|---|---|---|---|
| EU (INSPIRE CP + HVD) | National WFS/ATOM | CC BY 4.0+ | No (GDPR) |
| Canada – BC | ParcelMap BC WFS | OGL-BC | No |
| Canada – Ontario | Teranet/MPAC | **Commercial** | — |
| Canada – Québec | Assessment rolls CC BY 4.0; Infolot cadastre not open | — | — |
| Canada – Alberta | OGL-AB (province-wide parcel fabric not found open) | OGL-AB | — |
| UK – England & Wales | HMLR INSPIRE polygons + Price Paid | OGL + OS notice | No |
| UK – Scotland | RoS INSPIRE | OGL | No |
| Ireland | Price Register open; cadastre not open | — | — |
| **France** | cadastre.data.gouv.fr Etalab GeoJSON + DVF sales | Licence Ouverte 2 | No |
| Netherlands | PDOK kadastralekaart WFS | CC BY 4.0 / PD | Paid lookup |
| Germany | NRW, HE, BE: dl-de/zero. HH, TH, SN, SL, ST: dl-de/by-2.0. Others: U. | — | No |
| Spain | Catastro INSPIRE ATOM | Open terms | No |
| Italy | AdE WMS/WFS + bulk GML | CC BY 4.0 | No |
| Nordics | DK Datafordeler, NO Geonorge, SE Lantmäteriet (CC BY + recipient becomes GDPR controller), FI MML | — | No |
| Poland, Czechia, Austria | ULDK API; ČÚZK INSPIRE GML; BEV | — | No |
| Switzerland | geodienste.ch by canton | Varies; some cantons require permission for commercial use | No |
| Australia | NSW cadastre REST; **QLD CC BY 4.0** (+ weekly gdb); VIC Vicmap CC BY 4.0 | — | No |
| New Zealand | LINZ NZ Primary Parcels 50823 | CC BY 4.0 | No (titles restricted) |
| Japan | MOJ registry maps (Map XML), Digital Agency converter | Free reuse under terms | No |
| South Korea | 연속지적도 (data.go.kr / vworld) | Free | No |
| Taiwan | Section outlines only | Gov Open Data Licence | No |
| Dubai | Dubai Pulse DLD transactions + land registry (API key) | Dubai Pulse terms | No names |
| Brazil | INCRA SIGEF / CAR by state | — | No |
| Colombia | IGAC | CC BY or CC BY-SA (sources conflict) | No |
| Chile | SII catastral by comuna | — | — |

**View-only or not open (link out, don't harvest):**
- India Bhulekh/Bhoomi;
- Kenya Ardhisasa;
- Israel govmap;
- Rwanda (aggregates only);
- Ghana;
- Singapore;
- Mexico RAN;
- South Africa (U);
- Greece (not checked).

## 5. Legislative and engagement data abroad (feeds Terra Civic)

| Country / body | Sources |
|---|---|
| UK | Parliament Bills, Members, Votes, Committees and Written Questions APIs; petitions JSON; legislation.gov.uk (Akoma Ntoso) |
| EU | Have Your Say; European Parliament Open Data API; EUR-Lex; data.europa.eu |
| France | data.assemblee-nationale.fr, data.senat.fr, Légifrance via PISTE |
| Germany | Bundestag DIP API |
| Brazil | Câmara + Senado open data |
| Taiwan | join.gov.tw, vTaiwan, data.ly.gov.tw |
| Estonia | Riigikogu API, osale.ee |
| Iceland | Althingi XML, samradsgatt.island.is |
| Nordics | Eduskunta, Stortinget, Riksdagen, Folketing open data |
| Netherlands | Tweede Kamer open data, internetconsultatie.nl |
| Rest of Europe | Austria, Italy, Spain, Ireland (api.oireachtas.ie), Poland (api.sejm.gov.pl), Czechia |
| Israel | Knesset OData |
| Americas and Asia-Pacific | Canada (ourcommons, openparliament.ca); Japan (kokkai API, e-gov public comment); Korea (open.assembly); Chile; Singapore REACH; OpenAustralia |
| Civic platforms | Decidim (GraphQL `/api` per instance) and Consul Democracy. Barcelona, Madrid and Helsinki instances are live but block scripts. |

## 6. Licensing rules for Terra

1. **US owner names.** Many layers republish owner, mailing address and sale price.
   - Add a per-source `owner_display: allowed | suppress` flag.
   - Honour removal requests from protected persons (judges, police, domestic-violence confidentiality programs).
   - Never sell owner contact data.
   - Some states already omit owners: WA, VA, OH, IN, DE.
   - Restricted: WA's ownership layer (state agencies only) and Idaho (county user agreement).
2. **Most US layers carry a disclaimer, not a licence.** CT (CC0) and UT ("cite SGID") are the only explicit grants. Keep each layer's attribution and its "not a legal boundary" text.
3. **EU and GDPR.** Cadastral open data is geometry plus IDs only. Ownership is a paid, logged register lookup, so don't scrape or cache it. Sweden's terms make Plajah the GDPR controller.
4. **Attribution and share-alike.** CC BY: QLD, VIC, IT, NZ, NL, SE. dl-de/by: several German Länder. OGL: UK, BC, AB (the UK also needs the OS copyright line). Colombia may be CC BY-SA. Some Swiss cantons need permission for commercial use.
5. **Commercial, not open:** Ontario Parcel, Regrid/ReportAll bulk, Québec Infolot, Oregon taxlots, Chile SII-Mapas, the Argentina national catastro. Hosting property transactions on these needs a licence.
6. **Keys the user must register:** OpenStates, Congress.gov (api.data.gov), Dubai Pulse, Legistar NYC/Philadelphia.
7. **Gone or stale:** HIFLD Open (2025), and many Open311 servers on the official list.
