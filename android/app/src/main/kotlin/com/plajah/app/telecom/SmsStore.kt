package com.plajah.app.telecom

import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject

/**
 * Carrier SMS / MMS through the Telephony provider. Everything stays on the phone: nothing in
 * here talks to the network except the carrier itself (SmsManager). As the default SMS app,
 * Plajah is the one that writes incoming and sent messages into the provider.
 */
object SmsStore {
    const val ACTION_SENT = "com.plajah.app.telecom.SMS_SENT"

    private val CONVERSATIONS: Uri = Uri.parse("content://mms-sms/conversations?simple=true")
    private val CANONICAL: Uri = Uri.parse("content://mms-sms/canonical-addresses")

    private fun Cursor.str(col: String): String? = getColumnIndex(col).takeIf { it >= 0 }?.let { if (isNull(it)) null else getString(it) }
    private fun Cursor.long(col: String): Long = getColumnIndex(col).takeIf { it >= 0 }?.let { if (isNull(it)) 0L else getLong(it) } ?: 0L
    private fun Cursor.int(col: String): Int = getColumnIndex(col).takeIf { it >= 0 }?.let { if (isNull(it)) 0 else getInt(it) } ?: 0

    private fun canonicalAddresses(ctx: Context): Map<String, String> {
        val map = HashMap<String, String>()
        ctx.contentResolver.query(CANONICAL, arrayOf("_id", "address"), null, null, null)?.use { c ->
            while (c.moveToNext()) map[c.long("_id").toString()] = c.str("address") ?: ""
        }
        return map
    }

    fun threads(ctx: Context, limit: Int): JSArray {
        val out = JSArray()
        val addresses = canonicalAddresses(ctx)
        ctx.contentResolver.query(
            CONVERSATIONS,
            arrayOf("_id", "date", "message_count", "recipient_ids", "snippet", "read", "has_attachment"),
            null, null, "date DESC"
        )?.use { c ->
            var n = 0
            while (c.moveToNext() && n++ < limit) {
                val recips = JSArray()
                (c.str("recipient_ids") ?: "").split(' ').filter { it.isNotBlank() }
                    .forEach { rid -> addresses[rid]?.let { recips.put(it) } }
                val threadId = c.long("_id")
                out.put(JSObject().apply {
                    put("threadId", threadId.toString())
                    put("addresses", recips)
                    put("snippet", c.str("snippet") ?: "")
                    put("date", c.long("date"))
                    put("messageCount", c.int("message_count"))
                    put("unread", c.int("read") == 0)
                    put("unreadCount", unreadCount(ctx, threadId))
                    put("hasAttachment", c.int("has_attachment") != 0)
                })
            }
        }
        return out
    }

    private fun unreadCount(ctx: Context, threadId: Long): Int =
        ctx.contentResolver.query(Telephony.Sms.CONTENT_URI, arrayOf("_id"),
            "${Telephony.Sms.THREAD_ID}=? AND ${Telephony.Sms.READ}=0", arrayOf(threadId.toString()), null)?.use { it.count } ?: 0

    fun messages(ctx: Context, threadId: String, limit: Int, before: Long): JSArray {
        val list = ArrayList<JSObject>()
        val beforeClause = if (before > 0) " AND ${Telephony.Sms.DATE}<?" else ""
        val args = if (before > 0) arrayOf(threadId, before.toString()) else arrayOf(threadId)
        ctx.contentResolver.query(
            Telephony.Sms.CONTENT_URI,
            arrayOf("_id", "address", "body", "date", "type", "read", "status"),
            "${Telephony.Sms.THREAD_ID}=?$beforeClause", args, "date DESC LIMIT $limit"
        )?.use { c ->
            while (c.moveToNext()) {
                val type = c.int("type")
                list.add(JSObject().apply {
                    put("id", "sms:${c.long("_id")}")
                    put("kind", "sms")
                    put("address", c.str("address") ?: "")
                    put("body", c.str("body") ?: "")
                    put("date", c.long("date"))
                    put("outgoing", type != Telephony.Sms.MESSAGE_TYPE_INBOX)
                    put("status", when (type) {
                        Telephony.Sms.MESSAGE_TYPE_OUTBOX, Telephony.Sms.MESSAGE_TYPE_QUEUED -> "sending"
                        Telephony.Sms.MESSAGE_TYPE_FAILED -> "failed"
                        Telephony.Sms.MESSAGE_TYPE_SENT -> "sent"
                        else -> "received"
                    })
                    put("read", c.int("read") != 0)
                })
            }
        }
        list.addAll(mmsMessages(ctx, threadId, limit, before))
        list.sortByDescending { it.getLong("date") }
        val out = JSArray()
        list.take(limit).reversed().forEach { out.put(it) }
        return out
    }

    /** Basic MMS: text parts + image/video parts as content URLs the WebView can load. */
    private fun mmsMessages(ctx: Context, threadId: String, limit: Int, before: Long): List<JSObject> {
        val out = ArrayList<JSObject>()
        // MMS dates are seconds, SMS dates milliseconds.
        val beforeClause = if (before > 0) " AND ${Telephony.Mms.DATE}<?" else ""
        val args = if (before > 0) arrayOf(threadId, (before / 1000).toString()) else arrayOf(threadId)
        ctx.contentResolver.query(
            Telephony.Mms.CONTENT_URI, arrayOf("_id", "date", "msg_box", "read"),
            "${Telephony.Mms.THREAD_ID}=?$beforeClause", args, "date DESC LIMIT $limit"
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.long("_id")
                val text = StringBuilder()
                val media = JSArray()
                ctx.contentResolver.query(Uri.parse("content://mms/part"), arrayOf("_id", "ct", "text", "_data"),
                    "mid=?", arrayOf(id.toString()), null)?.use { p ->
                    while (p.moveToNext()) {
                        val ct = p.str("ct") ?: ""
                        val partId = p.long("_id")
                        when {
                            ct == "text/plain" -> {
                                val t = if (p.str("_data") != null) readPartText(ctx, partId) else p.str("text")
                                if (!t.isNullOrBlank()) { if (text.isNotEmpty()) text.append('\n'); text.append(t) }
                            }
                            ct.startsWith("image/") || ct.startsWith("video/") || ct.startsWith("audio/") ->
                                media.put(JSObject().put("mimeType", ct).put("url", "/_capacitor_content_/mms/part/$partId"))
                        }
                    }
                }
                val box = c.int("msg_box")
                out.add(JSObject().apply {
                    put("id", "mms:$id")
                    put("kind", "mms")
                    put("address", mmsFrom(ctx, id) ?: "")
                    put("body", text.toString())
                    put("media", media)
                    put("date", c.long("date") * 1000)
                    put("outgoing", box != Telephony.Mms.MESSAGE_BOX_INBOX)
                    put("status", if (box == Telephony.Mms.MESSAGE_BOX_OUTBOX) "sending" else if (box == Telephony.Mms.MESSAGE_BOX_INBOX) "received" else "sent")
                    put("read", c.int("read") != 0)
                })
            }
        }
        return out
    }

    private fun readPartText(ctx: Context, partId: Long): String? = try {
        ctx.contentResolver.openInputStream(Uri.parse("content://mms/part/$partId"))?.use { it.bufferedReader().readText() }
    } catch (_: Exception) { null }

    private fun mmsFrom(ctx: Context, mmsId: Long): String? =
        ctx.contentResolver.query(Uri.parse("content://mms/$mmsId/addr"), arrayOf("address", "type"),
            "type=137", null, null)?.use { c -> if (c.moveToFirst()) c.str("address") else null } // 137 = PduHeaders.FROM

    fun threadIdFor(ctx: Context, addresses: List<String>): Long =
        Telephony.Threads.getOrCreateThreadId(ctx, addresses.toSet())

    private fun smsManager(ctx: Context, subId: Int?): SmsManager {
        val base = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) ctx.getSystemService(SmsManager::class.java)
                   else @Suppress("DEPRECATION") SmsManager.getDefault()
        return if (subId != null && subId >= 0) base.createForSubscriptionId(subId) else base
    }

    /** Send one text to each address (group MMS is phase 2). Returns the provider rows written. */
    fun send(ctx: Context, addresses: List<String>, body: String, subId: Int?): List<Uri> {
        val sm = smsManager(ctx, subId)
        val written = ArrayList<Uri>()
        for (addr in addresses) {
            val values = ContentValues().apply {
                put(Telephony.Sms.ADDRESS, addr)
                put(Telephony.Sms.BODY, body)
                put(Telephony.Sms.DATE, System.currentTimeMillis())
                put(Telephony.Sms.READ, 1)
                put(Telephony.Sms.SEEN, 1)
                put(Telephony.Sms.TYPE, Telephony.Sms.MESSAGE_TYPE_OUTBOX)
                put(Telephony.Sms.THREAD_ID, threadIdFor(ctx, listOf(addr)))
            }
            val row = ctx.contentResolver.insert(Telephony.Sms.CONTENT_URI, values) ?: continue
            written.add(row)
            val parts = sm.divideMessage(body)
            val sentIntents = ArrayList<PendingIntent>()
            parts.forEachIndexed { i, _ ->
                sentIntents.add(PendingIntent.getBroadcast(
                    ctx, (row.hashCode() * 31) + i,
                    Intent(ctx, SmsSentReceiver::class.java).setAction(ACTION_SENT).setData(row)
                        .putExtra("part", i).putExtra("parts", parts.size),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            }
            if (parts.size > 1) sm.sendMultipartTextMessage(addr, null, parts, sentIntents, null)
            else sm.sendTextMessage(addr, null, body, sentIntents.firstOrNull(), null)
        }
        return written
    }

    fun markThreadRead(ctx: Context, threadId: String) {
        val v = ContentValues().apply { put(Telephony.Sms.READ, 1); put(Telephony.Sms.SEEN, 1) }
        ctx.contentResolver.update(Telephony.Sms.CONTENT_URI, v, "${Telephony.Sms.THREAD_ID}=? AND ${Telephony.Sms.READ}=0", arrayOf(threadId))
        val mv = ContentValues().apply { put(Telephony.Mms.READ, 1); put(Telephony.Mms.SEEN, 1) }
        ctx.contentResolver.update(Telephony.Mms.CONTENT_URI, mv, "${Telephony.Mms.THREAD_ID}=? AND ${Telephony.Mms.READ}=0", arrayOf(threadId))
    }

    fun deleteThread(ctx: Context, threadId: String): Int =
        ctx.contentResolver.delete(Uri.parse("content://mms-sms/conversations/$threadId"), null, null)

    fun deleteMessage(ctx: Context, id: String): Int {
        val (kind, rowId) = id.split(':', limit = 2).let { (it.getOrNull(0) ?: "") to (it.getOrNull(1) ?: "") }
        val base = if (kind == "mms") Telephony.Mms.CONTENT_URI else Telephony.Sms.CONTENT_URI
        return ctx.contentResolver.delete(Uri.withAppendedPath(base, rowId), null, null)
    }

    /** Write an incoming SMS (the default app's job) and return its thread id. */
    fun storeIncoming(ctx: Context, address: String, body: String, sentAt: Long, subId: Int): Long {
        val threadId = threadIdFor(ctx, listOf(address))
        val values = ContentValues().apply {
            put(Telephony.Sms.ADDRESS, address)
            put(Telephony.Sms.BODY, body)
            put(Telephony.Sms.DATE, System.currentTimeMillis())
            put(Telephony.Sms.DATE_SENT, sentAt)
            put(Telephony.Sms.READ, 0)
            put(Telephony.Sms.SEEN, 0)
            put(Telephony.Sms.TYPE, Telephony.Sms.MESSAGE_TYPE_INBOX)
            put(Telephony.Sms.THREAD_ID, threadId)
            if (subId >= 0) put(Telephony.Sms.SUBSCRIPTION_ID, subId)
        }
        ctx.contentResolver.insert(Telephony.Sms.Inbox.CONTENT_URI, values)
        return threadId
    }
}
