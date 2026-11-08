// Fabrication processes and machine profiles: every way a design leaves the screen. Each process has
// design rules (typical published guidance, not a vendor's spec sheet) used for manufacturability
// checks, the outputs we can produce for it, and how the machine is reached.

export type Family = 'Plastic printing' | 'Metal printing' | 'Machining' | 'Cutting' | 'Forming';
export type Output = 'gcode' | 'cli' | '3mf' | 'stl' | 'dxf' | 'svg';
export type ProcessId =
  | 'fdm' | 'resin' | 'sls' | 'mjf' | 'polyjet'
  | 'lpbf' | 'ebm' | 'binder-jet' | 'bound-metal' | 'ded'
  | 'mill3' | 'mill5' | 'router' | 'lathe' | 'wire-edm'
  | 'laser-co2' | 'laser-fiber' | 'laser-diode' | 'plasma' | 'waterjet' | 'drag-knife'
  | 'press-brake';

export interface Rules {
  /** Thinnest wall that prints/cuts reliably, mm. */ minWall?: number;
  /** Smallest round hole, mm. */ minHole?: number;
  /** Steepest unsupported overhang from vertical, degrees (printing). */ overhang?: number;
  /** Typical achievable tolerance, ± mm. */ tolerance: number;
  /** Cut width, mm (cutting). */ kerf?: number;
  /** Smallest inside corner radius, mm (machining, EDM). */ minInsideRadius?: number;
  /** Thickest stock it can cut, mm. */ maxThickness?: number;
  /** Linear shrinkage during sintering, fraction (binder-jet, bound metal). */ shrink?: number;
  /** Stock left for finish machining, mm (DED). */ machiningAllowance?: number;
  supports?: 'none' | 'optional' | 'required';
  notes: string[];
}

export interface Process { id: ProcessId; name: string; family: Family; input: '3d' | '2d' | 'turned'; outputs: Output[]; materials: string[]; rules: Rules; about: string }

export const PROCESSES: Process[] = [
  { id: 'fdm', name: 'FDM / FFF filament printing', family: 'Plastic printing', input: '3d', outputs: ['gcode', '3mf', 'stl'], materials: ['PLA', 'PETG', 'ABS/ASA', 'TPU', 'Nylon', 'PC', 'CF-filled'], about: 'Melted filament laid down layer by layer. The everyday maker printer.',
    rules: { minWall: 0.8, minHole: 2, overhang: 45, tolerance: 0.3, supports: 'optional', notes: ['Orient so loads run along layers, not across them.', 'Holes print slightly small; ream or add 0.2 mm.', 'Bridges up to about 10 mm print without support.'] } },
  { id: 'resin', name: 'Resin (SLA / MSLA / DLP)', family: 'Plastic printing', input: '3d', outputs: ['stl', '3mf'], materials: ['Standard', 'Tough', 'Flexible', 'Castable', 'Dental', 'High-temp'], about: 'UV light cures liquid resin. Fine detail and smooth surfaces.',
    rules: { minWall: 0.5, minHole: 0.5, overhang: 30, tolerance: 0.1, supports: 'required', notes: ['Hollow parts need drain holes of at least 3.5 mm.', 'Uncured resin is a skin and eye irritant: gloves and ventilation.', 'Post-cure under UV for full strength.'] } },
  { id: 'sls', name: 'SLS powder bed (nylon)', family: 'Plastic printing', input: '3d', outputs: ['3mf', 'stl'], materials: ['PA12', 'PA11', 'TPU', 'Glass-filled PA'], about: 'A laser sinters nylon powder; unsintered powder supports the part.',
    rules: { minWall: 0.8, minHole: 1.5, tolerance: 0.3, supports: 'none', notes: ['Enclosed hollows need escape holes (5 mm) to remove powder.', 'Thick sections can warp; core them out.'] } },
  { id: 'mjf', name: 'Multi Jet Fusion', family: 'Plastic printing', input: '3d', outputs: ['3mf', 'stl'], materials: ['PA12', 'PA11', 'TPU', 'PP'], about: 'Agents printed on powder and fused by heat. Production nylon parts.',
    rules: { minWall: 0.6, minHole: 1, tolerance: 0.3, supports: 'none', notes: ['Same powder-removal rule as SLS.', 'Parts come out grey; dye black for a uniform finish.'] } },
  { id: 'polyjet', name: 'Material jetting (multi-material)', family: 'Plastic printing', input: '3d', outputs: ['3mf', 'stl'], materials: ['Rigid', 'Rubber-like', 'Transparent', 'Full colour'], about: 'Droplets jetted and UV-cured, several materials and colours in one part.',
    rules: { minWall: 1, minHole: 0.5, tolerance: 0.1, supports: 'required', notes: ['3MF keeps per-part colours and materials.'] } },
  { id: 'lpbf', name: 'Metal powder bed (LPBF / SLM / DMLS)', family: 'Metal printing', input: '3d', outputs: ['cli', '3mf', 'stl'], materials: ['316L', '17-4PH', 'Ti-6Al-4V', 'AlSi10Mg', 'Inconel 718/625', 'CoCr', 'Maraging steel', 'CuCrZr'], about: 'A laser melts metal powder layer by layer: dense, strong, complex metal parts.',
    rules: { minWall: 0.4, minHole: 0.5, overhang: 45, tolerance: 0.1, supports: 'required', notes: ['Supports anchor overhangs and carry heat away; plan for their removal (EDM or machining).', 'Stress-relieve on the plate before removal.', 'Leave machining stock on mating faces and threads.', 'Metal powders are a fire and inhalation hazard: inert handling and PPE.'] } },
  { id: 'ebm', name: 'Electron beam melting (EBM)', family: 'Metal printing', input: '3d', outputs: ['cli', '3mf', 'stl'], materials: ['Ti-6Al-4V', 'Ti grade 2', 'CoCr', 'Copper'], about: 'An electron beam melts powder in vacuum at high temperature: low residual stress.',
    rules: { minWall: 0.6, minHole: 1, overhang: 45, tolerance: 0.2, supports: 'optional', notes: ['Rougher surface than LPBF; machine critical faces.', 'Sintered powder cake must be blasted out of channels.'] } },
  { id: 'binder-jet', name: 'Metal binder jetting', family: 'Metal printing', input: '3d', outputs: ['3mf', 'stl'], materials: ['316L', '17-4PH', '420', 'Copper', 'Tungsten carbide'], about: 'Binder glues metal powder into a green part that is then sintered. Fast, low-cost metal.',
    rules: { minWall: 1, minHole: 1, tolerance: 0.5, shrink: 0.2, supports: 'none', notes: ['Parts shrink about 20% in sintering; we scale the export up to compensate.', 'Long thin spans sag in the furnace; add setters or ribs.'] } },
  { id: 'bound-metal', name: 'Bound metal extrusion', family: 'Metal printing', input: '3d', outputs: ['gcode', '3mf', 'stl'], materials: ['17-4PH', '316L', 'H13 tool steel', 'Copper', 'Inconel'], about: 'Metal powder in a polymer binder, printed like filament, then debound and sintered.',
    rules: { minWall: 1, minHole: 1.5, overhang: 45, tolerance: 0.5, shrink: 0.17, supports: 'optional', notes: ['Parts shrink about 17% after debinding and sintering; we scale up.', 'Keep sections under about 10 mm thick so binder escapes.'] } },
  { id: 'ded', name: 'Directed energy deposition (DED / WAAM)', family: 'Metal printing', input: '3d', outputs: ['gcode', '3mf', 'stl'], materials: ['Steel', 'Stainless', 'Titanium', 'Aluminium', 'Nickel alloys'], about: 'Wire or powder melted by laser or arc onto a part: large parts, repairs, adding features.',
    rules: { minWall: 3, tolerance: 1, machiningAllowance: 2, supports: 'none', notes: ['Near-net shape: we add 2 mm stock everywhere for finish machining.', 'Arc processes need welding safety: shielding, fume extraction.'] } },
  { id: 'mill3', name: 'CNC mill (3-axis)', family: 'Machining', input: '3d', outputs: ['gcode', 'dxf'], materials: ['Aluminium', 'Steel', 'Stainless', 'Brass', 'Plastics', 'Wood'], about: 'A spinning cutter removes material from a block. Precise metal parts.',
    rules: { minWall: 0.8, minHole: 1, tolerance: 0.05, minInsideRadius: 1.5, notes: ['Inside corners are rounded by the tool radius; add dog-bone or relief if a square corner must mate.', 'Keep pocket depth under about 4× the tool diameter.', 'Undercuts need a second setup or a 5-axis machine.'] } },
  { id: 'mill5', name: 'CNC mill (4/5-axis)', family: 'Machining', input: '3d', outputs: ['gcode'], materials: ['Aluminium', 'Titanium', 'Steel', 'Inconel'], about: 'Tilting head or table reaches complex surfaces in one setup.',
    rules: { minWall: 0.5, minHole: 1, tolerance: 0.02, minInsideRadius: 1, notes: ['Simultaneous 5-axis toolpaths need a machine-specific post with kinematics; we export positional 3+2 programs.'] } },
  { id: 'router', name: 'CNC router', family: 'Machining', input: '2d', outputs: ['gcode', 'dxf', 'svg'], materials: ['Plywood', 'MDF', 'Hardwood', 'Acrylic', 'HDPE', 'Aluminium sheet', 'Foam'], about: 'Large-format cutting of sheet goods: furniture, signs, panels.',
    rules: { minWall: 3, minHole: 3.2, tolerance: 0.2, minInsideRadius: 3.175, notes: ['Leave tabs so parts do not break free on the last pass.', 'Climb-cut for a clean edge in wood; conventional in aluminium on light machines.'] } },
  { id: 'lathe', name: 'CNC lathe (turning)', family: 'Machining', input: 'turned', outputs: ['gcode', 'dxf'], materials: ['Steel', 'Aluminium', 'Brass', 'Stainless', 'Delrin', 'Titanium'], about: 'The part spins against a cutting tool: shafts, bushings, pins, threads.',
    rules: { tolerance: 0.025, minInsideRadius: 0.4, notes: ['Parts must be round about one axis.', 'Overhang from the chuck beyond about 3× diameter needs a tailstock.'] } },
  { id: 'wire-edm', name: 'Wire EDM', family: 'Machining', input: '2d', outputs: ['gcode', 'dxf'], materials: ['Tool steel', 'Carbide', 'Titanium', 'Any conductive metal'], about: 'A charged wire erodes conductive metal: hardened steel, sharp inside corners, no cutting force.',
    rules: { tolerance: 0.005, kerf: 0.3, minInsideRadius: 0.15, maxThickness: 300, notes: ['Conductive materials only.', 'Internal profiles need a start hole.'] } },
  { id: 'laser-co2', name: 'CO₂ laser cutter', family: 'Cutting', input: '2d', outputs: ['gcode', 'svg', 'dxf'], materials: ['Acrylic', 'Plywood', 'MDF', 'Cardboard', 'Leather', 'Fabric', 'Paper'], about: 'Cuts and engraves wood, acrylic, leather and more.',
    rules: { minWall: 1, minHole: 1, tolerance: 0.1, kerf: 0.15, maxThickness: 20, notes: ['Never cut PVC or vinyl: it releases chlorine gas that harms people and the machine.', 'Never leave a laser running unattended; keep an extinguisher near.', 'Polycarbonate scorches and fumes; acrylic is the clear plastic to use.'] } },
  { id: 'laser-fiber', name: 'Fiber laser (metal)', family: 'Cutting', input: '2d', outputs: ['gcode', 'dxf'], materials: ['Mild steel', 'Stainless', 'Aluminium', 'Brass', 'Copper'], about: 'High-power laser for sheet metal cutting and marking.',
    rules: { minWall: 1, minHole: 1, tolerance: 0.1, kerf: 0.1, maxThickness: 25, notes: ['Holes smaller than the sheet thickness come out tapered.', 'Class 4 invisible beam: enclosed machine and rated eyewear only.'] } },
  { id: 'laser-diode', name: 'Diode laser engraver', family: 'Cutting', input: '2d', outputs: ['gcode', 'svg'], materials: ['Plywood', 'Cardboard', 'Leather', 'Dark acrylic', 'Anodised aluminium (marking)'], about: 'Low-power desktop laser for engraving and thin cuts.',
    rules: { minWall: 1, minHole: 1, tolerance: 0.15, kerf: 0.1, maxThickness: 6, notes: ['Clear acrylic passes the beam; it cannot cut it.', 'Wear eyewear rated for the laser wavelength.'] } },
  { id: 'plasma', name: 'CNC plasma table', family: 'Cutting', input: '2d', outputs: ['gcode', 'dxf'], materials: ['Mild steel', 'Stainless', 'Aluminium'], about: 'An electric arc cuts conductive sheet and plate quickly.',
    rules: { minWall: 3, minHole: 6, tolerance: 0.5, kerf: 1.5, maxThickness: 25, notes: ['Holes under about 1.5× the plate thickness come out tapered; drill them instead.', 'Pierce off the line with a lead-in so the pierce mark is in scrap.'] } },
  { id: 'waterjet', name: 'Waterjet', family: 'Cutting', input: '2d', outputs: ['dxf', 'gcode'], materials: ['Any: metal, stone, glass, composites, rubber'], about: 'Abrasive water stream cuts almost anything with no heat-affected zone.',
    rules: { minWall: 1.5, minHole: 1.5, tolerance: 0.1, kerf: 0.9, maxThickness: 150, notes: ['Thick cuts taper unless the head tilts to compensate.'] } },
  { id: 'drag-knife', name: 'Vinyl / drag-knife cutter', family: 'Cutting', input: '2d', outputs: ['svg', 'dxf', 'gcode'], materials: ['Vinyl', 'Heat-transfer vinyl', 'Cardstock', 'Stencil film'], about: 'A trailing blade cuts thin sheet: signs, decals, stencils.',
    rules: { minWall: 0.5, minHole: 2, tolerance: 0.2, kerf: 0, maxThickness: 1, notes: ['Mirror designs for heat-transfer vinyl.'] } },
  { id: 'press-brake', name: 'Press brake (sheet metal bending)', family: 'Forming', input: '2d', outputs: ['dxf'], materials: ['Mild steel', 'Stainless', 'Aluminium'], about: 'Bends cut sheet into brackets, enclosures and chassis.',
    rules: { minWall: 0.5, tolerance: 0.25, notes: ['Inside bend radius at least the sheet thickness.', 'Flanges at least about 4× thickness long.', 'Keep holes at least 2× thickness from a bend or they distort.'] } },
];
export const processById = (id: string) => PROCESSES.find(p => p.id === id);

export type Dialect = 'marlin' | 'klipper' | 'reprap' | 'grbl' | 'grbl-laser' | 'linuxcnc' | 'iso' | 'plasma' | 'lathe-iso';
export type Link =
  | { kind: 'serial'; baud: number }
  | { kind: 'moonraker' } | { kind: 'octoprint' } | { kind: 'prusalink' } | { kind: 'duet' }
  | { kind: 'file'; note: string };

export interface Machine { id: string; name: string; process: ProcessId; dialect?: Dialect; link: Link; bed: [number, number, number]; nozzle?: number; about: string }

export const MACHINES: Machine[] = [
  { id: 'klipper-fdm', name: 'Klipper printer (Moonraker / Mainsail / Fluidd)', process: 'fdm', dialect: 'klipper', link: { kind: 'moonraker' }, bed: [235, 235, 250], nozzle: 0.4, about: 'Uploads and starts the print over your network.' },
  { id: 'prusalink-fdm', name: 'Prusa printer (PrusaLink)', process: 'fdm', dialect: 'marlin', link: { kind: 'prusalink' }, bed: [250, 210, 220], nozzle: 0.4, about: 'Uploads over PrusaLink with print-after-upload.' },
  { id: 'octoprint-fdm', name: 'OctoPrint-connected printer', process: 'fdm', dialect: 'marlin', link: { kind: 'octoprint' }, bed: [220, 220, 250], nozzle: 0.4, about: 'Uploads to OctoPrint and starts the job.' },
  { id: 'duet-fdm', name: 'Duet / RepRapFirmware printer', process: 'fdm', dialect: 'reprap', link: { kind: 'duet' }, bed: [300, 300, 300], nozzle: 0.4, about: 'Uploads over the Duet web interface.' },
  { id: 'marlin-usb', name: 'Marlin printer over USB', process: 'fdm', dialect: 'marlin', link: { kind: 'serial', baud: 115200 }, bed: [220, 220, 250], nozzle: 0.4, about: 'Streams G-code from the browser (Chrome or Edge) or the desktop app.' },
  { id: 'closed-fdm', name: 'Printer with its own slicer (Bambu, others)', process: 'fdm', link: { kind: 'file', note: 'Export 3MF and open it in the maker\'s slicer (Bambu Studio, OrcaSlicer, PrusaSlicer).' }, bed: [256, 256, 256], about: 'We hand over an oriented, checked 3MF.' },
  { id: 'resin-generic', name: 'Resin printer', process: 'resin', link: { kind: 'file', note: 'Export STL/3MF for Chitubox, Lychee or UVtools; they write the printer\'s own layer format.' }, bed: [218, 123, 250], about: 'Layer formats are printer-specific; we export the checked model.' },
  { id: 'sls-service', name: 'SLS / MJF machine or print service', process: 'sls', link: { kind: 'file', note: 'Send the 3MF to the machine\'s build-prep software or your print service.' }, bed: [340, 340, 380], about: 'Powder-bed nylon.' },
  { id: 'lpbf-generic', name: 'Metal powder-bed machine (LPBF)', process: 'lpbf', link: { kind: 'file', note: 'CLI layer files and 3MF load into open build processors and most machine build-prep tools.' }, bed: [250, 250, 300], about: 'Slices to CLI (Common Layer Interface), the open layer format for powder-bed machines.' },
  { id: 'ebm-generic', name: 'Electron beam (EBM) machine', process: 'ebm', link: { kind: 'file', note: 'CLI layers and 3MF for the machine\'s build prep.' }, bed: [200, 200, 380], about: 'Vacuum electron-beam melting.' },
  { id: 'binder-generic', name: 'Metal binder-jet printer', process: 'binder-jet', link: { kind: 'file', note: '3MF scaled for sintering shrinkage.' }, bed: [400, 250, 250], about: 'Green parts, then furnace.' },
  { id: 'bound-metal-fdm', name: 'Bound-metal filament printer', process: 'bound-metal', dialect: 'marlin', link: { kind: 'file', note: 'G-code for a hardened-nozzle printer, scaled for shrinkage; debind and sinter after.' }, bed: [250, 220, 200], nozzle: 0.6, about: 'Metal filament on an open printer.' },
  { id: 'waam-cell', name: 'WAAM / DED cell', process: 'ded', dialect: 'iso', link: { kind: 'file', note: 'ISO G-code bead paths; adapt to your robot or gantry controller.' }, bed: [1000, 1000, 600], about: 'Large near-net metal parts.' },
  { id: 'grbl-mill', name: 'GRBL / FluidNC mill or router', process: 'mill3', dialect: 'grbl', link: { kind: 'serial', baud: 115200 }, bed: [300, 300, 80], about: 'Streams over USB from the browser or desktop app.' },
  { id: 'linuxcnc-mill', name: 'LinuxCNC mill', process: 'mill3', dialect: 'linuxcnc', link: { kind: 'file', note: 'Copy the .ngc to the LinuxCNC machine.' }, bed: [500, 300, 300], about: 'RS-274/NGC program.' },
  { id: 'iso-vmc', name: 'Industrial VMC (Fanuc / Haas-style ISO)', process: 'mill3', dialect: 'iso', link: { kind: 'file', note: 'Load over USB, DNC or the network share; prove out with a dry run.' }, bed: [760, 400, 500], about: 'ISO 6983 G-code with program number, tool changes and coolant.' },
  { id: 'iso-5axis', name: '5-axis machining centre (3+2)', process: 'mill5', dialect: 'iso', link: { kind: 'file', note: 'Positional programs; use the machine\'s tilted work plane (G68.2 / CYCLE800).' }, bed: [650, 650, 450], about: 'Indexed 5-axis.' },
  { id: 'grbl-router', name: 'CNC router (GRBL / FluidNC)', process: 'router', dialect: 'grbl', link: { kind: 'serial', baud: 115200 }, bed: [1220, 2440, 100], about: 'Sheet goods.' },
  { id: 'linuxcnc-lathe', name: 'LinuxCNC lathe', process: 'lathe', dialect: 'lathe-iso', link: { kind: 'file', note: 'Copy the .ngc; X is in diameter mode (G7).' }, bed: [150, 300, 0], about: 'Turning.' },
  { id: 'iso-lathe', name: 'Industrial lathe (Fanuc-style)', process: 'lathe', dialect: 'lathe-iso', link: { kind: 'file', note: 'ISO turning program, X in diameter.' }, bed: [300, 600, 0], about: 'Turning centre.' },
  { id: 'edm-iso', name: 'Wire EDM', process: 'wire-edm', dialect: 'iso', link: { kind: 'file', note: 'ISO profile program or DXF for the machine\'s CAM.' }, bed: [400, 300, 250], about: 'Conductive profiles.' },
  { id: 'grbl-laser', name: 'GRBL laser (diode or CO₂)', process: 'laser-co2', dialect: 'grbl-laser', link: { kind: 'serial', baud: 115200 }, bed: [600, 400, 0], about: 'Laser mode M4 with dynamic power, streamed over USB.' },
  { id: 'ruida-laser', name: 'CO₂ laser with Ruida controller', process: 'laser-co2', link: { kind: 'file', note: 'Export DXF/SVG for LightBurn or RDWorks; the controller format is proprietary.' }, bed: [900, 600, 0], about: 'Most Chinese CO₂ machines.' },
  { id: 'fiber-laser', name: 'Fiber laser cutter', process: 'laser-fiber', dialect: 'iso', link: { kind: 'file', note: 'DXF for the machine\'s nesting software, or ISO cut program.' }, bed: [3000, 1500, 0], about: 'Sheet metal.' },
  { id: 'diode-laser', name: 'Diode laser engraver (GRBL)', process: 'laser-diode', dialect: 'grbl-laser', link: { kind: 'serial', baud: 115200 }, bed: [400, 400, 0], about: 'Desktop engraver.' },
  { id: 'plasma-table', name: 'CNC plasma table (LinuxCNC / QtPlasmaC, Mach)', process: 'plasma', dialect: 'plasma', link: { kind: 'file', note: 'Program with torch on/off, pierce delay and lead-ins.' }, bed: [1220, 1220, 0], about: 'Steel plate.' },
  { id: 'waterjet', name: 'Waterjet', process: 'waterjet', link: { kind: 'file', note: 'DXF for the waterjet\'s layout software.' }, bed: [3000, 1500, 0], about: 'Cuts anything.' },
  { id: 'vinyl-cutter', name: 'Vinyl cutter', process: 'drag-knife', link: { kind: 'file', note: 'SVG or DXF for the cutter software.' }, bed: [600, 5000, 0], about: 'Decals and stencils.' },
  { id: 'press-brake', name: 'Press brake', process: 'press-brake', link: { kind: 'file', note: 'Flat pattern DXF plus bend table.' }, bed: [3000, 0, 0], about: 'Bending.' },
];
export const machineById = (id: string) => MACHINES.find(m => m.id === id);
export const machinesFor = (p: ProcessId) => MACHINES.filter(m => m.process === p);
