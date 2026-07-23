package com.plajah.app

import android.content.ContentUris
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import androidx.tvprovider.media.tv.PreviewChannelHelper
import androidx.tvprovider.media.tv.TvContractCompat
import androidx.tvprovider.media.tv.WatchNextProgram
import com.getcapacitor.JSArray
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Puts Plajah's "continue watching" into the Android TV / Google TV home-screen Watch Next row —
 * the same system row YouTube and Netflix populate. The web app cannot reach the TvProvider from
 * the WebView, so this plugin is the bridge: JS hands over the unfinished titles, this writes them.
 *
 * ONE service surface, both verticals. Reello clips and Taleo films arrive through the same
 * recordProgress() choke point on the web side, so they come in here as the same shape and differ
 * only by contentType (CLIP vs MOVIE) and the deep-link `type` that routes each back to its player.
 *
 * Fire TV does NOT read this row — Amazon's launcher ignores Google's TvProvider — so isSupported()
 * reports false there and JS skips the sync rather than doing work that no surface will ever show.
 *
 * No runtime permission is needed to write an app's own Watch Next programs. Everything is wrapped
 * in try/catch because OEM TV launchers vary, and a home-row write must never be able to crash the
 * app that is only trying to remember where you paused.
 */
@CapacitorPlugin(name = "WatchNext")
class WatchNextPlugin : Plugin() {

    private val helper by lazy { PreviewChannelHelper(context) }

    /** True only on a leanback television that actually owns a Watch Next provider. */
    private fun deviceSupportsWatchNext(): Boolean {
        val pm = context.packageManager ?: return false
        val leanback = pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK) ||
            pm.hasSystemFeature("android.hardware.type.television")
        if (!leanback) return false
        // Fire TV is leanback but has no Watch Next provider; probing the URI is the only honest test.
        return try {
            context.contentResolver
                .query(TvContractCompat.WatchNextPrograms.CONTENT_URI, arrayOf(TvContractCompat.WatchNextPrograms._ID), null, null, null)
                ?.use { true } ?: false
        } catch (_: Exception) {
            false
        }
    }

    @PluginMethod
    fun isSupported(call: PluginCall) {
        call.resolve(com.getcapacitor.JSObject().put("supported", deviceSupportsWatchNext()))
    }

    /**
     * Upsert a batch of continue-watching entries. Existing rows for the same internalId are
     * UPDATED, never duplicated — the launcher would otherwise show the same film several times.
     */
    @PluginMethod
    fun upsert(call: PluginCall) {
        if (!deviceSupportsWatchNext()) { call.resolve(skipped("unsupported")); return }
        val items = call.getArray("items", JSArray()) ?: JSArray()
        var written = 0
        for (i in 0 until items.length()) {
            val o = items.optJSONObject(i) ?: continue
            val internalId = o.optString("id").takeIf { it.isNotBlank() } ?: continue
            try {
                val program = buildProgram(o, internalId)
                val existing = existingRowId(internalId)
                if (existing != null) helper.updateWatchNextProgram(program, existing)
                else helper.publishWatchNextProgram(program)
                written++
            } catch (e: Exception) {
                Log.w(TAG, "upsert failed for $internalId: ${e.message}")
            }
        }
        call.resolve(com.getcapacitor.JSObject().put("written", written))
    }

    /** Remove rows by internalId — used when a title is finished, removed, or the user clears it. */
    @PluginMethod
    fun remove(call: PluginCall) {
        if (!deviceSupportsWatchNext()) { call.resolve(skipped("unsupported")); return }
        val ids = call.getArray("ids", JSArray()) ?: JSArray()
        var removed = 0
        for (i in 0 until ids.length()) {
            val internalId = ids.optString(i)?.takeIf { it.isNotBlank() } ?: continue
            try {
                existingRowId(internalId)?.let { rowId ->
                    context.contentResolver.delete(
                        ContentUris.withAppendedId(TvContractCompat.WatchNextPrograms.CONTENT_URI, rowId), null, null,
                    )
                    removed++
                }
            } catch (e: Exception) {
                Log.w(TAG, "remove failed for $internalId: ${e.message}")
            }
        }
        call.resolve(com.getcapacitor.JSObject().put("removed", removed))
    }

    // ── internals ────────────────────────────────────────────────────────────

    private fun buildProgram(o: org.json.JSONObject, internalId: String): WatchNextProgram {
        val title = o.optString("title").ifBlank { "Continue watching" }
        val positionMs = (o.optDouble("positionSec", 0.0) * 1000).toInt().coerceAtLeast(0)
        val durationMs = (o.optDouble("durationSec", 0.0) * 1000).toInt().coerceAtLeast(0)
        // Recency is what orders the row. lastEngagement defaults to now so a just-paused title
        // rises to the front; JS may pass an explicit updatedAt for a bulk reconcile.
        val engagedAt = o.optLong("updatedAt", System.currentTimeMillis())

        // CLIP for Reello, MOVIE for Taleo. Everything else is a safe MOVIE fallback.
        val programType = when (o.optString("contentType")) {
            "CLIP" -> TvContractCompat.PreviewPrograms.TYPE_CLIP
            "TV_EPISODE" -> TvContractCompat.PreviewPrograms.TYPE_TV_EPISODE
            else -> TvContractCompat.PreviewPrograms.TYPE_MOVIE
        }
        val aspect = if (o.optString("aspect") == "MOVIE_POSTER")
            TvContractCompat.PreviewPrograms.ASPECT_RATIO_MOVIE_POSTER
        else
            TvContractCompat.PreviewPrograms.ASPECT_RATIO_16_9

        val builder = WatchNextProgram.Builder()
            .setType(programType)
            .setWatchNextType(TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
            .setLastEngagementTimeUtcMillis(engagedAt)
            .setTitle(title)
            .setInternalProviderId(internalId)
            .setIntentUri(Uri.parse(o.optString("deepLink")))
            .setPosterArtAspectRatio(aspect)

        o.optString("description").takeIf { it.isNotBlank() }?.let { builder.setDescription(it) }
        o.optString("posterUri").takeIf { it.isNotBlank() }?.let { builder.setPosterArtUri(Uri.parse(it)) }
        if (durationMs > 0) builder.setDurationMillis(durationMs)
        // Only claim a resume point when there is a real one; a spurious 0 hides the progress bar.
        if (positionMs > 0 && durationMs > 0) builder.setLastPlaybackPositionMillis(positionMs)

        return builder.build()
    }

    /** The provider row id (its own _ID) for our internalId, or null if we've never written it. */
    private fun existingRowId(internalId: String): Long? {
        return try {
            context.contentResolver.query(
                TvContractCompat.WatchNextPrograms.CONTENT_URI,
                arrayOf(TvContractCompat.WatchNextPrograms._ID),
                "${TvContractCompat.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID} = ?",
                arrayOf(internalId),
                null,
            )?.use { c -> if (c.moveToFirst()) c.getLong(0) else null }
        } catch (e: Exception) {
            // Some OEM providers reject a WHERE on internal-provider-id; fall back to a full scan.
            scanForInternalId(internalId)
        }
    }

    private fun scanForInternalId(internalId: String): Long? {
        return try {
            context.contentResolver.query(
                TvContractCompat.WatchNextPrograms.CONTENT_URI,
                arrayOf(
                    TvContractCompat.WatchNextPrograms._ID,
                    TvContractCompat.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID,
                ),
                null, null, null,
            )?.use { c ->
                while (c.moveToNext()) {
                    if (c.getString(1) == internalId) return c.getLong(0)
                }
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun skipped(reason: String) =
        com.getcapacitor.JSObject().put("written", 0).put("removed", 0).put("skipped", reason)

    companion object {
        private const val TAG = "PlajahWatchNext"
    }
}
