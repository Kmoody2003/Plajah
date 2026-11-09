// Maker supplier exchange: one place to find where parts come from and who can make things.
// Each entry says what they do, where they ship from, and how we connect: a live API we call from
// the server (with the operator's own free key), a cart/BOM upload page, or a plain link. Facts are
// from each company's public site as of 2026-11; "api" means a published developer API exists.
// Listing here is not an endorsement; Plajah takes no cut from these links.

export type Category = 'components' | 'boards' | 'pcb' | 'mechanical' | '3d-print' | 'cnc' | 'sheet' | 'print-on-demand' | 'textile' | 'plush' | 'apparel' | 'materials';
export type Connect = 'api' | 'upload' | 'link';
export interface Supplier { id: string; name: string; url: string; categories: Category[]; ships: string; connect: Connect; api?: string; about: string; minOrder?: string }

export const SUPPLIERS: Supplier[] = [
  // Electronic components
  { id: 'digikey', name: 'DigiKey', url: 'https://www.digikey.com', categories: ['components', 'boards'], ships: 'Worldwide (US)', connect: 'api', api: 'Product Information v4 (OAuth client credentials, free developer account)', about: 'Huge authorised stock, cut tape, ships fast. Live price and stock in Plajah when the operator adds a DigiKey key.' },
  { id: 'mouser', name: 'Mouser', url: 'https://www.mouser.com', categories: ['components', 'boards'], ships: 'Worldwide (US)', connect: 'api', api: 'Search API (free key; up to 30 calls/min, 1,000/day)', about: 'Authorised distributor with BOM upload. Live price and stock with a Mouser search key.' },
  { id: 'lcsc', name: 'LCSC', url: 'https://www.lcsc.com', categories: ['components'], ships: 'Worldwide (CN)', connect: 'upload', about: 'Low-cost parts; same catalogue JLCPCB assembles from. BOM upload on site.' },
  { id: 'farnell', name: 'Farnell / Newark', url: 'https://www.farnell.com', categories: ['components', 'boards'], ships: 'Worldwide (UK/US)', connect: 'link', about: 'Authorised distributor; Raspberry Pi approved reseller in many countries.' },
  { id: 'tme', name: 'TME', url: 'https://www.tme.eu', categories: ['components'], ships: 'EU', connect: 'link', about: 'European distributor with good passive and connector stock.' },
  { id: 'adafruit', name: 'Adafruit', url: 'https://www.adafruit.com', categories: ['boards', 'components'], ships: 'Worldwide (US)', connect: 'link', about: 'Maker boards, breakouts (BME280, PAM8302 amp), excellent guides; open-source hardware.' },
  { id: 'sparkfun', name: 'SparkFun', url: 'https://www.sparkfun.com', categories: ['boards', 'components'], ships: 'Worldwide (US)', connect: 'link', about: 'Maker boards and breakouts, open-source designs.' },
  { id: 'pimoroni', name: 'Pimoroni', url: 'https://shop.pimoroni.com', categories: ['boards'], ships: 'Worldwide (UK)', connect: 'link', about: 'Raspberry Pi approved reseller; add-on boards.' },
  { id: 'rpi-resellers', name: 'Raspberry Pi approved resellers', url: 'https://www.raspberrypi.com/resellers/', categories: ['boards'], ships: 'By country', connect: 'link', about: 'Official list: buy genuine Pi boards and power supplies in your country.' },
  // PCBs
  { id: 'jlcpcb', name: 'JLCPCB', url: 'https://jlcpcb.com', categories: ['pcb', '3d-print', 'cnc'], ships: 'Worldwide (CN)', connect: 'upload', about: 'Cheap PCBs and assembly from Gerbers + BOM/CPL; also 3D printing and CNC.', minOrder: '5 boards' },
  { id: 'pcbway', name: 'PCBWay', url: 'https://www.pcbway.com', categories: ['pcb', '3d-print', 'cnc', 'sheet'], ships: 'Worldwide (CN)', connect: 'upload', about: 'PCBs, assembly, CNC, sheet metal and injection moulding quotes from uploads.' },
  { id: 'oshpark', name: 'OSH Park', url: 'https://oshpark.com', categories: ['pcb'], ships: 'Worldwide (US)', connect: 'upload', about: 'US-made purple boards, priced per square inch, sets of 3.', minOrder: '3 boards' },
  { id: 'aisler', name: 'Aisler', url: 'https://aisler.net', categories: ['pcb'], ships: 'EU', connect: 'upload', about: 'European PCBs and assembly.' },
  // Mechanical
  { id: 'mcmaster', name: 'McMaster-Carr', url: 'https://www.mcmaster.com', categories: ['mechanical', 'materials'], ships: 'US', connect: 'link', about: 'Fasteners, bearings, stock; free CAD for most parts.' },
  { id: 'misumi', name: 'MISUMI', url: 'https://us.misumi-ec.com', categories: ['mechanical'], ships: 'Worldwide', connect: 'link', about: 'Configurable mechanical components and extrusion.' },
  { id: 'boltdepot', name: 'Bolt Depot', url: 'https://www.boltdepot.com', categories: ['mechanical'], ships: 'US', connect: 'link', about: 'Fasteners in small quantities.' },
  { id: 'onlinemetals', name: 'OnlineMetals', url: 'https://www.onlinemetals.com', categories: ['materials'], ships: 'US', connect: 'link', about: 'Metal and plastic stock cut to size.' },
  // Making services
  { id: 'craftcloud', name: 'Craftcloud', url: 'https://craftcloud3d.com', categories: ['3d-print', 'cnc'], ships: 'Worldwide', connect: 'upload', about: 'Compares 3D-print prices from a network of print services; upload STL/3MF/OBJ.' },
  { id: 'sendcutsend', name: 'SendCutSend', url: 'https://sendcutsend.com', categories: ['sheet', 'cnc'], ships: 'US', connect: 'upload', about: 'Laser, waterjet and CNC-routed parts from DXF; bending, finishing.' },
  { id: 'oshcut', name: 'OSH Cut', url: 'https://www.oshcut.com', categories: ['sheet'], ships: 'US', connect: 'upload', about: 'Laser-cut and bent sheet metal from DXF/STEP with instant quotes.' },
  { id: 'xometry', name: 'Xometry', url: 'https://www.xometry.com', categories: ['cnc', '3d-print', 'sheet'], ships: 'US/EU', connect: 'upload', about: 'Instant quotes for CNC, printing, sheet metal, moulding from STEP/STL.' },
  { id: 'protolabs', name: 'Protolabs', url: 'https://www.protolabs.com', categories: ['cnc', '3d-print', 'sheet'], ships: 'US/EU/JP', connect: 'upload', about: 'Fast CNC, moulding and printing; Protolabs Network for marketplace pricing.' },
  { id: 'ponoko', name: 'Ponoko', url: 'https://www.ponoko.com', categories: ['sheet'], ships: 'US', connect: 'upload', about: 'Laser cutting of acrylic, wood and metal from vector files.' },
  // Print on demand: textiles, home goods, apparel
  { id: 'printful', name: 'Printful', url: 'https://www.printful.com', categories: ['print-on-demand', 'textile', 'apparel'], ships: 'Worldwide (US/EU/MX)', connect: 'api', api: 'Printful API (products, files, orders)', about: 'All-over-print clothing, throw pillows, blankets, towels; Plajah merch already uses it.' },
  { id: 'printify', name: 'Printify', url: 'https://printify.com', categories: ['print-on-demand', 'textile', 'apparel'], ships: 'Worldwide', connect: 'api', api: 'Printify API (catalogue, products, orders)', about: 'Network of print providers: apparel, pillows, blankets, some plush.' },
  { id: 'gooten', name: 'Gooten', url: 'https://www.gooten.com', categories: ['print-on-demand', 'textile'], ships: 'US/EU', connect: 'api', api: 'Gooten API', about: 'Home goods: woven blankets, throw pillows, bedding, plus apparel.' },
  { id: 'contrado', name: 'Contrado', url: 'https://www.contrado.com', categories: ['print-on-demand', 'textile', 'apparel'], ships: 'Worldwide (UK)', connect: 'api', api: 'Contrado print-on-demand API', about: 'Custom-printed fabric by the metre, cut-and-sew fashion, cushions and home textiles.' },
  { id: 'spreadconnect', name: 'Spreadconnect', url: 'https://spreadshop.com/spreadconnect-api', categories: ['print-on-demand', 'apparel'], ships: 'US/EU', connect: 'api', api: 'Spreadconnect API', about: 'Apparel print-on-demand with an order API.' },
  { id: 'spoonflower', name: 'Spoonflower', url: 'https://www.spoonflower.com', categories: ['textile', 'materials'], ships: 'Worldwide (US)', connect: 'upload', about: 'Your pattern printed on fabric by the yard (cotton, fleece, minky for plush), wallpaper; upload artwork at 150 dpi.' },
  // Plush and cut-and-sew manufacturing
  { id: 'makeship', name: 'Makeship', url: 'https://www.makeship.com', categories: ['plush'], ships: 'Worldwide', connect: 'link', about: 'Creator plush made through limited-time pre-order campaigns; they handle sampling and production.' },
  { id: 'budsies', name: 'Budsies', url: 'https://www.budsies.com', categories: ['plush'], ships: 'US', connect: 'upload', about: 'One-off custom plush from a drawing or photo.' },
  { id: 'sewport', name: 'Sewport', url: 'https://sewport.com', categories: ['apparel', 'plush', 'textile'], ships: 'Worldwide', connect: 'upload', about: 'Matches your tech pack, sketches and quantities with clothing and soft-goods manufacturers, including small runs.' },
  { id: 'makersrow', name: "Maker's Row", url: 'https://makersrow.com', categories: ['apparel', 'textile'], ships: 'US', connect: 'link', about: 'Directory of US factories for apparel, cut-and-sew and textiles.' },
];

export const CATEGORY_LABEL: Record<Category, string> = {
  components: 'Electronic parts', boards: 'Boards & modules', pcb: 'Circuit boards', mechanical: 'Mechanical parts', '3d-print': '3D printing', cnc: 'CNC machining', sheet: 'Laser & sheet metal',
  'print-on-demand': 'Print on demand', textile: 'Fabric & home textiles', plush: 'Plush & toys', apparel: 'Clothing manufacturing', materials: 'Raw materials',
};

/** Which categories a fabrication process sends work to. */
export const PROCESS_CATEGORY: Record<string, Category[]> = {
  fdm: ['3d-print'], resin: ['3d-print'], sls: ['3d-print'], mjf: ['3d-print'], polyjet: ['3d-print'], lpbf: ['3d-print'], ebm: ['3d-print'], 'binder-jet': ['3d-print'], 'bound-metal': ['3d-print'], ded: ['3d-print'],
  mill3: ['cnc'], mill5: ['cnc'], router: ['cnc', 'sheet'], lathe: ['cnc'], 'wire-edm': ['cnc'], 'laser-co2': ['sheet'], 'laser-fiber': ['sheet'], 'laser-diode': ['sheet'], plasma: ['sheet'], waterjet: ['sheet'], 'drag-knife': ['sheet'], 'press-brake': ['sheet'],
};

/** Capabilities a local maker shop can list (the same process ids as the Make tab, plus soft goods). */
export const SHOP_CAPABILITIES: Array<{ id: string; label: string }> = [
  { id: 'fdm', label: 'FDM printing' }, { id: 'resin', label: 'Resin printing' }, { id: 'sls', label: 'SLS / MJF' }, { id: 'lpbf', label: 'Metal printing' },
  { id: 'mill3', label: 'CNC milling' }, { id: 'router', label: 'CNC routing' }, { id: 'lathe', label: 'Turning' }, { id: 'laser-co2', label: 'Laser cutting' }, { id: 'laser-fiber', label: 'Fiber laser (metal)' },
  { id: 'plasma', label: 'Plasma cutting' }, { id: 'waterjet', label: 'Waterjet' }, { id: 'press-brake', label: 'Sheet-metal bending' }, { id: 'welding', label: 'Welding' },
  { id: 'pcb-assembly', label: 'PCB assembly / soldering' }, { id: 'electronics', label: 'Electronics prototyping' }, { id: 'woodwork', label: 'Woodworking / luthiery' },
  { id: 'sewing', label: 'Sewing / alterations' }, { id: 'cut-sew', label: 'Cut-and-sew production' }, { id: 'pattern', label: 'Pattern making' }, { id: 'plush', label: 'Plush making' }, { id: 'embroidery', label: 'Embroidery' }, { id: 'screen-print', label: 'Screen printing' }, { id: 'upholstery', label: 'Upholstery / home textiles' },
];

export function suppliersFor(cats: Category[]): Supplier[] { return SUPPLIERS.filter(s => s.categories.some(c => cats.includes(c))); }
