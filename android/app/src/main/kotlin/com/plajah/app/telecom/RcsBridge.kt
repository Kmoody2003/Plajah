package com.plajah.app.telecom

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * RCS through notifications. No third-party RCS API exists (Google Messages keeps RCS in private
 * storage; ImsRcsManager / SipDelegate need carrier privilege), so with the user's Notification
 * access Plajah mirrors the MessagingStyle notifications that Google Messages (and Samsung
 * Messages) post, and replies through the notification's own Reply action.
 *
 * Limits, shown in the UI: only messages that arrive while access is on (no history), text only
 * (media/reactions show as placeholders), and replying needs the notification to still be live.
 * RCS only works while Google Messages is the default SMS app, so this is the alternative to
 * Plajah holding ROLE_SMS, not an addition to it.
 *
 * Everything stays on the phone: threads persist to app-private storage (filesDir) only.
 */
class PlajahRcsBridgeService : NotificationListenerService() {

    override fun onListenerConnected() {
        RcsStore.load(this)
        // Pick up conversations already in the shade (the newest messages only).
        try { activeNotifications?.forEach { capture(it) } } catch (_: Exception) { }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) = capture(sbn)

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        if (sbn.packageName in RcsStore.SOURCES) RcsStore.dropReply(sbn.key)
    }

    private fun capture(sbn: StatusBarNotification) {
        if (sbn.packageName !in RcsStore.SOURCES) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n) ?: return
        val extras = n.extras
        val isGroup = style.isGroupConversation || extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false)
        val title = style.conversationTitle?.toString()
            ?: extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()
            ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: "Conversation"
        val conv = n.shortcutId ?: sbn.tag ?: title
        val threadKey = "${sbn.packageName}|$conv"
        val replyAction = n.actions?.firstOrNull { a ->
            a.remoteInputs?.isNotEmpty() == true &&
                (a.semanticAction == Notification.Action.SEMANTIC_ACTION_REPLY || a.semanticAction == Notification.Action.SEMANTIC_ACTION_NONE)
        }
        val added = ArrayList<JSONObject>()
        for (m in style.messages) {
            val text = m.text?.toString() ?: (if (m.dataMimeType != null) "[${m.dataMimeType?.substringBefore('/')}]" else "")
            if (text.isBlank()) continue
            val outgoing = m.person == null || m.person?.key == style.user.key && style.user.key != null ||
                (m.person?.name != null && m.person?.name == style.user.name)
            val sender = if (outgoing) "" else m.person?.name?.toString() ?: title
            if (!outgoing && RcsStore.isKnownSms(this, sender, text, m.timestamp)) continue
            RcsStore.addMessage(threadKey, title, isGroup, sbn.packageName, sender, text, m.timestamp, outgoing)?.let { added.add(it) }
        }
        if (replyAction != null) RcsStore.setReply(threadKey, sbn.key, replyAction)
        if (added.isNotEmpty()) {
            RcsStore.save(this)
            added.filter { !it.optBoolean("outgoing") }.forEach { m ->
                PlajahTelecomPlugin.instance?.emitRcs(threadKey, title, m)
            }
        }
    }
}

object RcsStore {
    val SOURCES = setOf("com.google.android.apps.messaging", "com.samsung.android.messaging")
    private const val MAX_PER_THREAD = 300
    private const val FILE = "rcs_bridge_threads.json"

    private data class Reply(val notificationKey: String, val action: Notification.Action)

    /** threadKey → { title, isGroup, source, unread, messages[] } */
    private val threads = ConcurrentHashMap<String, JSONObject>()
    private val replies = ConcurrentHashMap<String, Reply>()
    @Volatile private var loaded = false

    fun isEnabled(ctx: Context) = NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName)

    @Synchronized
    fun load(ctx: Context) {
        if (loaded) return
        loaded = true
        try {
            val f = File(ctx.filesDir, FILE)
            if (!f.exists()) return
            val o = JSONObject(f.readText())
            o.keys().forEach { k -> threads[k] = o.getJSONObject(k) }
        } catch (_: Exception) { }
    }

    @Synchronized
    fun save(ctx: Context) {
        try {
            val o = JSONObject()
            threads.forEach { (k, v) -> o.put(k, v) }
            File(ctx.filesDir, FILE).writeText(o.toString())
        } catch (_: Exception) { }
    }

    @Synchronized
    fun addMessage(threadKey: String, title: String, isGroup: Boolean, source: String, sender: String, text: String, ts: Long, outgoing: Boolean): JSONObject? {
        val t = threads.getOrPut(threadKey) {
            JSONObject().put("title", title).put("isGroup", isGroup).put("source", source).put("unread", 0).put("messages", JSONArray())
        }
        t.put("title", title).put("isGroup", isGroup)
        val msgs = t.getJSONArray("messages")
        for (i in 0 until msgs.length()) {
            val m = msgs.getJSONObject(i)
            if (m.optLong("date") == ts && m.optString("body") == text) return null
        }
        val m = JSONObject()
            .put("id", "rcs:${threadKey.hashCode()}:$ts:${text.hashCode()}")
            .put("sender", sender).put("body", text).put("date", ts).put("outgoing", outgoing)
        msgs.put(m)
        // keep chronological + capped
        val sorted = (0 until msgs.length()).map { msgs.getJSONObject(it) }.sortedBy { it.optLong("date") }.takeLast(MAX_PER_THREAD)
        t.put("messages", JSONArray(sorted))
        if (!outgoing) t.put("unread", t.optInt("unread") + 1)
        return m
    }

    fun setReply(threadKey: String, notificationKey: String, action: Notification.Action) { replies[threadKey] = Reply(notificationKey, action) }
    fun dropReply(notificationKey: String) { replies.entries.removeIf { it.value.notificationKey == notificationKey } }
    fun canReply(threadKey: String) = replies.containsKey(threadKey)

    fun threadsJson(): JSArray {
        val out = JSArray()
        threads.entries.map { (k, t) ->
            val msgs = t.getJSONArray("messages")
            val last = if (msgs.length() > 0) msgs.getJSONObject(msgs.length() - 1) else null
            k to (t to last)
        }.sortedByDescending { it.second.second?.optLong("date") ?: 0L }.forEach { (k, pair) ->
            val (t, last) = pair
            out.put(JSObject().apply {
                put("threadKey", k)
                put("title", t.optString("title"))
                put("isGroup", t.optBoolean("isGroup"))
                put("source", if (t.optString("source").contains("samsung")) "samsung" else "google")
                put("snippet", last?.optString("body") ?: "")
                put("date", last?.optLong("date") ?: 0L)
                put("unreadCount", t.optInt("unread"))
                put("canReply", canReply(k))
            })
        }
        return out
    }

    fun messagesJson(threadKey: String): JSArray {
        val out = JSArray()
        val msgs = threads[threadKey]?.optJSONArray("messages") ?: return out
        for (i in 0 until msgs.length()) out.put(msgs.getJSONObject(i))
        return out
    }

    fun markRead(ctx: Context, threadKey: String) {
        threads[threadKey]?.put("unread", 0)
        save(ctx)
    }

    fun deleteThread(ctx: Context, threadKey: String) {
        threads.remove(threadKey); replies.remove(threadKey); save(ctx)
    }

    /** Fire the live notification's Reply action. Returns false when it is gone (reply from Google Messages instead). */
    fun reply(ctx: Context, threadKey: String, text: String): Boolean {
        val r = replies[threadKey] ?: return false
        val inputs = r.action.remoteInputs ?: return false
        val intent = Intent()
        val results = Bundle()
        inputs.forEach { results.putCharSequence(it.resultKey, text) }
        RemoteInput.addResultsToIntent(inputs, intent, results)
        return try {
            r.action.actionIntent.send(ctx, 0, intent)
            addMessage(threadKey, threads[threadKey]?.optString("title") ?: "", threads[threadKey]?.optBoolean("isGroup") ?: false,
                threads[threadKey]?.optString("source") ?: "", "", text, System.currentTimeMillis(), true)
            save(ctx)
            true
        } catch (_: PendingIntent.CanceledException) {
            replies.remove(threadKey); false
        }
    }

    /**
     * Google Messages also notifies for plain SMS. When Plajah can read the SMS provider, skip a
     * notification message that matches an SMS already there (same body within 2 minutes), so the
     * Texts list doesn't show it twice.
     */
    fun isKnownSms(ctx: Context, sender: String, text: String, ts: Long): Boolean {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) return false
        return try {
            ctx.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI, arrayOf("_id"),
                "${Telephony.Sms.BODY}=? AND ${Telephony.Sms.DATE} BETWEEN ? AND ?",
                arrayOf(text, (ts - 120_000).toString(), (ts + 120_000).toString()), null)?.use { it.count > 0 } ?: false
        } catch (_: Exception) { false }
    }
}
