import React from 'react';
import { motion } from 'motion/react';
import {
  Cpu,
  Wind,
  Sun,
  Share2,
  Boxes,
  Cloud,
  Waves,
  Activity,
  ExternalLink,
  Terminal,
  Globe,
  MonitorPlay,
} from 'lucide-react';

type ConnectKind = 'desktop' | 'python' | 'web-api';

interface Engine {
  name: string;
  what: string;
  connect: ConnectKind;
  connectNote: string;
  href: string;
  icon: React.ReactNode;
  domain: string;
}

const CONNECT_META: Record<ConnectKind, { label: string; icon: React.ReactNode }> = {
  desktop: { label: 'Desktop app', icon: <MonitorPlay className="h-3 w-3" /> },
  python: { label: 'Python', icon: <Terminal className="h-3 w-3" /> },
  'web-api': { label: 'Web API', icon: <Globe className="h-3 w-3" /> },
};

const ENGINES: Engine[] = [
  {
    name: 'OpenSees / OpenSeesPy',
    domain: 'Structural FEA',
    what: 'Nonlinear finite-element analysis of structures under static and dynamic (earthquake) loads — the research-grade standard for performance-based seismic engineering.',
    connect: 'python',
    connectNote: 'Export your model, script the analysis with the OpenSeesPy pip package, and run it locally or on a compute node. Results (drift, forces, hysteresis) come back as data you re-import here.',
    href: 'https://openseespydoc.readthedocs.io/',
    icon: <Cpu className="h-4 w-4" />,
  },
  {
    name: 'Code_Aster / Salome-Meca',
    domain: 'Mechanical FEA',
    what: 'EDF\'s industrial-strength open-source solver for structural mechanics, thermal, and modal analysis, driven through the Salome-Meca CAD/mesh/post workbench.',
    connect: 'desktop',
    connectNote: 'A desktop application. Import the geometry you inspected here, mesh it in Salome, define the study, and solve. No browser bridge — this is a launch-out reference.',
    href: 'https://www.code-aster.org/',
    icon: <Boxes className="h-4 w-4" />,
  },
  {
    name: 'FreeCAD FEM',
    domain: 'Parametric FEA',
    what: 'Free parametric CAD with a built-in FEM workbench (CalculiX/Elmer solvers) for stress, displacement, and modal studies on your model directly.',
    connect: 'desktop',
    connectNote: 'Open your .stl/.obj/.step in the FreeCAD FEM workbench, apply materials, constraints and loads, then solve with the bundled CalculiX solver.',
    href: 'https://wiki.freecad.org/FEM_Workbench',
    icon: <Boxes className="h-4 w-4" />,
  },
  {
    name: 'OpenFOAM',
    domain: 'CFD / Wind',
    what: 'The leading open-source computational fluid dynamics toolbox — pedestrian wind comfort, façade pressures, natural ventilation and thermal plumes around buildings.',
    connect: 'desktop',
    connectNote: 'Runs from the command line (often in Docker/WSL or on a cluster). Convert your surface mesh to a watertight domain, run blockMesh/snappyHexMesh, then simpleFoam. Long-running — not a browser task.',
    href: 'https://www.openfoam.com/',
    icon: <Wind className="h-4 w-4" />,
  },
  {
    name: 'Ladybug Tools + Radiance',
    domain: 'Daylight / Energy',
    what: 'Environmental analysis for architects — daylight factor, glare, solar radiation and EnergyPlus whole-building energy, via Radiance and OpenStudio engines.',
    connect: 'desktop',
    connectNote: 'Runs inside Grasshopper/Rhino or Revit. Export geometry, run the Honeybee/Radiance recipes locally, and bring the false-colour daylight grids back as images.',
    href: 'https://www.ladybug.tools/',
    icon: <Sun className="h-4 w-4" />,
  },
  {
    name: 'Speckle',
    domain: 'Interop / Streaming',
    what: 'Open data platform for AEC — version, stream and diff models between Revit, Rhino, Blender, IFC and code. The connective tissue between all of these engines.',
    connect: 'web-api',
    connectNote: 'Real web API + JS SDK. A Speckle server URL + token is a genuine connection point: this app could push/pull model streams over HTTPS/GraphQL without a desktop round-trip.',
    href: 'https://speckle.systems/',
    icon: <Share2 className="h-4 w-4" />,
  },
  {
    name: 'compute.rhino3d + Grasshopper',
    domain: 'Geometry compute',
    what: 'Headless Rhino geometry kernel exposed as an HTTP service, plus Grasshopper definitions run server-side — parametric geometry and analysis on demand.',
    connect: 'web-api',
    connectNote: 'Real REST API (Rhino.Compute / Hops). Given a hosted endpoint + API key, a Grasshopper definition can be evaluated over HTTP and its results streamed straight into this view.',
    href: 'https://www.rhino3d.com/compute/',
    icon: <Cloud className="h-4 w-4" />,
  },
  {
    name: 'Autodesk Platform Services',
    domain: 'Cloud CAD/BIM',
    what: 'Formerly Forge — cloud APIs for viewing, translating and querying Revit/Navisworks/IFC models, plus Model Derivative and Design Automation.',
    connect: 'web-api',
    connectNote: 'OAuth2 web API. With app credentials you can translate and inspect BIM models in the cloud and embed the APS Viewer — a legitimate web connection point.',
    href: 'https://aps.autodesk.com/',
    icon: <Globe className="h-4 w-4" />,
  },
  {
    name: 'USGS Seismic Design',
    domain: 'Seismic hazard',
    what: 'US Geological Survey seismic-design web service returning ASCE 7 hazard parameters (Ss, S1, SDS, SD1) for a site by latitude/longitude and risk category.',
    connect: 'web-api',
    connectNote: 'Public web API. Query by coordinates to pull the code-based seismic parameters that feed the ASCE 7 load combinations in the Calculators tab.',
    href: 'https://earthquake.usgs.gov/ws/designmaps/',
    icon: <Activity className="h-4 w-4" />,
  },
];

export default function SimulationEngines({ accent }: { accent: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-3.5">
        <Waves className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
        <p className="text-[12px] leading-relaxed text-white/60">
          <span className="font-bold text-white/80">Honest note:</span> in the browser this is a launchpad and
          inspector — it does not secretly run full FEA or CFD. The cards marked{' '}
          <span className="font-semibold" style={{ color: accent }}>
            Web API
          </span>{' '}
          (Speckle, compute.rhino3d, Autodesk Platform Services, USGS) are genuine connection points a build could
          call over HTTPS. The rest are desktop / Python tools you run alongside, then bring results back here.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ENGINES.map((e, i) => {
          const meta = CONNECT_META[e.connect];
          return (
            <motion.a
              key={e.name}
              href={e.href}
              target="_blank"
              rel="noreferrer noopener"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="group flex flex-col rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ background: `${accent}1f`, color: accent }}
                  >
                    {e.icon}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white/90">{e.name}</div>
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/40">{e.domain}</div>
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-white/25 transition-colors group-hover:text-white/60" />
              </div>

              <p className="mt-3 flex-1 text-[12px] leading-relaxed text-white/55">{e.what}</p>

              <div className="mt-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/45">
                  <span style={{ color: accent }}>{meta.icon}</span>
                  Connects via {meta.label}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-white/45">{e.connectNote}</p>
              </div>
            </motion.a>
          );
        })}
      </div>
    </div>
  );
}
