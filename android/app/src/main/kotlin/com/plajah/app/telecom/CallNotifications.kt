package com.plajah.app.telecom

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.telecom.Call
import android.telecom.VideoProfile
import androidx.core.content.ContextCompat
import com.plajah.app.MainActivity
import com.plajah.app.R

/**
 * The call notification: full-screen intent + CallStyle while ringing (Answer / Decline), an
 * ongoing CallStyle (Hang up) while a call is live. Tapping it opens the web in-call screen.
 */
object CallNotifications {
    private const val CHANNEL_INCOMING = "plajah_calls_incoming"
    private const val CHANNEL_ONGOING = "plajah_calls_ongoing"
    private const val NOTIFICATION_ID = 7301

    const val ACTION_ANSWER = "com.plajah.app.telecom.ANSWER"
    const val ACTION_DECLINE = "com.plajah.app.telecom.DECLINE"
    const val ACTION_HANGUP = "com.plajah.app.telecom.HANGUP"

    fun openInCallUi(ctx: Context, callId: String) {
        try { ctx.startActivity(inCallIntent(ctx, callId).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { /* background-start blocked: notification covers it */ }
    }

    private fun inCallIntent(ctx: Context, callId: String) = Intent(ctx, MainActivity::class.java)
        .putExtra(PhoneIntents.EXTRA_OPEN_CALL, true)
        .putExtra("callId", callId)
        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)

    private fun ensureChannels(nm: NotificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (nm.getNotificationChannel(CHANNEL_INCOMING) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL_INCOMING, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
                // Telecom plays the ringtone; the channel itself stays silent so it never double-rings.
                setSound(null, null)
                enableVibration(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            })
        }
        if (nm.getNotificationChannel(CHANNEL_ONGOING) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL_ONGOING, "Ongoing calls", NotificationManager.IMPORTANCE_DEFAULT).apply {
                setSound(null, null)
                enableVibration(false)
            })
        }
    }

    fun refresh(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        val primary = CallRegistry.all()
            .sortedBy { (_, c) -> if (CallRegistry.callState(c) == Call.STATE_RINGING) 0 else 1 }
            .firstOrNull { (_, c) -> CallRegistry.callState(c) != Call.STATE_DISCONNECTED }
        if (primary == null) { nm.cancel(NOTIFICATION_ID); return }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        ensureChannels(nm)
        val (id, call) = primary
        val ringing = CallRegistry.callState(call) == Call.STATE_RINGING
        val d = call.details
        val label = (d.callerDisplayName ?: d.contactDisplayName)?.takeIf { it.isNotBlank() }
            ?: d.handle?.schemeSpecificPart?.takeIf { it.isNotBlank() } ?: "Unknown caller"

        val open = PendingIntent.getActivity(ctx, 1, inCallIntent(ctx, id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        fun action(a: String, req: Int) = PendingIntent.getBroadcast(
            ctx, req, Intent(ctx, CallActionReceiver::class.java).setAction(a).putExtra("callId", id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Notification.Builder(ctx, if (ringing) CHANNEL_INCOMING else CHANNEL_ONGOING)
        else @Suppress("DEPRECATION") Notification.Builder(ctx)
        b.setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(label)
            .setContentText(if (ringing) "Incoming call" else "Call in progress")
            .setContentIntent(open)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_CALL)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
        if (ringing) b.setFullScreenIntent(open, true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val person = Person.Builder().setName(label).setImportant(true).build()
            b.setStyle(
                if (ringing) Notification.CallStyle.forIncomingCall(person, action(ACTION_DECLINE, 3), action(ACTION_ANSWER, 2))
                else Notification.CallStyle.forOngoingCall(person, action(ACTION_HANGUP, 4))
            )
        } else {
            if (ringing) {
                b.addAction(Notification.Action.Builder(null, "Decline", action(ACTION_DECLINE, 3)).build())
                b.addAction(Notification.Action.Builder(null, "Answer", action(ACTION_ANSWER, 2)).build())
            } else {
                b.addAction(Notification.Action.Builder(null, "Hang up", action(ACTION_HANGUP, 4)).build())
            }
        }
        try { nm.notify(NOTIFICATION_ID, b.build()) } catch (_: SecurityException) { /* permission revoked mid-call */ }
    }
}

/** Answer / Decline / Hang up from the notification, without opening the app. */
class CallActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val call = CallRegistry.get(intent.getStringExtra("callId")) ?: return
        when (intent.action) {
            CallNotifications.ACTION_ANSWER -> {
                call.answer(VideoProfile.STATE_AUDIO_ONLY)
                CallNotifications.openInCallUi(context, CallRegistry.idOf(call) ?: "")
            }
            CallNotifications.ACTION_DECLINE -> call.reject(false, null)
            CallNotifications.ACTION_HANGUP -> call.disconnect()
        }
    }
}
