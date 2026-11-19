package com.plajah.app.ui.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.AutoStories
import androidx.compose.material.icons.rounded.Church
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.SportsBasketball
import androidx.compose.material.icons.rounded.SportsEsports
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * NATIVE DESTINATION MODEL — the Jetpack Compose mirror of the web view-state router.
 *
 * The 6 native-rebuilt flagship surfaces (behind the Native UI toggle):
 *   Chora (100% website parity), Reello, Cinema, Lorea, Elevate, Academia.
 */
data class Destination(
    val id: String,
    val label: String,
    val webView: String,
    val icon: ImageVector,
    val primary: Boolean = false,
)

object Destinations {
    // ── Primary 6 Native Jetpack Compose Flagship Surfaces ────────────────────
    val Chora    = Destination("chora",    "Chora",    "MUSIC",          Icons.Rounded.LibraryMusic, primary = true)
    val Reello   = Destination("reello",   "Reello",   "VIDEOS",         Icons.Rounded.Movie,        primary = true)
    val Cinema   = Destination("cinema",   "Cinema",   "MOVIES_TV",      Icons.Rounded.LiveTv,       primary = true)
    val Lorea    = Destination("lorea",    "Lorea",    "BOOKS",          Icons.Rounded.AutoStories,  primary = true)
    val Elevate  = Destination("elevate",  "Elevate",  "PLAJAH_ELEVATE", Icons.Rounded.Church,       primary = true)
    val Academia = Destination("academia", "Academia", "CLASSROOMS",     Icons.Rounded.School,       primary = true)

    // ── Secondary / Classic-bridged Destinations ────────────────────────────
    val Home     = Destination("home",     "Home",     "DASHBOARD",      Icons.Rounded.Home)
    val Files    = Destination("files",    "Files",    "PLAJAH_DRIVE",   Icons.Rounded.FolderOpen)
    val Radio    = Destination("radio",    "Radio",    "RADIO",          Icons.Rounded.Radio)
    val Games    = Destination("games",    "Games",    "GAMES",          Icons.Rounded.SportsEsports)
    val Photos   = Destination("photos",   "Photos",   "GLOBAL_PHOTOS",  Icons.Rounded.PhotoLibrary)
    val Sports   = Destination("sports",   "Sports",   "PLAJAH_SPORTS",  Icons.Rounded.SportsBasketball)
    val Chat     = Destination("chat",     "Chat",     "CHAT",           Icons.Rounded.Forum)
    val Studio   = Destination("studio",   "Creator",  "CREATOR_HUB",    Icons.Rounded.AutoAwesome)
    val Profile  = Destination("profile",  "You",      "USER_PROFILE",   Icons.Rounded.AccountCircle)

    /** Phone bottom bar (5 items for ultra-compact cover screens, all 6 on >= 390dp & rail/drawer). */
    val primaryCompact: List<Destination> = listOf(Chora, Reello, Cinema, Lorea, Elevate)
    val primary: List<Destination> = listOf(Chora, Reello, Cinema, Lorea, Elevate, Academia)

    /** Everything in rail/drawer order. */
    val all: List<Destination> = listOf(
        Chora, Reello, Cinema, Lorea, Elevate, Academia,
        Home, Files, Games, Radio, Photos, Sports, Chat, Studio, Profile,
    )
}
