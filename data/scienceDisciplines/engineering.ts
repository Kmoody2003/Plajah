// ─────────────────────────────────────────────────────────────────────────────
// Engineering discipline data for the Plajah Academia science studio.
// Accuracy-first: every figure carries a real Wikipedia slug (final path segment
// of en.wikipedia.org/wiki/<slug>) so portraits + biographies enrich live at
// runtime. Formulas are KaTeX-ready and verified; tool URLs point at real, free,
// stable resources.
// ─────────────────────────────────────────────────────────────────────────────
import type { ScienceDisciplineData } from './types';

const DATA: ScienceDisciplineData = {
  id: 'engineering',
  label: 'Engineering',
  icon: 'Cpu',
  accent: '#FFA94D',
  accent2: '#E8590C',
  tagline: 'Turning the laws of nature into machines, structures and systems.',
  heroBlurb:
    'Engineering is applied science with a deadline: the disciplined art of building things that work, safely and economically. From the steam engine to the transistor and the feedback loop, it converts physics into the bridges, engines, circuits and control systems that run the modern world.',
  openStaxSubject: 'engineering',
  arXivCategory: 'eess.SY',
  arXivQuery: 'systems control robotics signal',
  simulators: ['projectile', 'beam'],

  figureHalls: [
    { id: 'mechanical', label: 'Mechanical & Power', blurb: 'Heat engines, thermodynamics and the machines that put energy to work — from steam to the internal-combustion age.' },
    { id: 'civil', label: 'Civil & Structural', blurb: 'The builders of bridges, railways, towers and skyscrapers who made structures span farther and rise higher.' },
    { id: 'electrical', label: 'Electrical & Electronics', blurb: 'Pioneers of electricity, radio and the solid-state devices that electrified and connected the planet.' },
    { id: 'control', label: 'Control, Systems & Computing', blurb: 'The architects of feedback, information and computation who taught machines to regulate and reason.' },
  ],

  figures: [
    // Mechanical & Power
    {
      id: 'watt', name: 'James Watt', wikiSlug: 'James_Watt', hall: 'mechanical',
      role: 'Mechanical engineer', era: 'Industrial Revolution', nationality: 'Scottish', years: '1736–1819',
      tagline: 'His separate condenser made steam power practical.',
      works: ['Watt steam engine', 'Separate condenser', 'Parallel motion linkage'],
      techniques: ['Separate condenser cut fuel use dramatically', 'Rotary motion via sun-and-planet gearing', 'Centrifugal governor for speed regulation — early feedback control'],
    },
    {
      id: 'carnot', name: 'Sadi Carnot', wikiSlug: 'Nicolas_Léonard_Sadi_Carnot', hall: 'mechanical',
      role: 'Physicist & engineer', era: 'Early thermodynamics', nationality: 'French', years: '1796–1832',
      tagline: 'Founder of thermodynamics and the ideal heat-engine cycle.',
      works: ['Reflections on the Motive Power of Fire (1824)', 'Carnot cycle'],
      techniques: ['Defined the maximum efficiency of any heat engine', 'Introduced the reversible ideal cycle', 'Framed the temperature-limit basis of the second law'],
    },
    {
      id: 'diesel', name: 'Rudolf Diesel', wikiSlug: 'Rudolf_Diesel', hall: 'mechanical',
      role: 'Mechanical engineer', era: 'Second Industrial Revolution', nationality: 'German', years: '1858–1913',
      tagline: 'Inventor of the compression-ignition engine.',
      works: ['Diesel engine', 'Theory and Construction of a Rational Heat Engine (1893)'],
      techniques: ['Compression ignition without a spark', 'High thermal efficiency from high compression ratios', 'Multi-fuel operation including vegetable oils'],
    },
    {
      id: 'carrier', name: 'Willis Carrier', wikiSlug: 'Willis_Carrier', hall: 'mechanical',
      role: 'Mechanical engineer', era: 'Early 20th century', nationality: 'American', years: '1876–1950',
      tagline: 'Father of modern air conditioning.',
      works: ['Apparatus for Treating Air (1906)', 'Rational Psychrometric Formulae'],
      techniques: ['Controlled humidity and temperature together', 'Published the psychrometric chart engineers still use', 'Centrifugal refrigeration for large buildings'],
    },
    {
      id: 'benz', name: 'Karl Benz', wikiSlug: 'Carl_Benz', hall: 'mechanical',
      role: 'Automotive engineer', era: 'Second Industrial Revolution', nationality: 'German', years: '1844–1929',
      tagline: 'Built the first practical automobile.',
      works: ['Benz Patent-Motorwagen (1885)', 'Two-stroke and four-stroke engines'],
      techniques: ['Integrated engine, chassis and drivetrain', 'Electric ignition and water-cooling', 'Founded what became Mercedes-Benz'],
    },

    // Civil & Structural
    {
      id: 'brunel', name: 'Isambard Kingdom Brunel', wikiSlug: 'Isambard_Kingdom_Brunel', hall: 'civil',
      role: 'Civil engineer', era: 'Victorian era', nationality: 'British', years: '1806–1859',
      tagline: 'The most versatile engineer of the age of iron.',
      works: ['Great Western Railway', 'Clifton Suspension Bridge', 'SS Great Eastern', 'Thames Tunnel'],
      techniques: ['Broad-gauge railway with gentle gradients', 'Wrought-iron suspension and box-girder bridges', 'Iron-hulled screw-propeller steamships'],
    },
    {
      id: 'eiffel', name: 'Gustave Eiffel', wikiSlug: 'Gustave_Eiffel', hall: 'civil',
      role: 'Structural engineer', era: 'Belle Époque', nationality: 'French', years: '1832–1923',
      tagline: 'Master of the wrought-iron lattice.',
      works: ['Eiffel Tower', 'Garabit Viaduct', 'Statue of Liberty internal frame'],
      techniques: ['Prefabricated riveted wrought-iron lattices', 'Wind-load analysis of tall structures', 'Pin-jointed truss viaducts over deep valleys'],
    },
    {
      id: 'roebling-j', name: 'John A. Roebling', wikiSlug: 'John_A._Roebling', hall: 'civil',
      role: 'Civil engineer', era: '19th century', nationality: 'German-American', years: '1806–1869',
      tagline: 'Pioneer of the modern wire-cable suspension bridge.',
      works: ['Brooklyn Bridge (design)', 'Niagara Falls Suspension Bridge', 'Cincinnati–Covington Bridge'],
      techniques: ['Spun steel-wire main cables in place', 'Combined suspension cables with diagonal stays for stiffness', 'Founded a wire-rope manufacturing industry'],
    },
    {
      id: 'roebling-e', name: 'Emily Warren Roebling', wikiSlug: 'Emily_Warren_Roebling', hall: 'civil',
      role: 'Engineer & project leader', era: '19th century', nationality: 'American', years: '1843–1903',
      tagline: 'Saw the Brooklyn Bridge to completion.',
      works: ['Brooklyn Bridge (construction leadership)'],
      techniques: ['Learned stress analysis, cable construction and caisson work', 'Ran day-to-day engineering after Washington Roebling fell ill', 'Liaised between the chief engineer, contractors and city officials'],
    },
    {
      id: 'khan', name: 'Fazlur Rahman Khan', wikiSlug: 'Fazlur_Rahman_Khan', hall: 'civil',
      role: 'Structural engineer', era: 'Modern skyscraper era', nationality: 'Bangladeshi-American', years: '1929–1982',
      tagline: 'Invented the structural systems of the modern skyscraper.',
      works: ['Willis (Sears) Tower', 'John Hancock Center', 'Tubular structural systems'],
      techniques: ['Framed-tube and bundled-tube structural systems', 'Trussed exterior tubes resisting wind as a cantilever', 'Computer-aided structural optimization'],
    },

    // Electrical & Electronics
    {
      id: 'tesla', name: 'Nikola Tesla', wikiSlug: 'Nikola_Tesla', hall: 'electrical',
      role: 'Electrical engineer', era: 'War of the Currents', nationality: 'Serbian-American', years: '1856–1943',
      tagline: 'Architect of the alternating-current power system.',
      works: ['Polyphase AC induction motor', 'Tesla coil', 'Niagara Falls power system'],
      techniques: ['Rotating magnetic field and the AC induction motor', 'Polyphase alternating-current transmission', 'High-frequency resonant transformers'],
    },
    {
      id: 'faraday', name: 'Michael Faraday', wikiSlug: 'Michael_Faraday', hall: 'electrical',
      role: 'Physicist & experimenter', era: 'Victorian science', nationality: 'British', years: '1791–1867',
      tagline: 'Discovered electromagnetic induction — the basis of the generator.',
      works: ['Law of induction', 'Faraday cage', 'Electric motor and dynamo prototypes'],
      techniques: ['Electromagnetic induction: moving fields make current', 'Field-line concept underlying all electrical machines', 'Electrochemistry and the laws of electrolysis'],
    },
    {
      id: 'clarke', name: 'Edith Clarke', wikiSlug: 'Edith_Clarke', hall: 'electrical',
      role: 'Electrical engineer', era: 'Early power systems', nationality: 'American', years: '1883–1959',
      tagline: 'First female professor of electrical engineering in the US.',
      works: ['Clarke calculator', 'Circuit Analysis of A-C Power Systems'],
      techniques: ['Graphical calculator for transmission-line equations', 'Symmetrical-components analysis of power systems', 'Modeling large-network stability and load flow'],
    },
    {
      id: 'marconi', name: 'Guglielmo Marconi', wikiSlug: 'Guglielmo_Marconi', hall: 'electrical',
      role: 'Radio engineer', era: 'Wireless age', nationality: 'Italian', years: '1874–1937',
      tagline: 'Sent the first transatlantic radio signal.',
      works: ['Wireless telegraphy system', 'Transatlantic transmission (1901)'],
      techniques: ['Grounded antennas for long-range transmission', 'Tuned resonant circuits for selectivity', 'Practical spark-gap and later valve transmitters'],
    },
    {
      id: 'bardeen', name: 'John Bardeen', wikiSlug: 'John_Bardeen', hall: 'electrical',
      role: 'Physicist & engineer', era: 'Solid-state revolution', nationality: 'American', years: '1908–1991',
      tagline: 'Co-invented the transistor — twice a physics Nobel laureate.',
      works: ['Point-contact transistor', 'BCS theory of superconductivity'],
      techniques: ['Semiconductor surface-state control', 'Amplification in a solid-state device', 'Theory of superconducting electron pairing'],
    },

    // Control, Systems & Computing
    {
      id: 'shannon', name: 'Claude Shannon', wikiSlug: 'Claude_Shannon', hall: 'control',
      role: 'Electrical engineer & mathematician', era: 'Information age', nationality: 'American', years: '1916–2001',
      tagline: 'Founder of information theory.',
      works: ['A Mathematical Theory of Communication (1948)', 'A Symbolic Analysis of Relay and Switching Circuits'],
      techniques: ['Quantified information in bits and defined channel capacity', 'Showed Boolean algebra models digital circuits', 'Founded the theory of reliable communication over noisy channels'],
    },
    {
      id: 'wiener', name: 'Norbert Wiener', wikiSlug: 'Norbert_Wiener', hall: 'control',
      role: 'Mathematician', era: 'Post-war systems science', nationality: 'American', years: '1894–1964',
      tagline: 'Founded cybernetics — the science of control and communication.',
      works: ['Cybernetics: or Control and Communication in the Animal and the Machine (1948)', 'Wiener filter'],
      techniques: ['Feedback as a unifying idea across machines and organisms', 'Optimal filtering of signals from noise', 'Stochastic-process foundations of prediction'],
    },
    {
      id: 'black', name: 'Harold Stephen Black', wikiSlug: 'Harold_Stephen_Black', hall: 'control',
      role: 'Electrical engineer', era: 'Bell Labs era', nationality: 'American', years: '1898–1983',
      tagline: 'Invented the negative-feedback amplifier.',
      works: ['Negative-feedback amplifier (1927)', 'Modulation Theory'],
      techniques: ['Traded gain for stability and low distortion', 'Enabled long-distance telephone repeaters', 'Founded the practical theory of feedback electronics'],
    },
    {
      id: 'bode', name: 'Hendrik Wade Bode', wikiSlug: 'Hendrik_Wade_Bode', hall: 'control',
      role: 'Control engineer', era: 'Classical control', nationality: 'American', years: '1905–1982',
      tagline: 'Gave control engineers the frequency-response toolkit.',
      works: ['Network Analysis and Feedback Amplifier Design', 'Bode plot', 'Gain–phase relation'],
      techniques: ['Magnitude and phase plots for stability margins', 'Gain and phase margins as design targets', 'Frequency-domain feedback-amplifier design'],
    },
    {
      id: 'kalman', name: 'Rudolf E. Kálmán', wikiSlug: 'Rudolf_E._Kálmán', hall: 'control',
      role: 'Control theorist', era: 'Modern control', nationality: 'Hungarian-American', years: '1930–2016',
      tagline: 'Creator of the Kalman filter and state-space control.',
      works: ['Kalman filter', 'Theory of controllability and observability'],
      techniques: ['Recursive optimal estimation from noisy measurements', 'State-space formulation of dynamic systems', 'Controllability and observability criteria'],
    },
    {
      id: 'hopper', name: 'Grace Hopper', wikiSlug: 'Grace_Hopper', hall: 'control',
      role: 'Computer scientist & engineer', era: 'Dawn of computing', nationality: 'American', years: '1906–1992',
      tagline: 'Pioneer of the compiler and machine-independent programming.',
      works: ['A-0 compiler', 'FLOW-MATIC', 'COBOL (influence)'],
      techniques: ['First compiler translating symbolic code to machine code', 'English-like programming languages', 'Standardization and portability of software'],
    },
  ],

  concepts: [
    { id: 'feedback', name: 'Feedback & Control', blurb: 'Measuring a system\'s output and feeding it back to drive the input toward a desired setpoint — the core of thermostats, autopilots and cruise control.', wikiSlug: 'Control_theory', tags: ['control', 'systems'] },
    { id: 'stress-strain', name: 'Stress & Strain', blurb: 'How materials deform and fail under load. Stress is force per area; strain is fractional deformation; their ratio (within limits) is the material\'s stiffness.', wikiSlug: 'Stress–strain_analysis', tags: ['materials', 'mechanics'] },
    { id: 'thermo', name: 'Thermodynamics', blurb: 'The laws governing heat, work and energy conversion — why no engine can be perfectly efficient and why heat flows only from hot to cold.', wikiSlug: 'Thermodynamics', tags: ['energy', 'thermodynamics'] },
    { id: 'dsp', name: 'Signal Processing', blurb: 'Filtering, sampling and transforming signals — the mathematics that turns raw sensor data into audio, images and communications.', wikiSlug: 'Signal_processing', tags: ['signals', 'electronics'] },
    { id: 'materials', name: 'Materials Science', blurb: 'Choosing and engineering materials — steel, concrete, alloys, composites, semiconductors — by matching microstructure to the demands of the job.', wikiSlug: 'Materials_science', tags: ['materials'] },
    { id: 'fluid', name: 'Fluid Mechanics', blurb: 'How liquids and gases flow, exert pressure and carry energy — the basis of pumps, turbines, pipelines, wings and hydraulics.', wikiSlug: 'Fluid_mechanics', tags: ['fluids', 'mechanics'] },
    { id: 'circuits', name: 'Circuit Analysis', blurb: 'Predicting voltage and current in networks of resistors, capacitors, inductors and sources using Ohm\'s and Kirchhoff\'s laws.', wikiSlug: 'Network_analysis_(electrical_circuits)', tags: ['electronics', 'signals'] },
    { id: 'statics', name: 'Statics & Equilibrium', blurb: 'Analysing structures at rest: for a body in equilibrium the sum of forces and moments is zero — the foundation of all structural design.', wikiSlug: 'Statics', tags: ['mechanics', 'structures'] },
    { id: 'buckling', name: 'Buckling & Stability', blurb: 'Slender columns fail not by crushing but by suddenly bowing sideways at a critical load — a stability problem, not a strength one.', wikiSlug: 'Buckling', tags: ['structures', 'mechanics'] },
    { id: 'optimization', name: 'Optimization', blurb: 'Finding the best design under constraints — minimum weight, maximum efficiency, lowest cost — the mathematical engine of modern engineering design.', wikiSlug: 'Mathematical_optimization', tags: ['systems', 'design'] },
    { id: 'reliability', name: 'Reliability & Safety Factors', blurb: 'Designing for uncertainty: safety factors, redundancy and failure analysis ensure structures and systems survive loads beyond their nominal rating.', wikiSlug: 'Factor_of_safety', tags: ['systems', 'design'] },
    { id: 'semiconductor', name: 'Semiconductor Devices', blurb: 'Diodes, transistors and integrated circuits exploit controlled conduction in silicon to switch and amplify — the substrate of all digital technology.', wikiSlug: 'Semiconductor_device', tags: ['electronics'] },
  ],

  eras: [
    {
      id: 'ancient', title: 'Ancient Engineering', span: 'Antiquity–500 CE',
      essay: 'Long before formal science, builders mastered levers, arches, aqueducts and siege machines by rule of thumb and accumulated craft. Roman concrete, the arch and the aqueduct let cities grow; Archimedes turned mechanics into mathematics.',
      developments: ['The lever, pulley, wedge, screw and inclined plane', 'The true arch and vault', 'Roman roads, aqueducts and concrete (opus caementicium)'],
      turningPoints: ['Archimedes formalizes levers and buoyancy', 'Roman engineers standardize the arch and aqueduct'],
    },
    {
      id: 'medieval', title: 'Medieval Machines & Master Builders', span: '500–1500',
      essay: 'Watermills and windmills mechanized grinding and pumping; the mechanical clock introduced precise timekeeping and gearing. Gothic cathedral builders pushed masonry to its limits with flying buttresses and ribbed vaults.',
      developments: ['Water and wind power for milling and pumping', 'The escapement and the mechanical clock', 'Trebuchets and gunpowder artillery'],
      turningPoints: ['The mechanical clock brings precision gearing', 'Gunpowder reshapes fortification and civil works'],
    },
    {
      id: 'renaissance', title: 'Renaissance & Scientific Foundations', span: '1500–1700',
      essay: 'Engineers became theorists. Leonardo\'s notebooks, Galileo\'s study of beams and materials, and the birth of mechanics gave building a mathematical footing. Fortification, canals and pumps grew more sophisticated.',
      developments: ['Galileo\'s analysis of beam strength', 'Systematic study of materials and structures', 'Advanced fortification and hydraulic works'],
      turningPoints: ['Galileo founds the strength of materials', 'Newtonian mechanics gives engineering its laws'],
    },
    {
      id: 'industrial', title: 'The Industrial Revolution', span: '1700–1850',
      essay: 'The steam engine converted heat into motion at industrial scale, and iron replaced timber and stone. Watt\'s condenser, precision machine tools and the railway remade economies. Thermodynamics was born to explain the engines already running.',
      developments: ['Newcomen and Watt steam engines', 'Cast- and wrought-iron structures and rails', 'Precision machine tools and interchangeable parts'],
      turningPoints: ['Watt\'s separate condenser (1769)', 'Carnot founds thermodynamics (1824)'],
    },
    {
      id: 'second-industrial', title: 'The Second Industrial Revolution', span: '1850–1914',
      essay: 'Steel, electricity and chemistry drove a second wave. The Bessemer process made cheap steel; Faraday\'s induction became the generator and motor; the internal-combustion engine and the telephone appeared. Engineering professionalized into codified disciplines.',
      developments: ['Cheap steel via the Bessemer and open-hearth processes', 'Electric power generation, motors and lighting', 'Internal-combustion engines and the automobile', 'Telegraph and telephone networks'],
      turningPoints: ['Tesla and Westinghouse win the AC power system', 'The Eiffel Tower and steel-frame skyscraper'],
    },
    {
      id: 'systems', title: 'The Systems & Electronics Age', span: '1914–1970',
      essay: 'Two world wars accelerated aviation, radar, rocketry and mass production. Feedback control, information theory and the transistor emerged from the telephone and defense labs, laying the groundwork for automation and computing.',
      developments: ['Feedback amplifiers and classical control theory', 'The transistor and integrated circuit', 'Information theory and digital communication', 'Jet propulsion, radar and rocketry'],
      turningPoints: ['Black\'s negative-feedback amplifier (1927)', 'Shannon\'s information theory (1948)', 'The transistor (1947)'],
    },
    {
      id: 'digital', title: 'The Digital & Computational Era', span: '1970–2000',
      essay: 'The microprocessor put computation everywhere. CAD, finite-element analysis and digital control transformed how engineers design and how machines behave. Software became an engineering discipline in its own right.',
      developments: ['The microprocessor and embedded control', 'Computer-aided design and finite-element analysis', 'Digital signal processing and fiber optics', 'Software engineering methodology'],
      turningPoints: ['The microprocessor (1971)', 'CAD/FEA becomes standard practice'],
    },
    {
      id: 'contemporary', title: 'Contemporary Engineering', span: '2000–present',
      essay: 'Engineering now spans renewable energy, autonomous systems, robotics, biotechnology and planetary-scale infrastructure. Data, machine learning and sustainability constraints reshape every discipline while the classical laws still set the limits.',
      developments: ['Renewable energy and grid-scale storage', 'Robotics, autonomy and machine learning', 'Additive manufacturing and advanced composites', 'Sustainable and resilient infrastructure'],
      turningPoints: ['Renewables reach cost parity with fossil power', 'Autonomous systems move from lab to road'],
    },
  ],

  laws: [
    {
      id: 'newton-2', category: 'Mechanics', name: 'Newton\'s Second Law',
      latex: '\\vec{F} = m\\,\\vec{a}',
      variables: [
        { sym: 'F', name: 'Net force', unit: 'N' },
        { sym: 'm', name: 'Mass', unit: 'kg' },
        { sym: 'a', name: 'Acceleration', unit: 'm/s²' },
      ],
      description: 'The net force on a body equals its mass times its acceleration — the foundation of dynamics and every motion analysis.',
      reference: 'https://en.wikipedia.org/wiki/Newton%27s_laws_of_motion',
    },
    {
      id: 'equilibrium', category: 'Statics', name: 'Static Equilibrium',
      latex: '\\sum \\vec{F} = 0,\\quad \\sum \\vec{M} = 0',
      variables: [
        { sym: 'F', name: 'Force', unit: 'N' },
        { sym: 'M', name: 'Moment', unit: 'N·m' },
      ],
      description: 'A structure at rest carries loads only if all forces and all moments sum to zero — the starting point of every structural analysis.',
      reference: 'https://en.wikipedia.org/wiki/Statics',
    },
    {
      id: 'bending', category: 'Structures', name: 'Flexure (Bending) Formula',
      latex: '\\sigma = \\dfrac{M\\,c}{I}',
      variables: [
        { sym: '\\sigma', name: 'Bending stress', unit: 'Pa' },
        { sym: 'M', name: 'Bending moment', unit: 'N·m' },
        { sym: 'c', name: 'Distance from neutral axis', unit: 'm' },
        { sym: 'I', name: 'Second moment of area', unit: 'm⁴' },
      ],
      description: 'The bending stress in a beam grows with the moment and with distance from the neutral axis, and falls with the section\'s stiffness.',
      reference: 'https://en.wikipedia.org/wiki/Bending',
    },
    {
      id: 'euler-buckling', category: 'Structures', name: 'Euler Buckling Load',
      latex: 'P_{cr} = \\dfrac{\\pi^2 EI}{(KL)^2}',
      variables: [
        { sym: 'P_{cr}', name: 'Critical buckling load', unit: 'N' },
        { sym: 'E', name: 'Elastic modulus', unit: 'Pa' },
        { sym: 'I', name: 'Second moment of area', unit: 'm⁴' },
        { sym: 'K', name: 'Effective-length factor' },
        { sym: 'L', name: 'Column length', unit: 'm' },
      ],
      description: 'The axial load at which a slender column suddenly bows and fails by buckling rather than crushing.',
      reference: 'https://en.wikipedia.org/wiki/Euler%27s_critical_load',
    },
    {
      id: 'hooke', category: 'Materials', name: 'Hooke\'s Law',
      latex: '\\sigma = E\\,\\varepsilon',
      variables: [
        { sym: '\\sigma', name: 'Stress', unit: 'Pa' },
        { sym: 'E', name: 'Young\'s modulus', unit: 'Pa' },
        { sym: '\\varepsilon', name: 'Strain' },
      ],
      description: 'Within the elastic range, stress is proportional to strain; the constant of proportionality is the material\'s stiffness.',
      reference: 'https://en.wikipedia.org/wiki/Hooke%27s_law',
    },
    {
      id: 'ohm', category: 'Electrical', name: 'Ohm\'s Law',
      latex: 'V = I\\,R',
      variables: [
        { sym: 'V', name: 'Voltage', unit: 'V' },
        { sym: 'I', name: 'Current', unit: 'A' },
        { sym: 'R', name: 'Resistance', unit: 'Ω' },
      ],
      description: 'The voltage across a resistor equals the current through it times its resistance — the most-used relation in electrical engineering.',
      reference: 'https://en.wikipedia.org/wiki/Ohm%27s_law',
    },
    {
      id: 'power', category: 'Electrical', name: 'Electrical Power',
      latex: 'P = VI = I^2 R',
      variables: [
        { sym: 'P', name: 'Power', unit: 'W' },
        { sym: 'V', name: 'Voltage', unit: 'V' },
        { sym: 'I', name: 'Current', unit: 'A' },
        { sym: 'R', name: 'Resistance', unit: 'Ω' },
      ],
      description: 'The power dissipated or delivered in a circuit element — the basis of sizing conductors, heat sinks and supplies.',
      reference: 'https://en.wikipedia.org/wiki/Electric_power',
    },
    {
      id: 'kirchhoff', category: 'Electrical', name: 'Kirchhoff\'s Current Law',
      latex: '\\sum_{k} I_k = 0',
      variables: [
        { sym: 'I_k', name: 'Branch current into a node', unit: 'A' },
      ],
      description: 'The currents entering any node sum to zero — charge is conserved. With the voltage law it lets you solve any linear network.',
      reference: 'https://en.wikipedia.org/wiki/Kirchhoff%27s_circuit_laws',
    },
    {
      id: 'pid', category: 'Control', name: 'PID Controller',
      latex: 'u(t) = K_p e(t) + K_i\\!\\int_0^t\\! e(\\tau)\\,d\\tau + K_d\\dfrac{de(t)}{dt}',
      variables: [
        { sym: 'u(t)', name: 'Control output' },
        { sym: 'e(t)', name: 'Error (setpoint − measurement)' },
        { sym: 'K_p', name: 'Proportional gain' },
        { sym: 'K_i', name: 'Integral gain' },
        { sym: 'K_d', name: 'Derivative gain' },
      ],
      description: 'The workhorse feedback controller: it responds to the present error, the accumulated past error and the predicted future error.',
      reference: 'https://en.wikipedia.org/wiki/Proportional%E2%80%93integral%E2%80%93derivative_controller',
    },
    {
      id: 'carnot-eff', category: 'Thermodynamics', name: 'Carnot Efficiency',
      latex: '\\eta = 1 - \\dfrac{T_C}{T_H}',
      variables: [
        { sym: '\\eta', name: 'Maximum efficiency' },
        { sym: 'T_C', name: 'Cold-reservoir temperature', unit: 'K' },
        { sym: 'T_H', name: 'Hot-reservoir temperature', unit: 'K' },
      ],
      description: 'The absolute upper limit on the efficiency of any heat engine, set only by the two reservoir temperatures.',
      reference: 'https://en.wikipedia.org/wiki/Carnot_cycle',
    },
    {
      id: 'first-law', category: 'Thermodynamics', name: 'First Law of Thermodynamics',
      latex: '\\Delta U = Q - W',
      variables: [
        { sym: '\\Delta U', name: 'Change in internal energy', unit: 'J' },
        { sym: 'Q', name: 'Heat added to system', unit: 'J' },
        { sym: 'W', name: 'Work done by system', unit: 'J' },
      ],
      description: 'Energy is conserved: the change in a system\'s internal energy equals heat in minus work out.',
      reference: 'https://en.wikipedia.org/wiki/First_law_of_thermodynamics',
    },
    {
      id: 'bernoulli', category: 'Fluids', name: 'Bernoulli\'s Equation',
      latex: 'P + \\tfrac{1}{2}\\rho v^2 + \\rho g h = \\text{const}',
      variables: [
        { sym: 'P', name: 'Static pressure', unit: 'Pa' },
        { sym: '\\rho', name: 'Fluid density', unit: 'kg/m³' },
        { sym: 'v', name: 'Flow speed', unit: 'm/s' },
        { sym: 'h', name: 'Elevation', unit: 'm' },
      ],
      description: 'Along a streamline of ideal flow, pressure, kinetic and potential energy trade off but their sum is conserved — the basis of lift and flow metering.',
      reference: 'https://en.wikipedia.org/wiki/Bernoulli%27s_principle',
    },
    {
      id: 'reynolds', category: 'Fluids', name: 'Reynolds Number',
      latex: 'Re = \\dfrac{\\rho v L}{\\mu}',
      variables: [
        { sym: 'Re', name: 'Reynolds number' },
        { sym: '\\rho', name: 'Density', unit: 'kg/m³' },
        { sym: 'v', name: 'Flow speed', unit: 'm/s' },
        { sym: 'L', name: 'Characteristic length', unit: 'm' },
        { sym: '\\mu', name: 'Dynamic viscosity', unit: 'Pa·s' },
      ],
      description: 'The dimensionless ratio of inertial to viscous forces that predicts whether flow is smooth (laminar) or chaotic (turbulent).',
      reference: 'https://en.wikipedia.org/wiki/Reynolds_number',
    },
    {
      id: 'axial-defl', category: 'Structures', name: 'Axial Deformation',
      latex: '\\delta = \\dfrac{PL}{AE}',
      variables: [
        { sym: '\\delta', name: 'Elongation', unit: 'm' },
        { sym: 'P', name: 'Axial load', unit: 'N' },
        { sym: 'L', name: 'Member length', unit: 'm' },
        { sym: 'A', name: 'Cross-sectional area', unit: 'm²' },
        { sym: 'E', name: 'Elastic modulus', unit: 'Pa' },
      ],
      description: 'How much a bar stretches under an axial load — longer and more heavily loaded members stretch more; stiffer, thicker ones less.',
      reference: 'https://en.wikipedia.org/wiki/Deformation_(engineering)',
    },
    {
      id: 'shannon-cap', category: 'Systems', name: 'Shannon–Hartley Channel Capacity',
      latex: 'C = B\\,\\log_2\\!\\left(1 + \\dfrac{S}{N}\\right)',
      variables: [
        { sym: 'C', name: 'Channel capacity', unit: 'bit/s' },
        { sym: 'B', name: 'Bandwidth', unit: 'Hz' },
        { sym: 'S/N', name: 'Signal-to-noise ratio' },
      ],
      description: 'The maximum error-free data rate of a communication channel given its bandwidth and noise — the ceiling all modems approach.',
      reference: 'https://en.wikipedia.org/wiki/Shannon%E2%80%93Hartley_theorem',
    },
    {
      id: 'safety-factor', category: 'Design', name: 'Factor of Safety',
      latex: 'FS = \\dfrac{\\sigma_{ult}}{\\sigma_{allow}}',
      variables: [
        { sym: 'FS', name: 'Factor of safety' },
        { sym: '\\sigma_{ult}', name: 'Ultimate (failure) stress', unit: 'Pa' },
        { sym: '\\sigma_{allow}', name: 'Allowable working stress', unit: 'Pa' },
      ],
      description: 'The margin between a component\'s failure strength and its working load — the number that absorbs uncertainty in loads and materials.',
      reference: 'https://en.wikipedia.org/wiki/Factor_of_safety',
    },
  ],

  tools: [
    { name: 'GNU Octave', org: 'GNU Project', url: 'https://octave.org/', desc: 'Free, MATLAB-compatible numerical computing environment for matrices, control, signals and simulation.', kind: 'software', access: 'Open' },
    { name: 'Scilab', org: 'Dassault Systèmes', url: 'https://www.scilab.org/', desc: 'Open-source platform for numerical computation with Xcos block-diagram modeling and control-system tools.', kind: 'software', access: 'Open' },
    { name: 'Fusion 360 (Personal)', org: 'Autodesk', url: 'https://www.autodesk.com/products/fusion-360/personal', desc: 'Cloud CAD/CAM/CAE with parametric modeling, simulation and toolpaths; free for hobby and educational use.', kind: 'software', access: 'Free' },
    { name: 'FreeCAD', org: 'FreeCAD Project', url: 'https://www.freecad.org/', desc: 'Open-source parametric 3D CAD modeler with FEM, sketching and technical-drawing workbenches.', kind: 'software', access: 'Open' },
    { name: 'KiCad', org: 'KiCad / CERN', url: 'https://www.kicad.org/', desc: 'Professional open-source EDA suite for schematic capture and printed-circuit-board layout.', kind: 'software', access: 'Open' },
    { name: 'Falstad Circuit Simulator', org: 'Paul Falstad', url: 'https://www.falstad.com/circuit/', desc: 'Interactive in-browser analog and digital circuit simulator that animates current and voltage.', kind: 'software', access: 'Open' },
    { name: 'CircuitJS / LushProjects', org: 'Iain Sharp', url: 'https://lushprojects.com/circuitjs/', desc: 'Maintained web build of the classic circuit simulator with sharable circuit links.', kind: 'software', access: 'Open' },
    { name: 'Wolfram Alpha', org: 'Wolfram Research', url: 'https://www.wolframalpha.com/', desc: 'Computational knowledge engine for symbolic math, unit conversions, beam and circuit calculations.', kind: 'api', access: 'Freemium' },
    { name: 'Engineering ToolBox', org: 'Engineering ToolBox', url: 'https://www.engineeringtoolbox.com/', desc: 'Vast free reference of material properties, formulas and design data for mechanical, civil and thermal work.', kind: 'dataset', access: 'Open' },
    { name: 'MatWeb Material Property Data', org: 'MatWeb', url: 'https://www.matweb.com/', desc: 'Searchable database of metals, polymers, ceramics and composites with mechanical and thermal properties.', kind: 'dataset', access: 'Free' },
    { name: 'SciPy & NumPy', org: 'SciPy community', url: 'https://scipy.org/', desc: 'Python libraries for linear algebra, signal processing, optimization and control-system design.', kind: 'software', access: 'Open' },
    { name: 'python-control', org: 'Python Control community', url: 'https://python-control.readthedocs.io/', desc: 'Open-source library for feedback control analysis: transfer functions, state space, Bode and root-locus plots.', kind: 'software', access: 'Open' },
    { name: 'OpenFOAM', org: 'The OpenFOAM Foundation', url: 'https://www.openfoam.com/', desc: 'Open-source computational fluid dynamics toolbox for aerodynamics, heat transfer and multiphase flow.', kind: 'software', access: 'Open' },
    { name: 'Tinkercad Circuits', org: 'Autodesk', url: 'https://www.tinkercad.com/circuits', desc: 'Browser-based Arduino and breadboard circuit simulator, ideal for prototyping and teaching electronics.', kind: 'software', access: 'Free' },
  ],
};

export default DATA;
