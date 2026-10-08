import type { Connection, ConnectionKind, ConnectionTarget } from './connectionTypes';

// Cross-curricular connections authored from the humanities, arts, sport and economics side.
// Compact form: c('course:lesson', target, kind, why) where target is 'course:lesson', 'sim:id' or 'labs:id'.
const lesson = (s: string) => {
  const i = s.indexOf(':');
  return { courseId: s.slice(0, i), lessonId: s.slice(i + 1) };
};
const c = (from: string, to: string, kind: ConnectionKind, why: string): Connection => {
  let target: ConnectionTarget;
  if (to.startsWith('sim:')) target = { sim: to.slice(4) };
  else if (to.startsWith('labs:')) target = { labs: to.slice(5) };
  else target = lesson(to);
  return { from: lesson(from), to: target, kind, why };
};

export const CONNECTIONS_HUMANITIES: Connection[] = [
  // ---- World history (lab-history) ----
  c('lab-history:lab-history.l01', 'lab-biology:lab-biology.l07', 'science-behind', 'Early farmers selected crops and animals for useful inherited traits, which is selection acting on heritable variation.'),
  c('lab-history:lab-history.l04', 'philosophy-school:ph-arg-2', 'same-idea', 'Classical Athens is the setting of Socrates, whose trial and method of questioning grew out of that city\'s public life.'),
  c('lab-history:lab-history.l05', 'world-religions:world-religions.l03', 'history-of', 'The Mauryan emperor Ashoka supported the Buddhist community and sent teachers abroad, which helped Buddhism spread across Asia.'),
  c('lab-history:lab-history.l08', 'world-religions:world-religions.l09', 'history-of', 'The rise of Islam and the caliphates reshaped the post-Roman world, and Islam\'s revelation and practice are the faith behind that history.'),
  c('lab-history:lab-history.l10', 'lab-archaeology:lab-archaeology.l13', 'same-idea', 'African states such as Great Zimbabwe are known largely through excavation and survey of their stone and urban remains.'),
  c('lab-history:lab-history.l11', 'lab-astronomy:lab-astronomy.l01', 'history-of', 'The printing press let new ideas, including Copernicus\'s heliocentric model, circulate among scholars faster than manuscripts could.'),
  c('lab-history:lab-history.l12', 'lab-earth:lab-earth.l10', 'science-behind', 'Sailing routes across the oceans depended on prevailing winds and ocean currents, which are driven by the circulation Earth science describes.'),
  c('lab-history:lab-history.l14', 'lab-engineering:lab-engineering.l07', 'science-behind', 'Industrial steam power was the practical problem that thermodynamics grew up to explain, linking the engine to the first law of energy conservation.'),

  // ---- History quest (hq-quest) ----
  c('hq-quest:hq-quest.l02', 'lab-archaeology:lab-archaeology.l12', 'same-idea', 'Our knowledge of the ancient ages rests on excavated cities such as Giza and Pompeii, read as evidence alongside written sources.'),
  c('hq-quest:hq-quest.l04', 'lab-engineering:lab-engineering.l07', 'science-behind', 'The industrial revolution was powered by heat engines, and thermodynamics is the science that explains how they turn heat into work.'),
  c('hq-quest:hq-quest.l09', 'thinking-methods:thinking-methods.l11', 'same-idea', 'Both build a conclusion from stated evidence and the reasoning that links the evidence to the claim.'),
  c('hq-quest:hq-quest.l11', 'thinking-methods:thinking-methods.l09', 'same-idea', 'Both warn that two things occurring together does not prove one caused the other, so causes must be argued from evidence.'),

  // ---- Archaeology (lab-archaeology) ----
  c('lab-archaeology:lab-archaeology.l04', 'lab-earth:lab-earth.l01', 'same-idea', 'Both rely on superposition: in undisturbed layers the lower deposits are older than the ones above them.'),
  c('lab-archaeology:lab-archaeology.l06', 'sim:wave', 'science-behind', 'Remote sensing methods such as ground-penetrating radar send waves into the ground and read what reflects back.'),
  c('lab-archaeology:lab-archaeology.l07', 'lab-chemistry:lab-chemistry.l14', 'science-behind', 'Analysing finds in the laboratory uses light and X-rays to identify the elements and compounds in materials.'),
  c('lab-archaeology:lab-archaeology.l08', 'lab-earth:lab-earth.l12', 'science-behind', 'Radiocarbon dating works because carbon-14 moves through the same carbon cycle that exchanges carbon among air, oceans and living things.'),
  c('lab-archaeology:lab-archaeology.l09', 'lab-earth:lab-earth.l03', 'science-behind', 'Dating methods beyond radiocarbon use the steady decay of radioactive isotopes, the principle behind radiometric dating of rocks.'),
  c('lab-archaeology:lab-archaeology.l10', 'lab-biology:lab-biology.l05', 'same-idea', 'Fossils and tools from sites like Olduvai are the physical evidence for human evolution by natural selection.'),
  c('lab-archaeology:lab-archaeology.l12', 'lab-earth:lab-earth.l07', 'science-behind', 'Pompeii was buried by the eruption of Vesuvius, a volcanic event whose magma and ash behaviour volcanology explains.'),
  c('lab-archaeology:lab-archaeology.l03', 'lab-history:lab-history.l03', 'same-idea', 'Tutankhamun\'s tomb is archaeological evidence for the Egyptian state and its beliefs surveyed in the history of Egypt.'),

  // ---- Civics and founding documents ----
  c('civics-hall:civ-found-2', 'philosophy-school:ph-hist-2', 'same-idea', 'Locke\'s argument about consent and natural rights is part of the liberal tradition of liberty that Mill later developed.'),
  c('civics-hall:civ-found-4', 'thinking-methods:thinking-methods.l17', 'same-idea', 'The Declaration is laid out as a deductive argument from stated principles to a conclusion, the kind of reasoning classified there.'),
  c('civics-hall:civ-comp-method', 'thinking-methods:thinking-methods.l04', 'same-idea', 'A fair comparison, like a fair test, holds the basis of comparison constant so differences can be attributed honestly.'),
  c('founding-documents:founding-documents.l02', 'philosophy-school:ph-hist-2', 'same-idea', 'Locke\'s theory of government by consent belongs to the same tradition of liberty that Mill later reworked.'),

  // ---- Philosophy ----
  c('philosophy-school:ph-arg-1', 'thinking-methods:thinking-methods.l18', 'same-idea', 'Both teach how to spot common fallacies, the patterns of bad reasoning that look persuasive.'),
  c('philosophy-school:ph-arg-2', 'thinking-methods:thinking-methods.l17', 'same-idea', 'Socrates\' method of probing questions is the Socratic style of reasoning named there.'),
  c('philosophy-school:ph-arg-3', 'lab-mathematics:lab-mathematics.l01', 'same-idea', 'Formal logic makes validity mechanical, and a mathematical proof is judged by the same valid steps from premises to conclusion.'),
  c('philosophy-school:ph-hist-1', 'thinking-methods:thinking-methods.l17', 'same-idea', 'Hume\'s problem of induction concerns exactly the inductive reasoning that science depends on.'),

  // ---- World religions (even-handed: history, art, music, archaeology) ----
  c('world-religions:world-religions.l03', 'lab-history:lab-history.l05', 'history-of', 'Buddhism\'s spread across Asia was helped by the Mauryan emperor Ashoka, who supported the community and sent teachers abroad.'),
  c('world-religions:world-religions.l07', 'lab-history:lab-history.l07', 'history-of', 'Christianity began and spread within the Roman Empire, so its early story is also part of the history of Rome.'),
  c('world-religions:world-religions.l08', 'lab-architecture:lab-architecture.l05', 'art-of', 'Christian worship shaped the church building, from Romanesque churches to the Gothic cathedral.'),
  c('world-religions:world-religions.l08', 'art-masters:art-masters.l02', 'art-of', 'Christian subjects inspired major Renaissance art such as the work of Michelangelo and Raphael.'),
  c('world-religions:world-religions.l08', 'chora-history:harm-01', 'art-of', 'Plainchant, a single line of unaccompanied melody, grew out of Christian liturgy and began the history of Western harmony.'),
  c('world-religions:world-religions.l09', 'lab-history:lab-history.l08', 'history-of', 'Islam\'s revelation and its early expansion are part of the history of the world after Rome.'),
  c('world-religions:world-religions.l12', 'labs:astronomy', 'science-behind', 'Religious calendars, whether lunar, solar or lunisolar, are built on the motions of the Moon and Sun that astronomy measures.'),

  // ---- Art masters ----
  c('art-masters:art-masters.l01', 'photo-art-school:ad-4', 'math-behind', 'Leonardo studied linear perspective, the geometric system for drawing a three-dimensional scene on a flat surface.'),
  c('art-masters:art-masters.l03', 'photo-art-school:pl-6', 'same-idea', 'Caravaggio\'s tenebrism is a dramatic form of chiaroscuro, the strong contrast of light and dark that photographers also use.'),
  c('art-masters:art-masters.l04', 'photo-art-school:px-1', 'science-behind', 'Some scholars think Vermeer may have used a camera obscura, the same optical principle at the root of photography.'),
  c('art-masters:art-masters.l04', 'photo-art-school:ac-4', 'science-behind', 'Painters of the period depended on expensive pigments such as ultramarine, which was ground from lapis lazuli and priced above gold.'),
  c('art-masters:art-masters.l06', 'photo-art-school:ac-4', 'science-behind', 'Hokusai\'s blues relied on Prussian blue, an imported synthetic pigment, a case study in how chemistry and trade shaped colour.'),
  c('art-masters:art-masters.l07', 'photo-art-school:pl-2', 'same-idea', 'Monet painted the same subject at different hours to record how natural light and colour change through the day.'),
  c('art-masters:art-masters.l08', 'photo-art-school:ac-2', 'same-idea', 'Van Gogh\'s paired blues and oranges are an example of the complementary colour harmonies set out on the colour wheel.'),

  // ---- Architecture ----
  c('lab-architecture:lab-architecture.l03', 'lab-engineering:lab-engineering.l03', 'science-behind', 'An arch carries load mainly in compression, the axial deformation that engineers analyse in stone and concrete.'),
  c('lab-architecture:lab-architecture.l05', 'lab-engineering:lab-engineering.l01', 'science-behind', 'Gothic pointed arches and flying buttresses direct thrust so that the forces on a building balance, which is static equilibrium.'),
  c('lab-architecture:lab-architecture.l06', 'photo-art-school:ad-4', 'math-behind', 'Renaissance architects and painters shared the mathematics of linear perspective in planning and depicting space.'),
  c('lab-architecture:lab-architecture.l08', 'lab-engineering:lab-engineering.l04', 'science-behind', 'Iron and steel frames made tall buildings possible because their beams resist bending, which engineering analysis predicts.'),
  c('lab-architecture:lab-architecture.l09', 'lab-engineering:lab-engineering.l01', 'science-behind', 'Gaudi\'s hanging-chain models turn static equilibrium into a design method, since a hung chain finds the shape of an ideal arch.'),
  c('lab-architecture:lab-architecture.l13', 'lab-cs:lab-cs.l01', 'application', 'Parametric design describes a building with rules and parameters that an algorithm turns into form.'),
  c('lab-architecture:lab-architecture.l14', 'sim:beam', 'science-behind', 'How structures carry load can be explored directly by changing loads and supports on a beam and watching the response.'),
  c('lab-architecture:lab-architecture.l14', 'lab-engineering:lab-engineering.l05', 'science-behind', 'Slender columns and walls can fail by buckling before the material crushes, a limit that shapes how structures are proportioned.'),

  // ---- Film history ----
  c('film-history:film-history.l01', 'photo-art-school:pl-6', 'same-idea', 'Expressionist cinema used stark contrast between light and shadow, the chiaroscuro that painters and photographers also use for mood.'),
  c('film-history:film-history.l02', 'photo-art-school:px-2', 'science-behind', 'Citizen Kane\'s deep focus depends on small apertures and strong light, which determine how much of a scene is in focus.'),
  c('film-history:film-history.l11', 'photo-art-school:px-3', 'science-behind', 'Christopher Doyle\'s blurred motion for Wong Kar-wai comes from the choice of shutter speed and the way it renders time.'),

  // ---- Film school ----
  c('film-school:fs-cine-2', 'photo-art-school:px-6', 'science-behind', 'Focal length determines field of view and how perspective and distance look, in a film frame or a still.'),
  c('film-school:fs-cine-5', 'photo-art-school:pk-3', 'science-behind', 'Colour temperature and mixed light are treated the same way in grading a film and balancing a photograph.'),
  c('film-school:fs-dir-3', 'photo-art-school:ad-4', 'math-behind', 'Composition and perspective in a frame rely on the geometry of how three-dimensional space projects onto a flat image.'),
  c('film-school:fs-sound-1', 'lab-physics:lab-physics.l05', 'science-behind', 'Dialogue, effects and music are all sound waves, with frequency, amplitude and interference.'),
  c('film-school:fs-edit-4', 'chora-history:rhy-01', 'same-idea', 'Pace in an edit and metre in music both organise events in time with pulse, accent and expectation.'),
  c('film-school:fs-prod-5', 'chora-history:law-07', 'same-idea', 'Clearing material for a film and clearing a sample for a track both turn on copyright and what has entered the public domain.'),

  // ---- Photography and art school ----
  c('photo-art-school:px-1', 'lab-chemistry:lab-chemistry.l12', 'science-behind', 'Traditional photographic film forms an image through redox reactions that reduce silver compounds where light struck.'),
  c('photo-art-school:px-2', 'sim:wave', 'science-behind', 'At very small apertures light diffracts, a wave effect that limits sharpness in a lens.'),
  c('photo-art-school:pl-1', 'lab-physics:lab-physics.l09', 'science-behind', 'The properties of light a photographer works with follow from Maxwell\'s account of light as an electromagnetic wave.'),
  c('photo-art-school:pk-3', 'lab-astronomy:lab-astronomy.l05', 'science-behind', 'Colour temperature describes the colour of a glowing body, and a star\'s colour likewise depends on its surface temperature.'),
  c('photo-art-school:ac-3', 'labs:neuroscience', 'science-behind', 'Simultaneous contrast arises because the visual system judges a colour by its surroundings, a topic of neuroscience.'),
  c('photo-art-school:ac-4', 'labs:chemistry', 'science-behind', 'Pigments are chemical compounds, and their colour, stability and cost come from their composition.'),
  c('photo-art-school:ac-4', 'econ-school:ec-mkt-1', 'same-idea', 'The price of ultramarine, ground from distant lapis lazuli and dearer than gold, shows how scarce supply and strong demand set a price.'),
  c('photo-art-school:ad-4', 'lab-mathematics:lab-mathematics.l09', 'math-behind', 'Perspective drawing led to projective geometry, the branch of geometry that studies how shapes project onto a plane.'),
  c('photo-art-school:ah-1', 'lab-archaeology:lab-archaeology.l08', 'science-behind', 'Dating prehistoric and ancient art often relies on radiocarbon measurements of the organic material used.'),
  c('photo-art-school:pg-4', 'hq-quest:hq-quest.l08', 'same-idea', 'Documentary photographs are primary sources, and historians weigh them like other first-hand evidence.'),
  c('photo-art-school:pb-1', 'chora-history:law-02', 'same-idea', 'Both explain how creators hold copyright in their own work and how that right is separate from owning a copy of it.'),
  c('photo-art-school:pb-2', 'money-school:fl-biz-3', 'application', 'Pricing creative work comes down to unit economics: the cost of making one unit set against what it earns.'),

  // ---- Music ----
  c('music-theory:music-theory.l02', 'sim:function-plotter', 'math-behind', 'Equal temperament places each semitone at a frequency ratio of 2 to the power 1/12, an exponential curve that can be plotted.'),
  c('music-theory:music-theory.l08', 'sim:wave', 'science-behind', 'The octave 2:1 and the fifth 3:2 are frequency ratios of waves, which can be seen by adding waves of related frequencies.'),
  c('music-theory:music-theory.l08', 'lab-physics:lab-physics.l05', 'science-behind', 'Pitch is the frequency of a vibration, so musical intervals are ratios of wave frequencies.'),
  c('music-figures:music-figures.l02', 'music-theory:music-theory.l08', 'math-behind', 'The tuning compromise that let Bach play in every key is a question of how frequency ratios such as the fifth are adjusted.'),
  c('music-figures:music-figures.l05', 'lab-history:lab-history.l13', 'history-of', 'Beethoven worked in the age of revolutions, whose ideals of liberty and change shaped the era he composed in.'),
  c('music-figures:music-figures.l11', 'lab-physics:lab-physics.l09', 'science-behind', 'The electric guitar works by electromagnetic induction, where vibrating steel strings induce a signal in a pickup coil.'),
  c('music-figures:music-figures.l13', 'lab-engineering:lab-engineering.l12', 'science-behind', 'Hendrix\'s use of amplifier feedback is a loop in which output returns to the input, the central idea of feedback control.'),
  c('chora-history:rec-01', 'lab-physics:lab-physics.l05', 'science-behind', 'Early recording turned sound waves into the motion of a diaphragm and stylus, so it depends on the physics of waves.'),
  c('chora-history:rec-04', 'lab-physics:lab-physics.l09', 'science-behind', 'Magnetic tape recording stores sound as a magnetic pattern written and read by electromagnetic heads.'),
  c('chora-history:rec-07', 'lab-networks:lab-networks.l04', 'science-behind', 'Digital audio sampling rates follow from the Nyquist result that a signal must be sampled at more than twice its highest frequency.'),
  c('chora-history:harm-05', 'music-theory:music-theory.l08', 'math-behind', 'Temperament is the adjustment of pure frequency ratios such as the fifth so that all twelve keys are usable.'),

  // ---- Theatre, comics ----
  c('theatre-scripts:theatre-scripts.l05', 'lab-history:lab-history.l04', 'history-of', 'Greek tragedy arose in classical Athens and is part of the civic and religious life of ancient Greece.'),
  c('comic-history:comic-history.l10', 'art-masters:art-masters.l06', 'history-of', 'Hokusai\'s sketchbooks, which he called manga, are an early root of the form that became modern manga.'),
  c('comic-history:comic-history.l02', 'film-school:fs-edit-3', 'same-idea', 'The gutter between comic panels and the cut between film shots both ask the audience to connect separate images into one meaning.'),

  // ---- Sport and combat ----
  c('sports-history:sports-history.l02', 'lab-history:lab-history.l14', 'history-of', 'The Second World War cancelled the 1942 and 1946 tournaments, a gap in the World Cup that is part of the history of the war.'),
  c('sports-history:sports-history.l09', 'sim:projectile', 'science-behind', 'A kicked ball in flight follows projectile motion, whose range and height depend on launch speed and angle.'),
  c('sports-history:sports-history.l09', 'lab-data:lab-data.l01', 'math-behind', 'Penalty shootouts are decided by chance as well as skill, which probability can describe.'),
  c('lab-combat:lab-combat.l01', 'lab-history:lab-history.l03', 'history-of', 'Tahtib is pictured on ancient Egyptian walls, which ties the martial art to the history of Egypt.'),
  c('lab-combat:lab-combat.l05', 'lab-history:lab-history.l12', 'history-of', 'Capoeira developed in Brazil among people brought across the Atlantic, a movement of people that connected the world\'s oceans.'),
  c('lab-combat:lab-combat.l06', 'world-religions:world-religions.l03', 'history-of', 'Shaolin martial practice is tied to Chan, a school of Buddhism, so its story is part of the spread of Buddhism in China.'),
  c('lab-combat:lab-combat.l08', 'lab-physics:lab-physics.l01', 'science-behind', 'Judo throws use Newton\'s laws: unbalancing an opponent and applying force and leverage change their motion.'),
  c('lab-combat:lab-combat.l09', 'lab-physics:lab-physics.l03', 'science-behind', 'A karate strike delivers kinetic energy, and speed raises that energy faster than mass does.'),
  c('lab-combat:lab-combat.l11', 'lab-history:lab-history.l04', 'history-of', 'Pankration was a contest of the ancient Greek Games at Olympia and belongs to the history of Greece.'),
  c('lab-combat:lab-combat.l13', 'hq-quest:hq-quest.l08', 'same-idea', 'A fight book such as Fiore\'s is a primary source, to be read with the same care as other first-hand documents.'),

  // ---- Economics, money, real estate, entrepreneurship ----
  c('money-school:fl-save-2', 'sim:function-plotter', 'math-behind', 'Compound interest is exponential growth, which can be plotted and compared against linear growth.'),
  c('money-school:fl-save-3', 'lab-data:lab-data.l01', 'math-behind', 'Investment risk and diversification are described with probability and expected outcomes.'),
  c('money-school:fl-risk-1', 'lab-data:lab-data.l03', 'math-behind', 'Insurance works because pooling many independent risks makes the average loss predictable, as the central limit theorem describes.'),
  c('money-school:fl-credit-2', 'lab-data:lab-data.l09', 'application', 'Credit scoring commonly uses logistic regression to turn many inputs into a probability of default.'),
  c('money-school:fl-risk-2', 'lab-cs:lab-cs.l10', 'application', 'Protecting identity and money online relies on cryptography, which proves who is on the other end of a message.'),
  c('money-school:fl-spend-1', 'econ-school:ec-scar-1', 'same-idea', 'Choosing between needs and wants is the opportunity cost of scarcity applied to a household.'),
  c('econ-school:ec-scar-2', 'lab-mathematics:lab-mathematics.l10', 'math-behind', 'Marginal analysis is the economic form of the derivative, the rate of change from one more unit.'),
  c('econ-school:ec-mkt-1', 'sim:function-plotter', 'math-behind', 'Supply and demand are curves, and the market price is where they intersect, which can be plotted.'),
  c('econ-school:ec-money-1', 'lab-history:lab-history.l02', 'history-of', 'Early records of debt, grain and silver in Mesopotamia are among the first evidence for money and accounts.'),
  c('econ-school:ec-money-2', 'lab-engineering:lab-engineering.l12', 'same-idea', 'A central bank adjusting interest rates in response to inflation is a feedback loop, like a thermostat in control engineering.'),
  c('econ-school:ec-data-1', 'thinking-methods:thinking-methods.l09', 'same-idea', 'Both show that two series moving together does not prove one causes the other, because a hidden variable may drive both.'),
  c('econ-school:ec-data-1', 'lab-data:lab-data.l06', 'math-behind', 'Correlation measures how two variables move together, and the first step is to look at the data.'),
  c('econ-school:ec-sys-2', 'lab-environment:lab-environment.l07', 'same-idea', 'Climate change is a standard example of a market failure, where the costs of emissions fall on people who did not choose them.'),
  c('real-estate-school:re-val-1', 'lab-data:lab-data.l07', 'math-behind', 'Comparable sales are adjusted for differences in features, which regression models formalise as a relationship between price and attributes.'),
  c('real-estate-school:re-val-1', 'thinking-methods:thinking-methods.l08', 'math-behind', 'Appraisers use the median and test for outliers when comparing sales, which is the logic of the mean, median and outliers.'),
  c('real-estate-school:re-prop-2', 'money-school:fl-spend-3', 'application', 'Renting versus owning is one of the big housing decisions in a household budget.'),
  c('real-estate-school:re-agency-2', 'money-school:fl-credit-1', 'application', 'The Loan Estimate lays out the full cost of borrowing, which is also what the true cost of credit means.'),
  c('real-estate-school:re-mkt-2', 'econ-school:ec-sys-2', 'same-idea', 'Housing policy is a response to market failures, a case of when governments step in and when that works.'),
  c('young-entrepreneurs:ye-35-5', 'thinking-methods:thinking-methods.l05', 'same-idea', 'Asking customers what they want is a survey, and more answers from a fair sample make the result more reliable.'),
  c('young-entrepreneurs:ye-68-1', 'money-school:fl-biz-3', 'same-idea', 'Both break a business down to the cost and revenue of a single unit to see whether it earns money.'),
  c('young-entrepreneurs:ye-912-1', 'sim:function-plotter', 'math-behind', 'Break-even is the point where a cost line and a revenue line intersect, which can be plotted.'),
  c('young-entrepreneurs:ye-912-3', 'sim:population', 'math-behind', 'Compound growth in money and growth of a population share the same exponential model.'),
];
