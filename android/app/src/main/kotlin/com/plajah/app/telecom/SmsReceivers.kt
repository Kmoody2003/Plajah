package com.plajah.app.telecom

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.provider.Telephony
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.plajah.app.MainActivity
import com.plajah.app.R

/** SMS_DELIVER — only the default SMS app gets it, and it must store the message itself. */
class SmsDeliverReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_DELIVER_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (parts.isEmpty()) return
        val address = parts[0].displayOriginatingAddress ?: parts[0].originatingAddress ?: ""
        val body = parts.joinToString("") { it.displayMessageBody ?: it.messageBody ?: "" }
        val subId = intent.getIntExtra("subscription", intent.getIntExtra("android.telephony.extra.SUBSCRIPTION_INDEX", -1))
        val threadId = try {
            SmsStore.storeIncoming(context, address, body, parts[0].timestampMillis, subId)
        } catch (_: Exception) { -1L }
        PlajahTelecomPlugin.instance?.emitSms(address, body, threadId.toString())
        SmsNotifications.notifyIncoming(context, address, body, threadId)
    }
}

/**
 * WAP_PUSH_DELIVER (MMS notification). Required for ROLE_SMS. Full MMS download (PDU parse +
 * SmsManager.downloadMultimediaMessage) is phase 2; for now the user is told an MMS arrived and the
 * carrier-side download happens when they open it in a phase-2 build.
 */
class MmsWapPushReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.WAP_PUSH_DELIVER_ACTION) return
        PlajahTelecomPlugin.instance?.emitSms("", "", "")
        SmsNotifications.notifyIncoming(context, "Picture message", "New multimedia message", -1L)
    }
}

/** Result of each sent SMS part: flips the provider row OUTBOX → SENT / FAILED. */
class SmsSentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val row = intent.data ?: return
        val ok = resultCode == Activity.RESULT_OK
        val last = intent.getIntExtra("part", 0) >= intent.getIntExtra("parts", 1) - 1
        if (!ok || last) {
            try {
                context.contentResolver.update(row, ContentValues().apply {
                    put(Telephony.Sms.TYPE, if (ok) Telephony.Sms.MESSAGE_TYPE_SENT else Telephony.Sms.MESSAGE_TYPE_FAILED)
                }, null, null)
            } catch (_: Exception) { /* row deleted meanwhile */ }
            PlajahTelecomPlugin.instance?.emitSmsStatus(row.lastPathSegment ?: "", if (ok) "sent" else "failed")
        }
    }
}

/** "Respond via message" from the incoming-call screen (quick replies). Required for ROLE_SMS. */
class HeadlessSmsSendService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            if (intent?.action == "android.intent.action.RESPOND_VIA_MESSAGE") {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                val ssp = intent.data?.schemeSpecificPart ?: ""
                val to = ssp.substringBefore('?').split(',', ';').map { it.trim() }.filter { it.isNotEmpty() }
                if (!text.isNullOrBlank() && to.isNotEmpty()) SmsStore.send(this, to, text, null)
            }
        } catch (_: Exception) { /* nothing to report to: the call UI already moved on */ }
        stopSelf(startId)
        return START_NOT_STICKY
    }
}

object SmsNotifications {
    private const val CHANNEL = "plajah_sms"

    fun notifyIncoming(ctx: Context, from: String, body: String, threadId: Long) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Text messages", NotificationManager.IMPORTANCE_HIGH))
        }
        val open = Intent(ctx, MainActivity::class.java)
            .setAction(Intent.ACTION_SENDTO)
            .setData(android.net.Uri.fromParts("smsto", from, null))
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pi = PendingIntent.getActivity(ctx, threadId.toInt(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(from)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        try { nm.notify(("sms:$threadId").hashCode(), n) } catch (_: SecurityException) { }
    }
}
