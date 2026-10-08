package com.plajah.app.speakers

import android.util.Log
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.EOFException
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * One CASTV2 connection to a Cast receiver (speaker, TV or multi-room group leader).
 *
 * Wire format: TLS stream of frames, each a 4-byte big-endian length followed by a protobuf
 * `CastMessage` {1 protocol_version, 2 source_id, 3 destination_id, 4 namespace, 5 payload_type,
 * 6 payload_utf8}. Only STRING (JSON) payloads are used, so the protobuf is hand-encoded here —
 * no protobuf dependency. Validated against a JBL Authentics 200 and a Google Cast Group leader.
 *
 * Cast receivers present self-signed device certificates, so this socket (and only this socket)
 * uses a trust-all SSLContext. The trust manager never leaves this class.
 *
 * Threading: [open] blocks (call it off the main thread); a dedicated reader thread delivers
 * every inbound message and the final close to [Listener]. [send] is safe from any thread.
 */
class CastChannel(
    private val host: String,
    private val port: Int,
    private val listener: Listener,
) {
    interface Listener {
        fun onMessage(channel: CastChannel, namespace: String, sourceId: String, payload: JSONObject)
        /** Exactly once, after [open] succeeded: socket dropped, peer closed, or [close] called. */
        fun onClosed(channel: CastChannel, error: String?)
    }

    @Volatile private var socket: SSLSocket? = null
    @Volatile private var out: OutputStream? = null
    @Volatile private var closedByUs = false
    @Volatile var lastInboundAt = 0L
        private set

    val isOpen: Boolean get() = socket?.isClosed == false && !closedByUs

    /** Blocking TLS connect + handshake, then starts the reader thread. Throws on failure. */
    fun open(connectTimeoutMs: Int = 5000) {
        val raw = Socket()
        raw.tcpNoDelay = true
        raw.connect(InetSocketAddress(host, port), connectTimeoutMs)
        val ssl = trustAllContext().socketFactory.createSocket(raw, host, port, true) as SSLSocket
        ssl.soTimeout = connectTimeoutMs
        ssl.startHandshake()
        ssl.soTimeout = 0 // liveness is the heartbeat's job, not a read timeout mid-frame
        socket = ssl
        out = ssl.outputStream
        lastInboundAt = System.currentTimeMillis()
        Thread({ readLoop(ssl) }, "PlajahCast-$host:$port").apply { isDaemon = true }.start()
    }

    fun send(namespace: String, destinationId: String, payload: JSONObject, sourceId: String = SENDER_ID): Boolean {
        val o = out ?: return false
        val frame = CastProto.frame(sourceId, destinationId, namespace, payload.toString())
        return try {
            synchronized(this) { o.write(frame); o.flush() }
            true
        } catch (t: Throwable) {
            Log.w(TAG, "send failed ($host:$port $namespace): ${t.message}")
            try { socket?.close() } catch (_: Throwable) { }
            false
        }
    }

    fun close() {
        if (closedByUs) return
        closedByUs = true
        try { socket?.close() } catch (_: Throwable) { }
    }

    private fun readLoop(s: SSLSocket) {
        var err: String? = null
        try {
            val input = DataInputStream(s.inputStream)
            while (true) {
                val len = input.readInt()
                if (len < 0 || len > MAX_FRAME) throw IllegalStateException("bad frame length $len")
                val buf = ByteArray(len)
                input.readFully(buf)
                lastInboundAt = System.currentTimeMillis()
                val msg = CastProto.decode(buf) ?: continue
                val text = msg.payloadUtf8 ?: continue
                val json = try { JSONObject(text) } catch (_: Throwable) { continue }
                try { listener.onMessage(this, msg.namespace, msg.sourceId, json) } catch (t: Throwable) {
                    Log.w(TAG, "listener threw", t)
                }
            }
        } catch (_: EOFException) {
            err = if (closedByUs) null else "peer closed"
        } catch (t: Throwable) {
            err = if (closedByUs) null else (t.message ?: t.javaClass.simpleName)
        } finally {
            try { s.close() } catch (_: Throwable) { }
            out = null
            listener.onClosed(this, err)
        }
    }

    companion object {
        private const val TAG = "PlajahCast"
        const val SENDER_ID = "sender-0"
        const val RECEIVER_ID = "receiver-0"
        const val NS_CONNECTION = "urn:x-cast:com.google.cast.tp.connection"
        const val NS_HEARTBEAT = "urn:x-cast:com.google.cast.tp.heartbeat"
        const val NS_RECEIVER = "urn:x-cast:com.google.cast.receiver"
        const val NS_MEDIA = "urn:x-cast:com.google.cast.media"
        private const val MAX_FRAME = 1 shl 20

        /** Scoped to Cast device sockets: receivers use self-signed device certificates. */
        private fun trustAllContext(): SSLContext {
            val tm = object : X509TrustManager {
                override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) { }
                override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                    if (chain.isNullOrEmpty()) throw java.security.cert.CertificateException("no certificate")
                }
                override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
            }
            return SSLContext.getInstance("TLS").apply { init(null, arrayOf<TrustManager>(tm), SecureRandom()) }
        }
    }
}

/** Minimal hand-rolled protobuf codec for `extensions.api.cast_channel.CastMessage`. */
internal object CastProto {
    class Msg(val sourceId: String, val destinationId: String, val namespace: String, val payloadUtf8: String?)

    fun frame(src: String, dst: String, ns: String, payload: String): ByteArray {
        val body = ByteArrayOutputStream()
        body.write(0x08); body.write(0)           // 1: protocol_version = CASTV2_1_0
        writeString(body, 2, src)
        writeString(body, 3, dst)
        writeString(body, 4, ns)
        body.write(0x28); body.write(0)           // 5: payload_type = STRING
        writeString(body, 6, payload)
        val b = body.toByteArray()
        val out = ByteArrayOutputStream(b.size + 4)
        out.write((b.size ushr 24) and 0xff); out.write((b.size ushr 16) and 0xff)
        out.write((b.size ushr 8) and 0xff); out.write(b.size and 0xff)
        out.write(b)
        return out.toByteArray()
    }

    private fun writeVarint(out: ByteArrayOutputStream, value: Long) {
        var v = value
        while (v and 0x7fL.inv() != 0L) { out.write(((v and 0x7f) or 0x80).toInt()); v = v ushr 7 }
        out.write(v.toInt())
    }

    private fun writeString(out: ByteArrayOutputStream, field: Int, s: String) {
        val d = s.toByteArray(Charsets.UTF_8)
        writeVarint(out, ((field shl 3) or 2).toLong())
        writeVarint(out, d.size.toLong())
        out.write(d)
    }

    fun decode(b: ByteArray): Msg? {
        var i = 0
        fun varint(): Long {
            var r = 0L; var shift = 0
            while (true) {
                if (i >= b.size) throw IllegalStateException("truncated varint")
                val c = b[i++].toInt() and 0xff
                r = r or ((c and 0x7f).toLong() shl shift)
                if (c and 0x80 == 0) return r
                shift += 7
                if (shift > 63) throw IllegalStateException("varint overflow")
            }
        }
        var src = ""; var dst = ""; var ns = ""; var payload: String? = null
        return try {
            while (i < b.size) {
                val key = varint()
                val field = (key ushr 3).toInt()
                when ((key and 7).toInt()) {
                    0 -> varint()
                    1 -> i += 8
                    5 -> i += 4
                    2 -> {
                        val len = varint().toInt()
                        if (len < 0 || i + len > b.size) return null
                        val s = String(b, i, len, Charsets.UTF_8)
                        i += len
                        when (field) { 2 -> src = s; 3 -> dst = s; 4 -> ns = s; 6 -> payload = s }
                    }
                    else -> return null
                }
            }
            Msg(src, dst, ns, payload)
        } catch (_: Throwable) { null }
    }
}
