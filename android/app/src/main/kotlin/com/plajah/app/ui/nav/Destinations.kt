package com.plajah.app.ui.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.AutoStories
import androidx.compose.material.icons.rounded.Bolt
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
 * NATIVE DESTINATION MODEL — the Compose mirror of the web view-state router.
 *
 * The web app has no react-router: navigation is a string enum (`AppView` in
 * types.ts:2860) switched inside App.tsx, grouped by `NAV_SECTIONS` in
 * components/CommandSplitNav.tsx. We reproduce the branded top-level destinations
 * here. `webView` is the exact `AppView` string, so the native ⇄ Classic toggle
 * can hand off to the identical web screen (see ShellPrefs / NativeActivity).
 *
 * `primary` marks the phone bottom-bar set; on tablets/Android-laptop windows the
 * NavigationSuiteScaffold promotes to a rail then a full drawer showing every item.
 */
data class Destination(
    val id: String,
    val label: String,
    val webView: String,
    val icon: ImageVector,
    val primary: Boolean = false,
)

object Destinations {

    val Home    = Destination("home",    "Front Row", "DASHBOARD",     Icons.Rounded.Home,           primary = true)
    val Chora   = Destination("chora",   "Chora",     "MUSIC",         Icons.Rounded.LibraryMusic,   primary = true)
    val Reello  = Destination("reello",  "Reello",    "VIDEOS",        Icons.Rounded.Movie,          primary = true)
    val Lorea   = Destination("lorea",   "Lorea",     "BOOKS",         Icons.Rounded.AutoStories,    primary = true)
    val Feed    = Destination("feed",    "Feed",      "FEED",          Icons.Rounded.Bolt,           primary = true)

    // Secondary — reachable from the rail/drawer and the ⌘K launcher.
    val Taleo    = Destination("taleo",    "Taleo",    "MOVIES_TV",     Icons.Rounded.LiveTv)
    val Radio    = Destination("radio",    "Radio",    "RADIO",         Icons.Rounded.Radio)
    val Games    = Destination("games",    "Games",    "GAMES",         Icons.Rounded.SportsEsports)
    val Photos   = Destination("photos",   "Photos",   "GLOBAL_PHOTOS", Icons.Rounded.PhotoLibrary)
    val Sports   = Destination("sports",   "Sports",   "PLAJAH_SPORTS", Icons.Rounded.SportsBasketball)
    val Academia = Destination("academia", "Academia", "CLASSROOMS",    Icons.Rounded.School)
    val Chat     = Destination("chat",     "Chat",     "CHAT",          Icons.Rounded.Forum)
    val Studio   = Destination("studio",   "Creator",  "CREATOR_HUB",   Icons.Rounded.AutoAwesome)
    val Profile  = Destination("profile",  "You",      "USER_PROFILE",  Icons.Rounded.AccountCircle)

    /** Phone bottom-bar order. */
    val primary: List<Destination> = listOf(Home, Chora, Reello, Lorea, Feed)

    /** Everything, in rail/drawer order (Android-laptop windows show the lot). */
    val all: List<Destination> = listOf(
        Home, Chora, Reello, Lorea, Feed,
        Taleo, Radio, Games, Photos, Sports, Academia, Chat, Studio, Profile,
    )
}
