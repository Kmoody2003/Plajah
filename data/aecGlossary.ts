// ─────────────────────────────────────────────────────────────────────────────
// AEC glossary — the working vocabulary of architecture, engineering and
// construction. Terms are drawn from open industry vocabularies (AIA contract
// documents, the International Building Code, ASCE 7, ASHRAE, buildingSMART's
// IFC/ISO 16739 data dictionary and the NIBS National BIM Standard) and written
// in plain language for the Plajah Academia Architecture studio.
//
// Every entry is a real term of art. Nothing here is invented.
// ─────────────────────────────────────────────────────────────────────────────

export type AecCategory =
  | 'Structure'
  | 'Drawings & Documents'
  | 'Contracts & Delivery'
  | 'Building Science'
  | 'Materials'
  | 'Codes & Zoning'
  | 'Digital & BIM'
  | 'Elements & Details'
  | 'Site & Landscape';

export interface AecTerm {
  id: string;
  term: string;
  category: AecCategory;
  definition: string;
  /** Common abbreviation or alternate name, if the term has one. */
  aka?: string;
  /** Where a practitioner would go to read the authoritative definition. */
  source?: { label: string; url: string };
}

export const AEC_CATEGORIES: { id: AecCategory; blurb: string }[] = [
  { id: 'Structure', blurb: 'How the loads get to the ground.' },
  { id: 'Drawings & Documents', blurb: 'The language of the set.' },
  { id: 'Contracts & Delivery', blurb: 'Who owes whom what, and when.' },
  { id: 'Building Science', blurb: 'Heat, air, moisture and light.' },
  { id: 'Materials', blurb: 'What buildings are actually made of.' },
  { id: 'Codes & Zoning', blurb: 'The legal envelope of a project.' },
  { id: 'Digital & BIM', blurb: 'The model and the data inside it.' },
  { id: 'Elements & Details', blurb: 'The parts and the joints between them.' },
  { id: 'Site & Landscape', blurb: 'Ground, water, access and planting.' },
];

export const AEC_GLOSSARY: AecTerm[] = [
  // ── Structure ──────────────────────────────────────────────────────────────
  {
    id: 'dead-load', term: 'Dead Load', category: 'Structure', aka: 'D',
    definition: 'The permanent, self-weight load of the building itself — structure, cladding, floors, roofing and fixed equipment. It does not change over the life of the building, which is why it can be calculated exactly rather than estimated statistically.',
    source: { label: 'ASCE 7 · Minimum Design Loads', url: 'https://www.asce.org/publications-and-news/asce-7' },
  },
  {
    id: 'live-load', term: 'Live Load', category: 'Structure', aka: 'L',
    definition: 'Transient occupancy load — people, furniture, stored goods, vehicles. Codes prescribe uniform minimum values per occupancy (40 psf residential, 100 psf assembly and retail ground floor) rather than asking the designer to guess.',
    source: { label: 'ASCE 7 Table 4.3-1', url: 'https://www.asce.org/publications-and-news/asce-7' },
  },
  {
    id: 'load-path', term: 'Load Path', category: 'Structure',
    definition: 'The continuous chain of elements that carries a force from where it is applied to the foundation and into the soil: slab → beam → girder → column → footing. A break anywhere in the chain is a collapse mechanism, which is why continuity and connection design dominate structural detailing.',
  },
  {
    id: 'moment', term: 'Bending Moment', category: 'Structure', aka: 'M',
    definition: 'The rotational effect of a force acting at a distance from a section, measured in force × length (kip-ft, kN·m). Bending moment is what makes a beam curve; the top fibres go into compression and the bottom into tension.',
  },
  {
    id: 'shear', term: 'Shear', category: 'Structure', aka: 'V',
    definition: 'The internal force acting parallel to a cut section, tending to make one part of a member slide past the other. In beams shear peaks at the supports, which is why stirrups and web reinforcement cluster there.',
  },
  {
    id: 'deflection', term: 'Deflection', category: 'Structure', aka: 'Δ',
    definition: 'The distance a member moves under load. Usually governed by serviceability limits expressed as a fraction of span — L/360 for floors under live load, L/240 for roofs, L/180 for many cladding elements — rather than by strength.',
  },
  {
    id: 'moment-of-inertia', term: 'Moment of Inertia', category: 'Structure', aka: 'I · second moment of area',
    definition: 'A geometric property describing how a cross-section distributes material away from its neutral axis. Because I grows with the cube of depth, making a beam deeper is dramatically more efficient than making it wider — the reason for I-sections and deep joists.',
  },
  {
    id: 'lateral-system', term: 'Lateral Force-Resisting System', category: 'Structure', aka: 'LFRS',
    definition: 'The assembly that resists horizontal load from wind and earthquake — shear walls, braced frames, moment frames or cores — as distinct from the gravity system that carries vertical load.',
  },
  {
    id: 'diaphragm', term: 'Diaphragm', category: 'Structure',
    definition: 'A floor or roof plane acting as a deep horizontal beam, collecting lateral load and delivering it to the vertical bracing elements. Diaphragms are classed as rigid or flexible, which changes how load is distributed to the shear walls below.',
  },
  {
    id: 'shear-wall', term: 'Shear Wall', category: 'Structure',
    definition: 'A wall designed to resist in-plane horizontal force. In light-frame construction it is sheathing nailed to studs with a defined nailing schedule and hold-downs at the ends; in concrete it is a reinforced wall or a core around the lifts and stairs.',
  },
  {
    id: 'moment-frame', term: 'Moment Frame', category: 'Structure',
    definition: 'A frame whose beam-to-column connections are rigid enough to transfer moment, allowing lateral resistance without diagonal bracing or walls. Architecturally valuable because it leaves bays open; structurally expensive because the connections are demanding.',
  },
  {
    id: 'buckling', term: 'Buckling', category: 'Structure',
    definition: 'Sudden lateral instability of a slender compression member well below its crushing strength, governed by Euler\'s critical load. Slenderness ratio and effective length — not material strength — dominate the result.',
  },
  {
    id: 'seismic-design-category', term: 'Seismic Design Category', category: 'Structure', aka: 'SDC',
    definition: 'A letter classification (A through F) combining a site\'s mapped ground-motion values with the building\'s risk category, which then determines detailing requirements, permitted structural systems and height limits.',
    source: { label: 'USGS Seismic Design Web Service', url: 'https://earthquake.usgs.gov/ws/designmaps/' },
  },
  {
    id: 'bearing-capacity', term: 'Bearing Capacity', category: 'Structure',
    definition: 'The pressure a soil can support before shear failure or unacceptable settlement, in psf or kPa. Allowable bearing capacity from a geotechnical report sizes the footings; presumptive code values are used only for small, low-risk buildings.',
  },
  {
    id: 'camber', term: 'Camber', category: 'Structure',
    definition: 'A deliberate upward curvature built into a beam or truss so that it reads as flat once dead load is applied. Common in long-span steel and glulam.',
  },

  // ── Drawings & Documents ───────────────────────────────────────────────────
  {
    id: 'construction-documents', term: 'Construction Documents', category: 'Drawings & Documents', aka: 'CDs',
    definition: 'The drawings and specifications that together define the work for permitting, bidding and construction. The final design phase in the standard AIA sequence, after schematic design and design development.',
    source: { label: 'AIA Contract Documents', url: 'https://www.aiacontracts.com/' },
  },
  {
    id: 'specifications', term: 'Specifications', category: 'Drawings & Documents', aka: 'Specs',
    definition: 'The written half of the contract documents, defining quality, materials, products and execution. Organised in North America by the CSI MasterFormat divisions; where drawings and specs conflict, the contract states which governs.',
    source: { label: 'CSI MasterFormat', url: 'https://www.csiresources.org/standards/masterformat' },
  },
  {
    id: 'rcp', term: 'Reflected Ceiling Plan', category: 'Drawings & Documents', aka: 'RCP',
    definition: 'A plan of the ceiling drawn as if mirrored on the floor below, so it shares the orientation of the floor plan. Carries lighting, diffusers, sprinklers, ceiling grid and soffits.',
  },
  {
    id: 'section', term: 'Section', category: 'Drawings & Documents',
    definition: 'An orthographic drawing through a vertical cutting plane, showing heights, floor-to-floor dimensions and the assembly of the envelope. Wall sections zoom in far enough to show every layer of the construction.',
  },
  {
    id: 'schedule', term: 'Schedule', category: 'Drawings & Documents',
    definition: 'A table in the drawing set enumerating repeated elements and their properties — door, window, finish, room and equipment schedules. The natural place where drawings become structured data, and the reason schedules fall out of a BIM model automatically.',
  },
  {
    id: 'detail', term: 'Detail', category: 'Drawings & Documents',
    definition: 'A large-scale drawing of a junction — where two materials, systems or planes meet. Most building failures are detail failures, so this is where the majority of an architect\'s technical judgement is recorded.',
  },
  {
    id: 'rfi', term: 'Request for Information', category: 'Drawings & Documents', aka: 'RFI',
    definition: 'A formal question from the contractor to the design team about the contract documents during construction, with a written response that becomes part of the project record.',
  },
  {
    id: 'submittal', term: 'Submittal', category: 'Drawings & Documents',
    definition: 'Product data, samples and shop drawings a contractor submits for the architect\'s review to confirm conformance with the design intent — a review of conformance, notably, and not a re-design or an approval of means and methods.',
  },
  {
    id: 'shop-drawing', term: 'Shop Drawing', category: 'Drawings & Documents',
    definition: 'A fabrication-level drawing prepared by a subcontractor or fabricator, translating the design documents into exactly what will be cut, welded or cast — steel connections, curtain wall, millwork, precast.',
  },
  {
    id: 'as-built', term: 'As-Built Drawings', category: 'Drawings & Documents', aka: 'Record drawings',
    definition: 'The document set updated to reflect what was actually constructed, including field changes. The basis for all future renovation, and the reason measured-survey programmes like HABS exist for buildings that never had them.',
  },

  // ── Contracts & Delivery ───────────────────────────────────────────────────
  {
    id: 'design-bid-build', term: 'Design-Bid-Build', category: 'Contracts & Delivery', aka: 'DBB',
    definition: 'The traditional delivery model: the owner contracts an architect to complete the design, then bids the completed documents to contractors. Clear roles and price competition, but no builder input during design and the longest schedule.',
  },
  {
    id: 'design-build', term: 'Design-Build', category: 'Contracts & Delivery', aka: 'DB',
    definition: 'A single entity contracts for both design and construction. Compresses the schedule and gives one point of responsibility, at the cost of the architect\'s independence as the owner\'s agent.',
  },
  {
    id: 'ipd', term: 'Integrated Project Delivery', category: 'Contracts & Delivery', aka: 'IPD',
    definition: 'A multiparty contract binding owner, architect and builder into shared risk and shared reward, with collaborative decision-making from the outset. Strongly associated with BIM-based coordination.',
    source: { label: 'AIA Contract Documents', url: 'https://www.aiacontracts.com/' },
  },
  {
    id: 'cm-at-risk', term: 'Construction Manager at Risk', category: 'Contracts & Delivery', aka: 'CMAR',
    definition: 'A construction manager joins during design as an advisor, then takes on delivery risk by committing to a guaranteed maximum price.',
  },
  {
    id: 'gmp', term: 'Guaranteed Maximum Price', category: 'Contracts & Delivery', aka: 'GMP',
    definition: 'A contract ceiling above which the contractor absorbs cost overruns. Savings below the GMP are typically shared with the owner on an agreed split.',
  },
  {
    id: 'change-order', term: 'Change Order', category: 'Contracts & Delivery', aka: 'CO',
    definition: 'A signed amendment to the construction contract adjusting scope, price or time. The running total of change orders is the industry\'s bluntest measure of documentation quality.',
  },
  {
    id: 'substantial-completion', term: 'Substantial Completion', category: 'Contracts & Delivery',
    definition: 'The milestone at which the work is sufficiently complete for the owner to occupy or use it for its intended purpose. It starts warranty periods, shifts responsibility for insurance and utilities, and triggers release of most retainage.',
  },
  {
    id: 'punch-list', term: 'Punch List', category: 'Contracts & Delivery', aka: 'Snagging list (UK)',
    definition: 'The itemised list of incomplete or non-conforming work remaining after substantial completion, to be closed out before final payment.',
  },
  {
    id: 'retainage', term: 'Retainage', category: 'Contracts & Delivery',
    definition: 'A percentage of each progress payment withheld by the owner — commonly 5–10% — until the work is complete, as security against defects and abandonment.',
  },
  {
    id: 'value-engineering', term: 'Value Engineering', category: 'Contracts & Delivery', aka: 'VE',
    definition: 'A structured review seeking equivalent function at lower cost. In principle a function-per-dollar analysis; in practice often a euphemism for late-stage cost cutting.',
  },

  // ── Building Science ───────────────────────────────────────────────────────
  {
    id: 'r-value', term: 'R-Value', category: 'Building Science',
    definition: 'Thermal resistance of a material or assembly — higher is better. Nominal R-value describes the insulation alone; effective (whole-assembly) R-value accounts for thermal bridging through framing and is always lower.',
  },
  {
    id: 'u-factor', term: 'U-Factor', category: 'Building Science', aka: 'U-value',
    definition: 'Thermal transmittance, the reciprocal of R-value — the rate of heat flow through an assembly per unit area per degree of temperature difference. Windows are rated in U-factor, opaque assemblies usually in R-value.',
  },
  {
    id: 'thermal-bridge', term: 'Thermal Bridge', category: 'Building Science',
    definition: 'A conductive path that bypasses the insulation layer — a steel stud, a balcony slab, a shelf angle. Thermal bridges cut effective R-value, drive condensation risk and are the reason continuous exterior insulation is now standard practice.',
  },
  {
    id: 'air-barrier', term: 'Air Barrier', category: 'Building Science',
    definition: 'The continuous plane of the enclosure that stops air movement. Air leakage typically carries far more moisture into an assembly than vapour diffusion does, which is why continuity of the air barrier is the single highest-value envelope decision.',
  },
  {
    id: 'vapor-retarder', term: 'Vapor Retarder', category: 'Building Science',
    definition: 'A layer limiting moisture movement by diffusion, classified I, II or III by permeance. Which side of the insulation it belongs on — if it belongs anywhere — depends entirely on climate zone.',
  },
  {
    id: 'shgc', term: 'Solar Heat Gain Coefficient', category: 'Building Science', aka: 'SHGC',
    definition: 'The fraction of incident solar radiation admitted through a window, from 0 to 1. Low SHGC cuts cooling load in hot climates; higher SHGC on south glazing is an asset in heating-dominated ones.',
  },
  {
    id: 'daylight-factor', term: 'Daylight Factor', category: 'Building Science', aka: 'DF',
    definition: 'The ratio of interior illuminance to unobstructed exterior illuminance under an overcast sky, expressed as a percentage. A simple, sky-independent daylighting metric now largely superseded by climate-based measures.',
  },
  {
    id: 'sda', term: 'Spatial Daylight Autonomy', category: 'Building Science', aka: 'sDA',
    definition: 'The percentage of floor area receiving at least 300 lux for at least 50% of occupied hours across a full year — a climate-based daylight metric computed from real weather data.',
    source: { label: 'IES LM-83', url: 'https://www.ies.org/standards/' },
  },
  {
    id: 'solar-altitude', term: 'Solar Altitude', category: 'Building Science',
    definition: 'The angular height of the sun above the horizon at a given place and instant, from 0° at the horizon to a maximum at solar noon. With azimuth it fully locates the sun and therefore every shadow and every overhang depth.',
    source: { label: 'NOAA Solar Calculator', url: 'https://gml.noaa.gov/grad/solcalc/' },
  },
  {
    id: 'solar-azimuth', term: 'Solar Azimuth', category: 'Building Science',
    definition: 'The compass bearing of the sun, measured clockwise from true north. Combined with altitude it defines the sun-path diagram used to size shading devices and place glazing.',
    source: { label: 'NOAA Solar Calculator', url: 'https://gml.noaa.gov/grad/solcalc/' },
  },
  {
    id: 'declination', term: 'Solar Declination', category: 'Building Science', aka: 'δ',
    definition: 'The angle between the sun\'s rays and the plane of the equator, swinging between roughly +23.44° at the June solstice and −23.44° at the December solstice. Declination is the whole of the seasons in one number.',
  },
  {
    id: 'reverberation-time', term: 'Reverberation Time', category: 'Building Science', aka: 'RT60',
    definition: 'The time for sound in a room to decay by 60 dB, estimated by Sabine\'s equation from room volume and total absorption. Around 0.6 s suits speech; 1.8–2.2 s suits orchestral music.',
  },
  {
    id: 'stc', term: 'Sound Transmission Class', category: 'Building Science', aka: 'STC',
    definition: 'A single-number rating of an assembly\'s airborne sound isolation. Codes commonly require STC 50 between dwelling units; the weakest element — a door undercut, an unsealed penetration — sets the real performance.',
  },

  // ── Materials ──────────────────────────────────────────────────────────────
  {
    id: 'clt', term: 'Cross-Laminated Timber', category: 'Materials', aka: 'CLT',
    definition: 'A mass-timber panel of lumber layers glued in alternating orthogonal directions, giving two-way strength and dimensional stability. The basis of tall wood construction, now explicitly recognised in the IBC.',
  },
  {
    id: 'glulam', term: 'Glued Laminated Timber', category: 'Materials', aka: 'Glulam',
    definition: 'Structural members built from dimension lumber laminations bonded with the grain parallel, allowing long spans, curves and cross-sections far larger than any sawn log.',
  },
  {
    id: 'rebar', term: 'Reinforcing Bar', category: 'Materials', aka: 'Rebar',
    definition: 'Deformed steel bar cast into concrete to carry tension, which concrete cannot. The composite works because steel and concrete share almost identical coefficients of thermal expansion.',
  },
  {
    id: 'post-tensioning', term: 'Post-Tensioning', category: 'Materials', aka: 'PT',
    definition: 'High-strength tendons stressed after the concrete has cured, putting the section into permanent compression. Enables thinner slabs and longer spans, and makes future coring a hazard that must be scanned for.',
  },
  {
    id: 'embodied-carbon', term: 'Embodied Carbon', category: 'Materials',
    definition: 'The greenhouse-gas emissions from extracting, manufacturing, transporting, installing and eventually disposing of building materials — as distinct from operational carbon. Documented per product in an Environmental Product Declaration.',
    source: { label: 'EC3 · Embodied Carbon in Construction Calculator', url: 'https://www.buildingtransparency.org/' },
  },
  {
    id: 'epd', term: 'Environmental Product Declaration', category: 'Materials', aka: 'EPD',
    definition: 'A third-party-verified, standardised report of a product\'s life-cycle environmental impacts, following ISO 14025 and EN 15804 — the raw material for whole-building life-cycle assessment.',
  },
  {
    id: 'curtain-wall', term: 'Curtain Wall', category: 'Materials',
    definition: 'A non-load-bearing exterior enclosure hung from the structural frame, carrying only its own weight plus wind and seismic load on itself. Stick-built or unitised; the defining envelope of the modern high-rise.',
  },
  {
    id: 'rainscreen', term: 'Rainscreen', category: 'Materials',
    definition: 'A cladding strategy with a drained, ventilated cavity behind the outer skin, so water that gets past the face is drained and dried rather than resisted at a single line. Pressure-equalised versions also neutralise wind-driven pressure differentials.',
  },

  // ── Codes & Zoning ─────────────────────────────────────────────────────────
  {
    id: 'ibc', term: 'International Building Code', category: 'Codes & Zoning', aka: 'IBC',
    definition: 'The model building code published by the International Code Council and adopted, often with amendments, by most U.S. jurisdictions. It governs occupancy classification, construction type, egress, fire resistance and structural requirements.',
    source: { label: 'ICC Digital Codes', url: 'https://codes.iccsafe.org/' },
  },
  {
    id: 'occupancy-classification', term: 'Occupancy Classification', category: 'Codes & Zoning',
    definition: 'The code group describing how a building is used — Assembly (A), Business (B), Educational (E), Institutional (I), Mercantile (M), Residential (R), Storage (S) and others. It drives allowable area, height, egress and fire ratings.',
  },
  {
    id: 'construction-type', term: 'Type of Construction', category: 'Codes & Zoning',
    definition: 'A code classification (Types I through V) based on the combustibility of the structural materials and their fire-resistance ratings. Together with occupancy it sets the allowable height and area of the building.',
  },
  {
    id: 'egress', term: 'Means of Egress', category: 'Codes & Zoning',
    definition: 'The continuous, unobstructed path from any occupied point to a public way, in three parts: exit access, exit and exit discharge. Occupant load sets the required width and number of exits.',
  },
  {
    id: 'occupant-load', term: 'Occupant Load', category: 'Codes & Zoning',
    definition: 'The number of people a space is assumed to hold, computed by dividing floor area by a code-prescribed area-per-occupant factor for that use. Nearly every life-safety requirement descends from this one number.',
  },
  {
    id: 'far', term: 'Floor Area Ratio', category: 'Codes & Zoning', aka: 'FAR · plot ratio',
    definition: 'Total permitted building floor area divided by lot area. A zoning instrument that caps bulk without dictating form — FAR 2.0 on a 10,000 sf lot permits 20,000 sf however it is massed.',
  },
  {
    id: 'setback', term: 'Setback', category: 'Codes & Zoning',
    definition: 'The minimum distance a building must be held back from a property line or street, controlling light, air, privacy and street wall. Upper-storey setbacks additionally shape the classic stepped skyscraper profile.',
  },
  {
    id: 'ada', term: 'ADA Standards for Accessible Design', category: 'Codes & Zoning', aka: 'ADA',
    definition: 'The U.S. federal civil-rights standard governing accessible routes, clearances, reach ranges, ramps and toilet rooms. Enforced as civil-rights law rather than through the building permit, so compliance is not discharged by a certificate of occupancy.',
    source: { label: 'ADA.gov Standards', url: 'https://www.ada.gov/law-and-regs/design-standards/' },
  },
  {
    id: 'variance', term: 'Variance', category: 'Codes & Zoning',
    definition: 'Formal permission to depart from a zoning requirement, granted by a board of appeals where strict application would impose a hardship peculiar to the property.',
  },

  // ── Digital & BIM ──────────────────────────────────────────────────────────
  {
    id: 'bim', term: 'Building Information Modeling', category: 'Digital & BIM', aka: 'BIM',
    definition: 'A shared digital representation of a facility in which geometry carries structured data — a wall knows its fire rating, its layers and its cost code. The value is in the information, not the 3D.',
    source: { label: 'buildingSMART', url: 'https://www.buildingsmart.org/' },
  },
  {
    id: 'ifc', term: 'Industry Foundation Classes', category: 'Digital & BIM', aka: 'IFC · ISO 16739',
    definition: 'The open, vendor-neutral data schema for building information, standardised as ISO 16739. IFC is what makes a model exchangeable between authoring tools and archivable beyond the life of any one product.',
    source: { label: 'buildingSMART IFC', url: 'https://technical.buildingsmart.org/standards/ifc/' },
  },
  {
    id: 'lod', term: 'Level of Development', category: 'Digital & BIM', aka: 'LOD',
    definition: 'A scale (100 through 500) describing how reliable a model element is at a given moment — from a schematic placeholder to a verified as-built record. It is a statement about trust, not about polygon count.',
  },
  {
    id: 'clash-detection', term: 'Clash Detection', category: 'Digital & BIM',
    definition: 'Automated geometric checking of federated discipline models for hard clashes (solids intersecting), soft clashes (clearance violations) and workflow clashes (scheduling conflicts) before anything is built.',
  },
  {
    id: 'cde', term: 'Common Data Environment', category: 'Digital & BIM', aka: 'CDE',
    definition: 'The single agreed source of project information, with defined states — work in progress, shared, published, archived — through which every document must pass. Central to ISO 19650 information management.',
  },
  {
    id: 'digital-twin', term: 'Digital Twin', category: 'Digital & BIM',
    definition: 'A model of a built asset kept live by sensor and operations data, used for facilities management, energy optimisation and predictive maintenance. Distinguished from a design model by the continuous data feed.',
  },
  {
    id: 'parametric-design', term: 'Parametric Design', category: 'Digital & BIM',
    definition: 'Design in which geometry is generated by rules and driving parameters rather than drawn directly, so changing an input propagates through the whole model. The computational basis of Grasshopper, Dynamo and the parametricist movement.',
  },

  // ── Elements & Details ─────────────────────────────────────────────────────
  {
    id: 'flashing', term: 'Flashing', category: 'Elements & Details',
    definition: 'Thin impervious material installed to direct water out of an assembly at joints, penetrations and terminations. Head, sill, through-wall and step flashing are the common types; missing or reverse-lapped flashing is the classic source of envelope failure.',
  },
  {
    id: 'parapet', term: 'Parapet', category: 'Elements & Details',
    definition: 'The wall extending above the roof plane. Serves fall protection, fire separation and the concealment of roof equipment — and is a notorious thermal bridge and leak point where it meets the roof membrane.',
  },
  {
    id: 'soffit', term: 'Soffit', category: 'Elements & Details',
    definition: 'The exposed underside of any overhead building element — an eave, an arch, a beam or a dropped ceiling.',
  },
  {
    id: 'lintel', term: 'Lintel', category: 'Elements & Details',
    definition: 'A horizontal member spanning an opening and carrying the load above it to the masonry or framing on either side. The oldest structural element in architecture, and the whole of trabeated construction.',
  },
  {
    id: 'expansion-joint', term: 'Expansion Joint', category: 'Elements & Details',
    definition: 'A deliberate discontinuity permitting thermal, moisture and seismic movement without cracking. If the designer does not place the joint, the building will place its own.',
  },
  {
    id: 'mullion', term: 'Mullion', category: 'Elements & Details',
    definition: 'The vertical member dividing a window or curtain wall into bays and carrying wind load back to the structure. Its horizontal counterpart is the transom.',
  },
  {
    id: 'plenum', term: 'Plenum', category: 'Elements & Details',
    definition: 'The cavity above a ceiling or below a raised floor used to distribute air and route services. When it is used as a return-air path, everything installed in it must meet plenum-rated fire and smoke requirements.',
  },
  {
    id: 'furring', term: 'Furring', category: 'Elements & Details',
    definition: 'Light strips or channels fixed to a surface to create a level plane, a service cavity or a drainage gap for the finish material.',
  },

  // ── Site & Landscape ───────────────────────────────────────────────────────
  {
    id: 'grade', term: 'Grade', category: 'Site & Landscape',
    definition: 'The elevation of the ground surface. Existing grade is what is there now, finished grade what the design leaves; the difference is the cut and fill the earthwork has to move.',
  },
  {
    id: 'impervious-surface', term: 'Impervious Surface', category: 'Site & Landscape',
    definition: 'Any area preventing infiltration — roofs, paving, compacted surfaces. Zoning and stormwater regulations cap impervious coverage because it converts rainfall directly into runoff.',
  },
  {
    id: 'bioswale', term: 'Bioswale', category: 'Site & Landscape',
    definition: 'A vegetated, gently sloped channel that conveys stormwater slowly while filtering sediment and pollutants and encouraging infiltration — a core green-infrastructure device.',
  },
  {
    id: 'sda-site', term: 'Site Plan', category: 'Site & Landscape',
    definition: 'The drawing locating the building on its property with dimensions to the property lines, showing grading, access, parking, utilities, landscape and setbacks. Usually the first drawing a planning authority reads.',
  },
  {
    id: 'easement', term: 'Easement', category: 'Site & Landscape',
    definition: 'A recorded right for someone other than the owner to use part of a property for a defined purpose — utilities, access, drainage. Easements bind the land, not the owner, and building over one is generally prohibited.',
  },
  {
    id: 'urban-heat-island', term: 'Urban Heat Island', category: 'Site & Landscape', aka: 'UHI',
    definition: 'The measurable elevation of temperature in built-up areas relative to their rural surroundings, driven by dark low-albedo surfaces, lost evapotranspiration and waste heat. Mitigated with high-SRI paving and roofs, shade trees and vegetated surfaces.',
  },
];

/** Sorted alphabetically — the default browse order. */
export const AEC_GLOSSARY_SORTED: AecTerm[] = [...AEC_GLOSSARY].sort((a, b) => a.term.localeCompare(b.term));
