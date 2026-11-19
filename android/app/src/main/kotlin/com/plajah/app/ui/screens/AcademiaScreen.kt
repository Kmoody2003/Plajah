package com.plajah.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.plajah.app.ui.foldable.rememberFoldableInfo
import com.plajah.app.ui.theme.PlajahBrand

private val AcademiaInk = Color(0xFF070712)

private data class GradeBand(val id: String, val label: String)

private val GradeBands = listOf(
    GradeBand("prek", "PreK–2"),
    GradeBand("el", "3–5"),
    GradeBand("ms", "6–8"),
    GradeBand("hs", "9–12"),
    GradeBand("col", "College"),
    GradeBand("pro", "Professional"),
)

private data class FlagshipSchool(
    val id: String,
    val title: String,
    val emoji: String,
    val accent: Color,
    val deep: Color,
    val badge: String,
    val tags: List<String>,
    val ladder: List<String>,
    val webView: String,
    val byBand: Map<String, String>,
)

private val FlagshipSchools = listOf(
    FlagshipSchool(
        id = "BUSINESS_SCHOOL",
        title = "The Business School",
        emoji = "🚀",
        accent = Color(0xFF8B5CF6),
        deep = Color(0xFF2A1650),
        badge = "Praxis · LIVE NOW",
        tags = listOf("Simulator", "Real launch"),
        ladder = listOf("Spark", "Validate", "Form", "Books", "Operate", "Fund", "Grow"),
        webView = "BUSINESS_SCHOOL",
        byBand = mapOf(
            "prek" to "Run the class store — earn, count, and share. Business as play.",
            "el" to "Your first lemonade-stand venture: price it, cost it, count the profit.",
            "ms" to "Build a venture with a real P&L — and learn why margin beats revenue.",
            "hs" to "The full Praxis journey: form an entity, keep books, fund and grow — for real or simulated.",
            "col" to "Launch an actual business page: EIN, entity choice, compliance calendar, capital ladder.",
            "pro" to "Operate with your own double-entry books, unit economics, and a coached raise — Aria watching your deadlines.",
        ),
    ),
    FlagshipSchool(
        id = "MONEY_SCHOOL",
        title = "School of Money",
        emoji = "💰",
        accent = Color(0xFFF59E0B),
        deep = Color(0xFF4A2B00),
        badge = "Financial Literacy · LIVE NOW",
        tags = listOf("FDIC + CFPB spine", "30-state ready"),
        ladder = listOf("Earn", "Spend", "Save", "Credit", "Risk", "CFO"),
        webView = "MONEY_SCHOOL",
        byBand = mapOf(
            "prek" to "Coins, choices, and waiting for what you want — money habits start here.",
            "el" to "Budget your allowance, set a goal, watch saving grow.",
            "ms" to "Credit, compound interest, and your first practice portfolio.",
            "hs" to "The state-mandate course, done right: credit scores, investing, insurance, taxes — every standard tagged.",
            "col" to "Adult money mastery: renting to owning, debt strategy, investing — education, never sales.",
            "pro" to "The CFO ladder: small-business books → accounting → corporate finance → cost of capital on your own venture.",
        ),
    ),
    FlagshipSchool(
        id = "REAL_ESTATE_SCHOOL",
        title = "Real Estate School",
        emoji = "🏘️",
        accent = Color(0xFF06D6A0),
        deep = Color(0xFF0A3D30),
        badge = "Terra-powered · LIVE NOW",
        tags = listOf("Real Detroit parcels", "Open licensure track"),
        ladder = listOf("Adopt a Parcel", "First Home", "License", "Pro Forma", "Capital Markets"),
        webView = "REAL_ESTATE_SCHOOL",
        byBand = mapOf(
            "prek" to "What is a home? Who owns the park? Property as neighbourhood.",
            "el" to "Adopt a real Detroit parcel — its size, its value, its story, on a live map.",
            "ms" to "What makes a house worth money? Play the comps game on real sales.",
            "hs" to "The whole homebuying journey with the government's own toolkit — then a real Loan Estimate at today's rates.",
            "col" to "Underwrite an actual building: multi-year pro forma, real taxes, real rents, defend buy or pass.",
            "pro" to "Capital markets, REITs and securitisation — and a site assembly in a real corridor with live zoning.",
        ),
    ),
    FlagshipSchool(
        id = "CIVICS_HALL",
        title = "Civics Hall",
        emoji = "🏛️",
        accent = Color(0xFFD40055),
        deep = Color(0xFF3D0018),
        badge = "The Long Argument of Liberty · LIVE NOW",
        tags = listOf("Primary sources", "7 nations"),
        ladder = listOf("Foundations", "Structure", "Rights", "Action", "Living Constitution"),
        webView = "CIVICS_HALL",
        byBand = mapOf(
            "prek" to "Rules we make together — a class constitution everyone signs.",
            "el" to "Magna Carta as a story, three branches as a game, one amendment a week.",
            "ms" to "Read Locke and Montesquieu for yourself (in plain English) — then hold a mock trial.",
            "hs" to "The full canon, 1215→1791: the writings that formed America before America — and the Federalist debates verbatim.",
            "col" to "Clause-by-clause with the case law; read the world's constitutions side-by-side.",
            "pro" to "Comparative government: seven nations' founding texts — what they promise, and how it's kept.",
        ),
    ),
    FlagshipSchool(
        id = "ECON_SCHOOL",
        title = "School of Economics",
        emoji = "📈",
        accent = Color(0xFF3B82F6),
        deep = Color(0xFF0F2246),
        badge = "Live-data powered · LIVE NOW",
        tags = listOf("Real Fed data", "AP-aligned"),
        ladder = listOf("Choice", "Markets", "Macro", "The Fed", "Data"),
        webView = "ECON_SCHOOL",
        byBand = mapOf(
            "prek" to "Goods, services, and why we can't have everything — scarcity as a game.",
            "el" to "Graph a real price over time. Yes, a real one, from the Fed's own data.",
            "ms" to "Supply and demand with your own venture's prices — plus this month's actual inflation, live.",
            "hs" to "AP Micro & Macro with real data labs: replay 2008 and 2020 from the actual series.",
            "col" to "The modern principles sequence — hosted open texts plus the most current open economics in the world.",
            "pro" to "Graduate lectures and empirical projects on live data; publish your analysis to the Findings layer.",
        ),
    ),
    FlagshipSchool(
        id = "PHILOSOPHY_SCHOOL",
        title = "School of Philosophy",
        emoji = "🦉",
        accent = Color(0xFFA78BFA),
        deep = Color(0xFF2A1650),
        badge = "The Examined Life · LIVE NOW",
        tags = listOf("Age 4 → seminar", "Ethics Bowl"),
        ladder = listOf("Wonder", "Inquiry", "Logic", "Ethics", "History"),
        webView = "PHILOSOPHY_SCHOOL",
        byBand = mapOf(
            "prek" to "Wonder circles: is it ever OK to break a rule? Could a robot be your friend?",
            "el" to "The question of the week — argued kindly, with reasons.",
            "ms" to "Spot the fallacy; stage Socrates' trial as a play, from the actual dialogue.",
            "hs" to "Ethics Bowl cases, formal logic proofs, and the moderns in readable English.",
            "col" to "The full history sequence — Ancient to nineteenth century — from the original texts.",
            "pro" to "Branch seminars: epistemology, political philosophy (shared with Civics Hall), advanced logic.",
        ),
    ),
    FlagshipSchool(
        id = "JOURNALISM_SCHOOL",
        title = "School of Journalism",
        emoji = "📰",
        accent = Color(0xFFE8553E),
        deep = Color(0xFF3A1209),
        badge = "Notice · Ask · Verify · Publish · LIVE NOW",
        tags = listOf("PreK → J-School", "Student Newsroom"),
        ladder = listOf("Notice", "Cub", "Newsroom", "Press", "J-School", "Distribute"),
        webView = "JOURNALISM_SCHOOL",
        byBand = mapOf(
            "prek" to "Picture News: draw what happened, say who and what — and 'how do you know?'",
            "el" to "News vs opinion vs ad, the 5 Ws, a first interview, and issue one of the class paper.",
            "ms" to "Inverted pyramid, exact quotes, honest headlines, and lateral reading like a fact-checker.",
            "hs" to "Beats, the SPJ code, student press law, data stories, broadcast and editorials.",
            "col" to "Public records, investigations, libel law and press history from primary sources.",
            "pro" to "Graduate to the Journalist Desk: publish under your byline with full syndication.",
        ),
    ),
    FlagshipSchool(
        id = "ART_COLLEGE",
        title = "Art College",
        emoji = "🎨",
        accent = Color(0xFFE5B94E),
        deep = Color(0xFF2A210A),
        badge = "BFA · BA · Studio & Critique · LIVE NOW",
        tags = listOf("10 programs · 53 courses", "Live museum study"),
        ladder = listOf("Foundation", "Studio", "Design", "History", "Critique", "Thesis"),
        webView = "ART_COLLEGE",
        byBand = mapOf(
            "prek" to "Draw, mix colour, make shapes — start in Art & Design and the Photography & Art School.",
            "el" to "Observational drawing and colour through the Photography & Art School and the museum halls.",
            "ms" to "Composition, art history and photography strands, with real museum objects to study.",
            "hs" to "Portfolio building: the Art College Foundation Certificate is open to advanced and dual-enrolled students.",
            "col" to "Four-year BFA in graphic design, painting, sculpture, illustration and fashion — and a BA in art history.",
            "pro" to "Portfolio reviews, thesis exhibition, and the business of making a living from art.",
        ),
    ),
    FlagshipSchool(
        id = "CHORA_CONSERVATORY",
        title = "Music Conservatory",
        emoji = "🎼",
        accent = Color(0xFF00DAF3),
        deep = Color(0xFF04324A),
        badge = "Chora Conservatory · LIVE NOW",
        tags = listOf("6 curriculum tracks", "Ear training"),
        ladder = listOf("Hall", "History", "Theory", "Instruments", "Repertoire", "Produce"),
        webView = "CHORA_CONSERVATORY",
        byBand = mapOf(
            "prek" to "Clap the beat, find the pattern — rhythm play.",
            "el" to "First notes, first melodies — theory through games, not worksheets.",
            "ms" to "Scales, chords and song form — then build a beat in the studio yourself.",
            "hs" to "Compose and produce in a real in-browser studio: instruments, arrangement, mixing.",
            "col" to "Harmony, orchestration, production technique — release your work to a real audience.",
            "pro" to "The full studio craft: mastering, spatial audio, publishing — the conservatory that ships records.",
        ),
    ),
    FlagshipSchool(
        id = "FILM_SCHOOL",
        title = "Film School",
        emoji = "🎬",
        accent = Color(0xFFEC4899),
        deep = Color(0xFF3D0A26),
        badge = "8 tracks · LIVE NOW",
        tags = listOf("Public-domain watch-alongs", "Real editor"),
        ladder = listOf("Foundations", "Writing", "Cinematography", "Editing", "Directing", "Acting"),
        webView = "FILM_SCHOOL",
        byBand = mapOf(
            "prek" to "Tell a story in three pictures — beginning, middle, end.",
            "el" to "How movies trick your eyes: shots, cuts, and sound.",
            "ms" to "Edit your first scene in a real editor — rhythm, continuity, story.",
            "hs" to "Film language and history, then a short film cut with real tools.",
            "col" to "Direction, cinematography, post — a portfolio piece, publicly screened.",
            "pro" to "The full pipeline: production, colour, titles, distribution on the platform's own channels.",
        ),
    ),
)

private data class LiveLab(
    val title: String,
    val emoji: String,
    val accent: Color,
    val deep: Color,
    val subtitle: String,
    val webView: String,
)

private val LiveLabs = listOf(
    LiveLab("The Human Body", "🫀", Color(0xFF8B5CF6), Color(0xFF2A1650), "Real 3D anatomy · 7 systems", "SCIENCE_SCHOOL"),
    LiveLab("The Solar System", "🪐", Color(0xFF3B82F6), Color(0xFF0F2246), "Orbital simulation", "SCIENCE_SCHOOL"),
    LiveLab("Plant Biology", "🌱", Color(0xFF06D6A0), Color(0xFF0A3D30), "Botany studio", "SCIENCE_SCHOOL"),
    LiveLab("Combat Atlas", "🥋", Color(0xFFEF4444), Color(0xFF3D0F0F), "Martial-arts museum · real mocap", "PLAJAH_LABS"),
    LiveLab("Plajah Musecion", "🔬", Color(0xFF00DAF3), Color(0xFF04324A), "16 living museum disciplines", "PLAJAH_LABS"),
    LiveLab("Art Galleries", "🖼️", Color(0xFFEC4899), Color(0xFF3D0A26), "Open-access museum art", "ART_GALLERY"),
    LiveLab("Reading Quest", "📖", Color(0xFFD40055), Color(0xFF3D0018), "PreK–G7 · ledger-wired", "LANGUAGE_ARTS_SCHOOL"),
    LiveLab("Math Classroom", "🔢", Color(0xFF3B82F6), Color(0xFF0F2246), "Grades 1–8 · standards-tagged", "MATH_SCHOOL"),
    LiveLab("Science Quest", "🧪", Color(0xFF8B5CF6), Color(0xFF2A1650), "NGSS practices", "SCIENCE_SCHOOL"),
    LiveLab("World Languages", "🗣️", Color(0xFF06D6A0), Color(0xFF0A3D30), "CEFR · spaced repetition", "LANGUAGE_ARTS_SCHOOL"),
    LiveLab("Music Theory", "🎹", Color(0xFF00DAF3), Color(0xFF04324A), "7 lessons · ear training", "MUSIC_THEORY"),
    LiveLab("The Sky", "✨", Color(0xFFA78BFA), Color(0xFF2A1650), "Your mastery as constellations", "ACADEMIA_SKY"),
)

private val TelescopingLevels = listOf(
    Triple("prek", "K–2", "\"We the People…\" — Fifty-two words that start a promise. We chant them, we draw them, and we sign our own class version."),
    Triple("el", "3–5", "\"We the People of the United States, in Order to form a more perfect Union…\" — Who is We? What does a government promise the people it serves?"),
    Triple("ms", "6–8", "The full Preamble, annotated: establish Justice… promote the general Welfare… secure the Blessings of Liberty — six purposes traced to your life today."),
    Triple("hs", "9–12", "The Preamble beside Federalist 51: \"If men were angels, no government would be necessary.\" Why the framers built friction into the machine — in their own words."),
    Triple("col", "College", "The Preamble with its case-law apparatus — what a court may and may not build on fifty-two words. Clause by clause, with the annotations."),
)

private val EducatorPillars = listOf(
    Triple("🧭", "Standards, pre-tagged", "C3, CEE, Jump\$tart, Common Core, NGSS, CEFR, National Core Arts — mastery rolls up automatically."),
    Triple("🗽", "The mandate wave, turnkey", "30 states require personal finance to graduate. Plajah's course is ready on day one — free."),
    Triple("📜", "Public-domain spine", "FDIC, CFPB, founding documents, and the classics. Print, remix, and re-share with zero permission anxiety."),
    Triple("🧪", "Learn by running the real thing", "Double-entry venture books, live city parcels, real film editing, and music that ships."),
    Triple("🍎", "Teacher tools, free forever", "Plan from live mastery, rubric grading, standards gradebook, Google Classroom / LTI / OneRoster / QTI."),
    Triple("🎓", "A record learners own", "Mastery becomes verifiable credentials on a portable ledger that travels between schools and jobs."),
)

/**
 * 1-for-1 Jetpack Compose rebuild of Plajah Academia (Front Row Academy —
 * mirrors AcademiaLandingView.tsx + AcademiaHomeView.tsx).
 */
@Composable
fun AcademiaScreen(
    onOpenPlatform: (String) -> Unit,
) {
    val foldable = rememberFoldableInfo()
    var activeBand by rememberSaveable { mutableStateOf("hs") }
    var telescopeKey by rememberSaveable { mutableStateOf("hs") }
    var selectedSchoolId by rememberSaveable { mutableStateOf<String?>(null) }
    var sectionTab by rememberSaveable { mutableStateOf("SCHOOLS") } // SCHOOLS | LABS | EDUCATORS

    val selectedSchool = remember(selectedSchoolId) {
        FlagshipSchools.firstOrNull { it.id == selectedSchoolId }
    }

    BackHandler(enabled = selectedSchool != null) {
        selectedSchoolId = null
    }

    if (foldable.supportsDualPane && selectedSchool != null) {
        Row(Modifier.fillMaxSize().background(AcademiaInk)) {
            Box(Modifier.weight(0.56f).fillMaxHeight()) {
                AcademiaMainFeed(
                    activeBand = activeBand,
                    onBand = { activeBand = it; telescopeKey = if (it == "pro") "col" else it },
                    sectionTab = sectionTab,
                    onSectionTab = { sectionTab = it },
                    telescopeKey = telescopeKey,
                    onTelescope = { telescopeKey = it },
                    selectedSchoolId = selectedSchool.id,
                    onSelectSchool = { selectedSchoolId = it.id },
                    onOpenView = { view -> onOpenPlatform("https://plajah.com/?view=$view") },
                    wideCols = 1,
                    horizontalPadding = foldable.horizontalPadding,
                )
            }
            Box(Modifier.width(1.dp).fillMaxHeight().background(Color.White.copy(0.08f)))
            Box(Modifier.weight(0.44f).fillMaxHeight()) {
                SchoolDetailPane(
                    school = selectedSchool,
                    activeBand = activeBand,
                    onBand = { activeBand = it },
                    onBack = { selectedSchoolId = null },
                    onLaunchClassic = { onOpenPlatform("https://plajah.com/?view=${selectedSchool.webView}") },
                )
            }
        }
        return
    }

    if (selectedSchool != null) {
        SchoolDetailPane(
            school = selectedSchool,
            activeBand = activeBand,
            onBand = { activeBand = it },
            onBack = { selectedSchoolId = null },
            onLaunchClassic = { onOpenPlatform("https://plajah.com/?view=${selectedSchool.webView}") },
        )
        return
    }

    AcademiaMainFeed(
        activeBand = activeBand,
        onBand = { activeBand = it; telescopeKey = if (it == "pro") "col" else it },
        sectionTab = sectionTab,
        onSectionTab = { sectionTab = it },
        telescopeKey = telescopeKey,
        onTelescope = { telescopeKey = it },
        selectedSchoolId = null,
        onSelectSchool = { selectedSchoolId = it.id },
        onOpenView = { view -> onOpenPlatform("https://plajah.com/?view=$view") },
        wideCols = foldable.wideGridColumns,
        horizontalPadding = foldable.horizontalPadding,
    )
}

@Composable
private fun AcademiaMainFeed(
    activeBand: String,
    onBand: (String) -> Unit,
    sectionTab: String,
    onSectionTab: (String) -> Unit,
    telescopeKey: String,
    onTelescope: (String) -> Unit,
    selectedSchoolId: String?,
    onSelectSchool: (FlagshipSchool) -> Unit,
    onOpenView: (String) -> Unit,
    wideCols: Int,
    horizontalPadding: androidx.compose.ui.unit.Dp,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(wideCols.coerceAtLeast(1)),
        modifier = Modifier.fillMaxSize().background(AcademiaInk),
        contentPadding = PaddingValues(start = horizontalPadding, end = horizontalPadding, top = 10.dp, bottom = 104.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Hero + PreK -> Professional Scaler
        item(span = { GridItemSpan(maxLineSpan) }) {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = Color(0xFF101122),
                border = BorderStroke(1.dp, PlajahBrand.Cyan.copy(0.28f)),
            ) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(7.dp).clip(CircleShape).background(Color(0xFF06D6A0)))
                        Text(
                            "THE LEARNING FRONT ROW · LIVE NOW",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 1.4.sp,
                            color = PlajahBrand.Cyan,
                        )
                    }
                    Text(
                        "Every subject, every age, for real.",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                        lineHeight = 24.sp,
                    )
                    Text(
                        "Slide the band below and watch all 10 flagship schools rewrite themselves for your level.",
                        fontSize = 12.sp,
                        color = Color.White.copy(0.7f),
                    )

                    // Grade-band scaler
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        GradeBands.forEach { band ->
                            val active = band.id == activeBand
                            Surface(
                                shape = CircleShape,
                                color = if (active) PlajahBrand.Cyan else Color.White.copy(0.08f),
                                border = BorderStroke(1.dp, if (active) PlajahBrand.Cyan else Color.White.copy(0.14f)),
                                modifier = Modifier.clickable { onBand(band.id) },
                            ) {
                                Text(
                                    band.label,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Black,
                                    color = if (active) Color.Black else Color.White,
                                    maxLines = 1,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                )
                            }
                        }
                    }

                    // Section switcher + Classic Homeroom button
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        listOf("SCHOOLS" to "10 Schools", "LABS" to "12 Live Labs", "EDUCATORS" to "Educators").forEach { (id, lbl) ->
                            val active = sectionTab == id
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (active) Color(0xFF232544) else Color.Transparent,
                                border = BorderStroke(1.dp, if (active) Color.White.copy(0.3f) else Color.White.copy(0.12f)),
                                modifier = Modifier.clickable { onSectionTab(id) },
                            ) {
                                Text(
                                    lbl,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp),
                                )
                            }
                        }
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = PlajahBrand.Orange.copy(0.18f),
                            border = BorderStroke(1.dp, PlajahBrand.Orange.copy(0.55f)),
                            modifier = Modifier.clickable { onOpenView("ACADEMIA_HOME") },
                        ) {
                            Text(
                                "Homeroom ↗",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = PlajahBrand.Orange,
                                modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp),
                            )
                        }
                    }
                }
            }
        }

        when (sectionTab) {
            "SCHOOLS" -> {
                items(FlagshipSchools, key = { it.id }) { school ->
                    val selected = school.id == selectedSchoolId
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = Color(0xFF111222),
                        border = BorderStroke(1.dp, if (selected) school.accent else school.accent.copy(0.32f)),
                        modifier = Modifier.fillMaxWidth().clickable { onSelectSchool(school) },
                    ) {
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .background(Brush.linearGradient(listOf(school.deep.copy(0.55f), Color(0xFF10111F))))
                                .padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Box(
                                    Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(school.accent.copy(0.22f)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(school.emoji, fontSize = 20.sp)
                                }
                                Column(Modifier.weight(1f)) {
                                    Text(school.badge, fontSize = 9.sp, fontWeight = FontWeight.Black, color = school.accent, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(school.title, fontSize = 16.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                Icon(Icons.Rounded.ChevronRight, null, tint = Color.White.copy(0.5f))
                            }

                            Text(
                                school.byBand[activeBand].orEmpty(),
                                fontSize = 13.sp,
                                lineHeight = 18.sp,
                                color = Color.White.copy(0.88f),
                            )

                            // Progression ladder preview
                            Row(
                                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                school.ladder.forEachIndexed { idx, step ->
                                    Surface(shape = CircleShape, color = Color.Black.copy(0.35f), border = BorderStroke(1.dp, school.accent.copy(0.35f))) {
                                        Text(
                                            "${idx + 1}. $step",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color.White.copy(0.85f),
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Telescoping Text spotlight at bottom of Schools
                item(span = { GridItemSpan(maxLineSpan) }) {
                    TelescopingTextCard(
                        activeKey = telescopeKey,
                        onSelectKey = onTelescope,
                        onOpenCivics = { onOpenView("CIVICS_HALL") },
                    )
                }
            }

            "LABS" -> {
                items(LiveLabs, key = { it.title }) { lab ->
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFF111222),
                        border = BorderStroke(1.dp, lab.accent.copy(0.35f)),
                        modifier = Modifier.fillMaxWidth().clickable { onOpenView(lab.webView) },
                    ) {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .background(Brush.horizontalGradient(listOf(lab.deep.copy(0.6f), Color(0xFF111222))))
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Box(
                                Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(lab.accent.copy(0.22f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(lab.emoji, fontSize = 22.sp)
                            }
                            Column(Modifier.weight(1f)) {
                                Text(lab.title, fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(lab.subtitle, fontSize = 11.sp, color = Color.White.copy(0.72f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Surface(shape = CircleShape, color = lab.accent.copy(0.18f)) {
                                Text("OPEN ↗", fontSize = 9.sp, fontWeight = FontWeight.Black, color = lab.accent, modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp))
                            }
                        }
                    }
                }
            }

            else -> {
                items(EducatorPillars, key = { it.second }) { (emoji, title, desc) ->
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFF121326),
                        border = BorderStroke(1.dp, Color.White.copy(0.1f)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(emoji, fontSize = 22.sp)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(title, fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color.White)
                                Text(desc, fontSize = 12.sp, lineHeight = 17.sp, color = Color.White.copy(0.74f))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TelescopingTextCard(
    activeKey: String,
    onSelectKey: (String) -> Unit,
    onOpenCivics: () -> Unit,
) {
    val active = TelescopingLevels.firstOrNull { it.first == activeKey } ?: TelescopingLevels.first()
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = Color(0xFF140D1E),
        border = BorderStroke(1.dp, Color(0xFFD40055).copy(0.42f)),
    ) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("TELESCOPING TEXT · CIVICS HALL", fontSize = 9.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp, color = Color(0xFFFF4D8D))
            Text("One primary source, five zoom levels", fontSize = 16.sp, fontWeight = FontWeight.Black, color = Color.White)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TelescopingLevels.forEach { (id, lbl, _) ->
                    val on = id == active.first
                    Surface(
                        shape = CircleShape,
                        color = if (on) Color(0xFFD40055) else Color.White.copy(0.08f),
                        modifier = Modifier.clickable { onSelectKey(id) },
                    ) {
                        Text(lbl, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White, modifier = Modifier.padding(horizontal = 11.dp, vertical = 5.dp))
                    }
                }
            }
            Text(active.third, fontSize = 13.sp, lineHeight = 20.sp, color = Color.White.copy(0.9f))
            OutlinedButton(
                onClick = onOpenCivics,
                border = BorderStroke(1.dp, Color(0xFFD40055).copy(0.6f)),
            ) {
                Text("Enter Civics Hall ↗", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFFFF6CA0))
            }
        }
    }
}

@Composable
private fun SchoolDetailPane(
    school: FlagshipSchool,
    activeBand: String,
    onBand: (String) -> Unit,
    onBack: () -> Unit,
    onLaunchClassic: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(AcademiaInk),
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 10.dp, bottom = 110.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconButton(onClick = onBack, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Rounded.ArrowBack, "Back", tint = Color.White)
                }
                Text(school.emoji, fontSize = 22.sp)
                Column(Modifier.weight(1f)) {
                    Text(school.badge, fontSize = 9.sp, fontWeight = FontWeight.Black, color = school.accent, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(school.title, fontSize = 18.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }

        item {
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = school.deep.copy(0.55f),
                border = BorderStroke(1.dp, school.accent.copy(0.45f)),
            ) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("SELECT LEARNER LEVEL", fontSize = 9.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp, color = school.accent)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        GradeBands.forEach { b ->
                            val on = b.id == activeBand
                            Surface(
                                shape = CircleShape,
                                color = if (on) school.accent else Color.Black.copy(0.3f),
                                modifier = Modifier.clickable { onBand(b.id) },
                            ) {
                                Text(
                                    b.label,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (on) Color.Black else Color.White,
                                    modifier = Modifier.padding(horizontal = 11.dp, vertical = 5.dp),
                                )
                            }
                        }
                    }
                    Text(
                        school.byBand[activeBand].orEmpty(),
                        fontSize = 15.sp,
                        lineHeight = 22.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color.White,
                    )
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        school.tags.forEach { tag ->
                            Surface(shape = CircleShape, color = Color.Black.copy(0.35f)) {
                                Text(tag, fontSize = 11.sp, color = school.accent, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
                            }
                        }
                    }
                }
            }
        }

        item {
            Text("CURRICULUM PROGRESSION LADDER", fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp, color = school.accent)
        }

        items(school.ladder.size) { index ->
            val step = school.ladder[index]
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = Color(0xFF121324),
                border = BorderStroke(1.dp, Color.White.copy(0.08f)),
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        Modifier.size(28.dp).clip(CircleShape).background(school.accent.copy(0.22f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("${index + 1}", fontSize = 12.sp, fontWeight = FontWeight.Black, color = school.accent)
                    }
                    Text(step, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.White, modifier = Modifier.weight(1f))
                    Text("STAGE ${index + 1}", fontSize = 9.sp, fontWeight = FontWeight.Black, color = Color.White.copy(0.45f))
                }
            }
        }

        item {
            Button(
                onClick = onLaunchClassic,
                colors = ButtonDefaults.buttonColors(containerColor = school.accent, contentColor = Color.Black),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Icon(Icons.Rounded.OpenInNew, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Open Full ${school.title} Studio", fontWeight = FontWeight.Black)
            }
        }
    }
}
