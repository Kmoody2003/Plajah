package com.plajah.app.telecom

import android.Manifest
import android.app.role.RoleManager
import android.content.ContentProviderOperation
import android.content.ContentUris
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.CallLog
import android.provider.ContactsContract
import android.provider.Telephony
import android.telecom.TelecomManager
import android.telecom.VideoProfile
import android.telephony.SubscriptionManager
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject

/**
 * Phone, texting and contacts for the web PhoneHub (JS: services/phone/telecom.ts).
 *
 * Roles: Plajah asks to become the default Phone app (ROLE_DIALER → PlajahInCallService gets every
 * carrier call) and the default SMS app (ROLE_SMS → SmsDeliverReceiver gets every text). Without
 * the roles, contacts + placing calls still work; call/SMS history needs the role on Play builds.
 *
 * Events (retained until a listener consumes them):
 *   calls       { calls[], muted, route, routes[] }  — any change to the live call list
 *   callEnded   { id, call }
 *   sms         { address, body, threadId }          — a text arrived (address "" = MMS notice)
 *   smsStatus   { rowId, status }                     — sent / failed
 *   phoneLaunch { kind: dial|sms|call, ... }          — OS asked us to dial / compose / show a call
 */
@CapacitorPlugin(
    name = "PlajahTelecom",
    permissions = [
        Permission(alias = "phone", strings = [Manifest.permission.CALL_PHONE, Manifest.permission.READ_PHONE_STATE, Manifest.permission.ANSWER_PHONE_CALLS]),
        Permission(alias = "contacts", strings = [Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS]),
        Permission(alias = "callLog", strings = [Manifest.permission.READ_CALL_LOG, Manifest.permission.WRITE_CALL_LOG]),
        Permission(alias = "sms", strings = [Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS, Manifest.permission.RECEIVE_SMS, Manifest.permission.RECEIVE_MMS]),
        Permission(alias = "notifications", strings = ["android.permission.POST_NOTIFICATIONS"]),
    ]
)
class PlajahTelecomPlugin : Plugin() {

    override fun load() { instance = this }

    override fun handleOnDestroy() {
        if (instance === this) instance = null
        super.handleOnDestroy()
    }

    // ── events ────────────────────────────────────────────────────────────────────────────────
    fun emitCalls(snapshot: JSObject) = notifyListeners("calls", snapshot, true)
    fun emitEnded(id: String, call: JSObject?) = notifyListeners("callEnded", JSObject().put("id", id).put("call", call ?: JSObject()), true)
    fun emitSms(address: String, body: String, threadId: String) =
        notifyListeners("sms", JSObject().put("address", address).put("body", body).put("threadId", threadId), true)
    fun emitSmsStatus(rowId: String, status: String) = notifyListeners("smsStatus", JSObject().put("rowId", rowId).put("status", status), true)
    fun emitLaunch(launch: JSONObject) = notifyListeners("phoneLaunch", JSObject.fromJSONObject(launch), true)
    fun emitRcs(threadKey: String, title: String, message: JSONObject) =
        notifyListeners("rcsMessage", JSObject().put("threadKey", threadKey).put("title", title).put("message", JSObject.fromJSONObject(message)), true)

    private fun ok(call: PluginCall, extra: JSObject = JSObject()) = call.resolve(extra.put("ok", true))
    private fun has(alias: String) = getPermissionState(alias) == PermissionState.GRANTED

    // ── capability + roles ────────────────────────────────────────────────────────────────────
    @PluginMethod
    fun getStatus(call: PluginCall) {
        val ctx = context
        val o = JSObject()
        val pm = ctx.packageManager
        o.put("hasTelephony", pm.hasSystemFeature("android.hardware.telephony"))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val rm = ctx.getSystemService(RoleManager::class.java)
            o.put("dialerRoleAvailable", rm?.isRoleAvailable(RoleManager.ROLE_DIALER) == true)
            o.put("smsRoleAvailable", rm?.isRoleAvailable(RoleManager.ROLE_SMS) == true)
            o.put("isDefaultDialer", rm?.isRoleHeld(RoleManager.ROLE_DIALER) == true)
            o.put("isDefaultSms", rm?.isRoleHeld(RoleManager.ROLE_SMS) == true)
        } else {
            val tm = ctx.getSystemService(TelecomManager::class.java)
            o.put("dialerRoleAvailable", true)
            o.put("smsRoleAvailable", true)
            o.put("isDefaultDialer", tm?.defaultDialerPackage == ctx.packageName)
            o.put("isDefaultSms", Telephony.Sms.getDefaultSmsPackage(ctx) == ctx.packageName)
        }
        val perms = JSObject()
        listOf("phone", "contacts", "callLog", "sms", "notifications").forEach { perms.put(it, getPermissionState(it)?.toString() ?: "prompt") }
        o.put("permissions", perms)
        call.resolve(o)
    }

    /** role: "dialer" | "sms". Shows the system "Set Plajah as default" sheet. */
    @PluginMethod
    fun requestRole(call: PluginCall) {
        val role = call.getString("role") ?: "dialer"
        val intent: Intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val rm = context.getSystemService(RoleManager::class.java) ?: return call.reject("RoleManager unavailable")
            val name = if (role == "sms") RoleManager.ROLE_SMS else RoleManager.ROLE_DIALER
            if (!rm.isRoleAvailable(name)) return call.reject("Role not available on this device")
            if (rm.isRoleHeld(name)) return call.resolve(JSObject().put("granted", true))
            rm.createRequestRoleIntent(name)
        } else if (role == "sms") {
            Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT).putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, context.packageName)
        } else {
            Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER).putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, context.packageName)
        }
        startActivityForResult(call, intent, "roleResult")
    }

    @ActivityCallback
    private fun roleResult(call: PluginCall?, result: ActivityResult) {
        call ?: return
        val role = call.getString("role") ?: "dialer"
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            context.getSystemService(RoleManager::class.java)
                ?.isRoleHeld(if (role == "sms") RoleManager.ROLE_SMS else RoleManager.ROLE_DIALER) == true
        } else result.resultCode == android.app.Activity.RESULT_OK
        call.resolve(JSObject().put("granted", granted))
    }

    /** Pull (cold start) the dial / compose / show-call request that opened the app. */
    @PluginMethod
    fun getPendingLaunch(call: PluginCall) {
        val p = PhoneIntents.pending
        PhoneIntents.pending = null
        call.resolve(JSObject().put("launch", p?.let { JSObject.fromJSONObject(it) }))
    }

    // ── calls ─────────────────────────────────────────────────────────────────────────────────
    @PluginMethod
    fun placeCall(call: PluginCall) {
        val number = call.getString("number")?.trim().orEmpty()
        if (number.isEmpty()) return call.reject("number required")
        if (!has("phone")) return requestPermissionForAlias("phone", call, "placeCallAfterPermission")
        doPlaceCall(call, number)
    }

    @PermissionCallback
    private fun placeCallAfterPermission(call: PluginCall) {
        if (!has("phone")) return call.reject("Phone permission denied")
        doPlaceCall(call, call.getString("number")!!.trim())
    }

    private fun doPlaceCall(call: PluginCall, number: String) {
        try {
            val tm = context.getSystemService(TelecomManager::class.java) ?: return call.reject("Telecom unavailable")
            val extras = Bundle()
            call.getBoolean("speaker")?.let { extras.putBoolean(TelecomManager.EXTRA_START_CALL_WITH_SPEAKERPHONE, it) }
            tm.placeCall(Uri.fromParts("tel", number, null), extras)
            ok(call)
        } catch (e: SecurityException) {
            call.reject("Not allowed to place calls: ${e.message}")
        }
    }

    @PluginMethod
    fun getCalls(call: PluginCall) = call.resolve(CallRegistry.snapshot())

    private fun liveCall(call: PluginCall) = CallRegistry.get(call.getString("id")).also { if (it == null) call.reject("No such call") }

    @PluginMethod fun answer(call: PluginCall) { liveCall(call)?.let { it.answer(if (call.getBoolean("video") == true) VideoProfile.STATE_BIDIRECTIONAL else VideoProfile.STATE_AUDIO_ONLY); ok(call) } }
    @PluginMethod fun reject(call: PluginCall) {
        liveCall(call)?.let { c ->
            val text = call.getString("message")
            if (text.isNullOrBlank()) c.reject(false, null) else c.reject(true, text)
            ok(call)
        }
    }
    @PluginMethod fun hangup(call: PluginCall) { liveCall(call)?.let { it.disconnect(); ok(call) } }
    @PluginMethod fun hold(call: PluginCall) { liveCall(call)?.let { if (call.getBoolean("on", true) == true) it.hold() else it.unhold(); ok(call) } }
    @PluginMethod fun merge(call: PluginCall) {
        liveCall(call)?.let { c ->
            val other = c.conferenceableCalls.firstOrNull()
            if (other != null) c.conference(other) else c.mergeConference()
            ok(call)
        }
    }
    @PluginMethod fun swap(call: PluginCall) { liveCall(call)?.let { it.swapConference(); ok(call) } }

    @PluginMethod
    fun dtmf(call: PluginCall) {
        val digit = call.getString("digit")?.firstOrNull() ?: return call.reject("digit required")
        liveCall(call)?.let { c -> c.playDtmfTone(digit); c.stopDtmfTone(); ok(call) }
    }

    @PluginMethod
    fun setMuted(call: PluginCall) {
        val svc = CallRegistry.service ?: return call.reject("No active call")
        svc.setMuted(call.getBoolean("muted", true) == true)
        ok(call)
    }

    /** route: earpiece | speaker | bluetooth | wired */
    @PluginMethod
    fun setAudioRoute(call: PluginCall) {
        val svc = CallRegistry.service ?: return call.reject("No active call")
        svc.setAudioRoute(CallRegistry.routeValue(call.getString("route") ?: "earpiece"))
        ok(call)
    }

    @PluginMethod
    fun getSims(call: PluginCall) {
        val list = JSArray()
        try {
            if (has("phone")) {
                context.getSystemService(SubscriptionManager::class.java)?.activeSubscriptionInfoList?.forEach { s ->
                    list.put(JSObject().put("subId", s.subscriptionId).put("label", s.displayName?.toString() ?: "SIM ${s.simSlotIndex + 1}").put("slot", s.simSlotIndex))
                }
            }
        } catch (_: SecurityException) { }
        call.resolve(JSObject().put("sims", list))
    }

    // ── call log ──────────────────────────────────────────────────────────────────────────────
    @PluginMethod
    fun getCallLog(call: PluginCall) {
        if (!has("callLog")) return requestPermissionForAlias("callLog", call, "callLogAfterPermission")
        resolveCallLog(call)
    }

    @PermissionCallback
    private fun callLogAfterPermission(call: PluginCall) {
        if (!has("callLog")) return call.reject("Call log permission denied")
        resolveCallLog(call)
    }

    private fun resolveCallLog(call: PluginCall) {
        val limit = call.getInt("limit", 200) ?: 200
        val number = call.getString("number")
        val out = JSArray()
        val sel = if (number.isNullOrBlank()) null else "${CallLog.Calls.NUMBER}=?"
        val args = if (number.isNullOrBlank()) null else arrayOf(number)
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            arrayOf(CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.CACHED_NAME, CallLog.Calls.TYPE,
                CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.NEW, CallLog.Calls.CACHED_PHOTO_URI),
            sel, args, "${CallLog.Calls.DATE} DESC"
        )?.use { c ->
            var n = 0
            while (c.moveToNext() && n++ < limit) {
                out.put(JSObject().apply {
                    put("id", c.getLong(0).toString())
                    put("number", c.getString(1) ?: "")
                    put("name", c.getString(2) ?: "")
                    put("type", when (c.getInt(3)) {
                        CallLog.Calls.INCOMING_TYPE -> "incoming"
                        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                        CallLog.Calls.MISSED_TYPE -> "missed"
                        CallLog.Calls.VOICEMAIL_TYPE -> "voicemail"
                        CallLog.Calls.REJECTED_TYPE -> "rejected"
                        CallLog.Calls.BLOCKED_TYPE -> "blocked"
                        else -> "other"
                    })
                    put("date", c.getLong(4))
                    put("duration", c.getLong(5))
                    put("isNew", c.getInt(6) != 0)
                    c.getString(7)?.let { put("photoUrl", contentUrl(it)) }
                })
            }
        }
        call.resolve(JSObject().put("entries", out))
    }

    @PluginMethod
    fun deleteCallLog(call: PluginCall) {
        if (!has("callLog")) return call.reject("Call log permission missing")
        val ids = call.getArray("ids")?.toList<Any>()?.map { it.toString() } ?: emptyList()
        var deleted = 0
        ids.forEach { deleted += context.contentResolver.delete(CallLog.Calls.CONTENT_URI, "${CallLog.Calls._ID}=?", arrayOf(it)) }
        ok(call, JSObject().put("deleted", deleted))
    }

    // ── contacts ──────────────────────────────────────────────────────────────────────────────
    private fun contentUrl(uri: String): String =
        if (uri.startsWith("content://")) "/_capacitor_content_" + uri.removePrefix("content:/") else uri

    @PluginMethod
    fun getContacts(call: PluginCall) {
        if (!has("contacts")) return requestPermissionForAlias("contacts", call, "contactsAfterPermission")
        resolveContacts(call)
    }

    @PermissionCallback
    private fun contactsAfterPermission(call: PluginCall) {
        if (!has("contacts")) return call.reject("Contacts permission denied")
        resolveContacts(call)
    }

    private fun resolveContacts(call: PluginCall) {
        val byId = LinkedHashMap<Long, JSObject>()
        val phones = HashMap<Long, JSArray>()
        val emails = HashMap<Long, JSArray>()
        val onlyId = call.getString("id")?.toLongOrNull()
        val sel = StringBuilder("${ContactsContract.Data.MIMETYPE} IN (?,?,?,?)")
        val args = arrayListOf(
            ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE,
        )
        if (onlyId != null) { sel.append(" AND ${ContactsContract.Data.CONTACT_ID}=?"); args.add(onlyId.toString()) }
        context.contentResolver.query(
            ContactsContract.Data.CONTENT_URI,
            arrayOf(ContactsContract.Data.CONTACT_ID, ContactsContract.Data.MIMETYPE, ContactsContract.Data.DATA1,
                ContactsContract.Data.DATA2, ContactsContract.Data.DATA3, ContactsContract.Data.DISPLAY_NAME_PRIMARY,
                ContactsContract.Data.PHOTO_THUMBNAIL_URI, ContactsContract.Data.STARRED, ContactsContract.Data.LOOKUP_KEY,
                ContactsContract.Data.DATA5),
            sel.toString(), args.toTypedArray(), "${ContactsContract.Data.DISPLAY_NAME_PRIMARY} COLLATE NOCASE ASC"
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                val o = byId.getOrPut(id) {
                    JSObject().apply {
                        put("id", id.toString())
                        put("lookupKey", c.getString(8) ?: "")
                        put("displayName", c.getString(5) ?: "")
                        put("starred", c.getInt(7) != 0)
                        c.getString(6)?.let { put("photoUrl", contentUrl(it)) }
                    }
                }
                when (c.getString(1)) {
                    ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE -> phones.getOrPut(id) { JSArray() }.put(JSObject()
                        .put("number", c.getString(2) ?: "")
                        .put("label", ContactsContract.CommonDataKinds.Phone.getTypeLabel(context.resources, c.getInt(3), c.getString(4) ?: "").toString()))
                    ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE -> emails.getOrPut(id) { JSArray() }.put(JSObject()
                        .put("address", c.getString(2) ?: "")
                        .put("label", ContactsContract.CommonDataKinds.Email.getTypeLabel(context.resources, c.getInt(3), c.getString(4) ?: "").toString()))
                    ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE -> {
                        o.put("givenName", c.getString(3) ?: "")
                        o.put("familyName", c.getString(4) ?: "")
                    }
                    ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE -> {
                        o.put("organization", c.getString(2) ?: "")
                        o.put("jobTitle", c.getString(4) ?: "")
                    }
                }
            }
        }
        val out = JSArray()
        byId.forEach { (id, o) ->
            o.put("phones", phones[id] ?: JSArray())
            o.put("emails", emails[id] ?: JSArray())
            out.put(o)
        }
        call.resolve(JSObject().put("contacts", out))
    }

    /** Create or update. { id?, givenName, familyName, organization?, phones:[{number,label}], emails:[{address,label}], starred? } */
    @PluginMethod
    fun saveContact(call: PluginCall) {
        if (!has("contacts")) return call.reject("Contacts permission missing")
        val ops = ArrayList<ContentProviderOperation>()
        val contactId = call.getString("id")?.toLongOrNull()
        val given = call.getString("givenName") ?: ""
        val family = call.getString("familyName") ?: ""
        val org = call.getString("organization") ?: ""
        val phones = call.getArray("phones")?.toList<JSONObject>() ?: emptyList()
        val emails = call.getArray("emails")?.toList<JSONObject>() ?: emptyList()

        var rawId: Long? = null
        if (contactId != null) {
            rawId = context.contentResolver.query(ContactsContract.RawContacts.CONTENT_URI, arrayOf(ContactsContract.RawContacts._ID),
                "${ContactsContract.RawContacts.CONTACT_ID}=?", arrayOf(contactId.toString()), null)?.use { if (it.moveToFirst()) it.getLong(0) else null }
            if (rawId == null) return call.reject("Contact not found")
            // Replace the editable kinds wholesale on that raw contact.
            ops.add(ContentProviderOperation.newDelete(ContactsContract.Data.CONTENT_URI)
                .withSelection("${ContactsContract.Data.RAW_CONTACT_ID}=? AND ${ContactsContract.Data.MIMETYPE} IN (?,?,?,?)",
                    arrayOf(rawId.toString(),
                        ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE,
                        ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE,
                        ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE,
                        ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE)).build())
        } else {
            ops.add(ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
                .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, null)
                .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, null).build())
        }
        fun dataInsert(): ContentProviderOperation.Builder {
            val b = ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
            return if (rawId != null) b.withValue(ContactsContract.Data.RAW_CONTACT_ID, rawId) else b.withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
        }
        ops.add(dataInsert()
            .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
            .withValue(ContactsContract.CommonDataKinds.StructuredName.GIVEN_NAME, given)
            .withValue(ContactsContract.CommonDataKinds.StructuredName.FAMILY_NAME, family).build())
        if (org.isNotBlank()) ops.add(dataInsert()
            .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE)
            .withValue(ContactsContract.CommonDataKinds.Organization.COMPANY, org).build())
        phones.filter { it.optString("number").isNotBlank() }.forEach { p ->
            ops.add(dataInsert()
                .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, p.optString("number"))
                .withValue(ContactsContract.CommonDataKinds.Phone.TYPE, phoneType(p.optString("label"))).build())
        }
        emails.filter { it.optString("address").isNotBlank() }.forEach { e ->
            ops.add(dataInsert()
                .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE)
                .withValue(ContactsContract.CommonDataKinds.Email.ADDRESS, e.optString("address"))
                .withValue(ContactsContract.CommonDataKinds.Email.TYPE, emailType(e.optString("label"))).build())
        }
        try {
            val results = context.contentResolver.applyBatch(ContactsContract.AUTHORITY, ops)
            val finalRaw = rawId ?: results.firstOrNull()?.uri?.let { ContentUris.parseId(it) }
            val newContactId = contactId ?: finalRaw?.let { r ->
                context.contentResolver.query(ContactsContract.RawContacts.CONTENT_URI, arrayOf(ContactsContract.RawContacts.CONTACT_ID),
                    "${ContactsContract.RawContacts._ID}=?", arrayOf(r.toString()), null)?.use { if (it.moveToFirst()) it.getLong(0) else null }
            }
            call.getBoolean("starred")?.let { s ->
                newContactId?.let { id ->
                    context.contentResolver.update(ContactsContract.Contacts.CONTENT_URI,
                        android.content.ContentValues().apply { put(ContactsContract.Contacts.STARRED, if (s) 1 else 0) },
                        "${ContactsContract.Contacts._ID}=?", arrayOf(id.toString()))
                }
            }
            ok(call, JSObject().put("id", newContactId?.toString() ?: ""))
        } catch (e: Exception) {
            call.reject("Could not save contact: ${e.message}")
        }
    }

    private fun phoneType(label: String) = when (label.lowercase()) {
        "home" -> ContactsContract.CommonDataKinds.Phone.TYPE_HOME
        "work" -> ContactsContract.CommonDataKinds.Phone.TYPE_WORK
        "main" -> ContactsContract.CommonDataKinds.Phone.TYPE_MAIN
        else -> ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE
    }

    private fun emailType(label: String) = when (label.lowercase()) {
        "work" -> ContactsContract.CommonDataKinds.Email.TYPE_WORK
        "other" -> ContactsContract.CommonDataKinds.Email.TYPE_OTHER
        else -> ContactsContract.CommonDataKinds.Email.TYPE_HOME
    }

    @PluginMethod
    fun deleteContact(call: PluginCall) {
        if (!has("contacts")) return call.reject("Contacts permission missing")
        val id = call.getString("id") ?: return call.reject("id required")
        val n = context.contentResolver.delete(ContactsContract.RawContacts.CONTENT_URI, "${ContactsContract.RawContacts.CONTACT_ID}=?", arrayOf(id))
        ok(call, JSObject().put("deleted", n))
    }

    // ── SMS ───────────────────────────────────────────────────────────────────────────────────
    @PluginMethod
    fun getThreads(call: PluginCall) {
        if (!has("sms")) return requestPermissionForAlias("sms", call, "threadsAfterPermission")
        call.resolve(JSObject().put("threads", SmsStore.threads(context, call.getInt("limit", 200) ?: 200)))
    }

    @PermissionCallback
    private fun threadsAfterPermission(call: PluginCall) {
        if (!has("sms")) return call.reject("SMS permission denied")
        call.resolve(JSObject().put("threads", SmsStore.threads(context, call.getInt("limit", 200) ?: 200)))
    }

    @PluginMethod
    fun getMessages(call: PluginCall) {
        if (!has("sms")) return call.reject("SMS permission missing")
        val threadId = call.getString("threadId") ?: call.getArray("addresses")?.toList<String>()?.let {
            SmsStore.threadIdFor(context, it).toString()
        } ?: return call.reject("threadId or addresses required")
        val limit = call.getInt("limit", 80) ?: 80
        val before = call.getLong("before") ?: 0L
        call.resolve(JSObject().put("threadId", threadId).put("messages", SmsStore.messages(context, threadId, limit, before)))
    }

    @PluginMethod
    fun sendSms(call: PluginCall) {
        if (!has("sms")) return call.reject("SMS permission missing")
        val to = call.getArray("addresses")?.toList<String>()?.filter { it.isNotBlank() } ?: emptyList()
        val body = call.getString("body") ?: ""
        if (to.isEmpty() || body.isBlank()) return call.reject("addresses and body required")
        try {
            val rows = SmsStore.send(context, to, body, call.getInt("subId"))
            ok(call, JSObject().put("threadId", SmsStore.threadIdFor(context, to.take(1)).toString())
                .put("rowIds", JSArray(rows.map { it.lastPathSegment ?: "" })))
        } catch (e: Exception) {
            call.reject("Send failed: ${e.message}")
        }
    }

    @PluginMethod
    fun markThreadRead(call: PluginCall) {
        val id = call.getString("threadId") ?: return call.reject("threadId required")
        try { SmsStore.markThreadRead(context, id); ok(call) } catch (e: Exception) { call.reject(e.message) }
    }

    @PluginMethod
    fun deleteThread(call: PluginCall) {
        val id = call.getString("threadId") ?: return call.reject("threadId required")
        try { ok(call, JSObject().put("deleted", SmsStore.deleteThread(context, id))) } catch (e: Exception) { call.reject(e.message) }
    }

    @PluginMethod
    fun deleteMessage(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        try { ok(call, JSObject().put("deleted", SmsStore.deleteMessage(context, id))) } catch (e: Exception) { call.reject(e.message) }
    }

    // ── RCS via notifications (RcsBridge.kt) ─────────────────────────────────────────────────
    @PluginMethod
    fun rcsBridgeStatus(call: PluginCall) {
        val pm = context.packageManager
        val gm = try { pm.getPackageInfo("com.google.android.apps.messaging", 0); true } catch (_: Exception) { false }
        val sm = try { pm.getPackageInfo("com.samsung.android.messaging", 0); true } catch (_: Exception) { false }
        call.resolve(JSObject()
            .put("enabled", RcsStore.isEnabled(context))
            .put("googleMessagesInstalled", gm)
            .put("samsungMessagesInstalled", sm)
            .put("defaultSmsPackage", Telephony.Sms.getDefaultSmsPackage(context) ?: ""))
    }

    @PluginMethod
    fun openNotificationAccessSettings(call: PluginCall) {
        try {
            val i = Intent("android.settings.NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
            ok(call)
        } catch (e: Exception) { call.reject("Settings unavailable: ${e.message}") }
    }

    /** Hand the default SMS role back (e.g. to Google Messages, so RCS works there and in the bridge). */
    @PluginMethod
    fun openDefaultAppsSettings(call: PluginCall) {
        try {
            context.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            ok(call)
        } catch (e: Exception) { call.reject("Settings unavailable: ${e.message}") }
    }

    @PluginMethod
    fun listRcsThreads(call: PluginCall) {
        RcsStore.load(context)
        call.resolve(JSObject().put("threads", RcsStore.threadsJson()))
    }

    @PluginMethod
    fun getRcsMessages(call: PluginCall) {
        val key = call.getString("threadKey") ?: return call.reject("threadKey required")
        RcsStore.load(context)
        call.resolve(JSObject().put("messages", RcsStore.messagesJson(key)).put("canReply", RcsStore.canReply(key)))
    }

    @PluginMethod
    fun sendRcsReply(call: PluginCall) {
        val key = call.getString("threadKey") ?: return call.reject("threadKey required")
        val text = call.getString("text")?.trim().orEmpty()
        if (text.isEmpty()) return call.reject("text required")
        call.resolve(JSObject().put("ok", RcsStore.reply(context, key, text)))
    }

    @PluginMethod
    fun markRcsRead(call: PluginCall) {
        val key = call.getString("threadKey") ?: return call.reject("threadKey required")
        RcsStore.markRead(context, key); ok(call)
    }

    @PluginMethod
    fun deleteRcsThread(call: PluginCall) {
        val key = call.getString("threadKey") ?: return call.reject("threadKey required")
        RcsStore.deleteThread(context, key); ok(call)
    }

    companion object {
        @Volatile var instance: PlajahTelecomPlugin? = null
    }
}

