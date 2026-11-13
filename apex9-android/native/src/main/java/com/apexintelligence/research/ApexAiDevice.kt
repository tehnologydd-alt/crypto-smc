package com.apexintelligence.research

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URL
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.util.UUID
import javax.net.ssl.HttpsURLConnection

/**
 * Opt-in private APEX research pairing. RSA private key NEVER leaves Android Keystore.
 * The Cloudflare owner must approve the displayed code / fingerprint in D1.
 * No shared service token and no vendor API credential are shipped in the APK.
 */
object ApexAiDevice {
    private const val ORIGIN = "https://apex-ai-collective-device.apex9-research-lab.workers.dev"
    private const val ALIAS = "apex_ai_pair_rsa_pss_v1"
    private const val STORE = "apex_ai_pairing_v1"
    private val idPattern = Regex("^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$")
    private val rng = SecureRandom()

    private fun prefs(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(STORE, Context.MODE_PRIVATE)

    private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply {
        load(null)
    }

    private fun publicKey(): java.security.PublicKey {
        keyStore().getCertificate(ALIAS)?.publicKey?.let { return it }
        val generator = KeyPairGenerator.getInstance("RSA", "AndroidKeyStore")
        generator.initialize(
            KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                .setKeySize(2048)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PSS)
                .build()
        )
        return generator.generateKeyPair().public
    }

    private fun base64(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.NO_WRAP)

    private fun base64Url(bytes: ByteArray): String =
        Base64.encodeToString(bytes,
            Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    private fun request(path: String, method: String = "GET",
                        body: ByteArray? = null, headers: Map<String, String> = emptyMap()
    ): JSONObject {
        require((path == "/health" || path.startsWith("/v1/")) && !path.contains("://"))
        val conn = URL(ORIGIN + path).openConnection() as HttpsURLConnection
        try {
            conn.instanceFollowRedirects = false
            conn.requestMethod = method
            conn.connectTimeout = 6000
            // Model inference sometimes needs longer than one minute, especially
            // independent critic analysis. This is an explicit foreground user call.
            // Status, enrollment and budget checks retain short network timeouts.
            // Do not retry after timeout: a server attempt may be consumed already.
            conn.readTimeout = if (path == "/v1/agents/analyze" ||
                path == "/v1/agents/batch") 120_000 else 8_000
            conn.setRequestProperty("Accept", "application/json")
            for ((key, value) in headers) conn.setRequestProperty(key, value)
            if (body != null) {
                require(body.size <= 24_000) { "Evidence too large" }
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body) }
            }
            val status = conn.responseCode
            val input = if (status in 200..299) conn.inputStream else conn.errorStream
            if (input == null) return JSONObject().put("state", "HTTP_ERROR")
                .put("httpStatus", status)
            val output = ByteArrayOutputStream()
            input.use {
                val bytes = ByteArray(4096)
                while (true) {
                    val read = it.read(bytes)
                    if (read < 0) break
                    if (output.size() + read > 32_768)
                        return JSONObject().put("state", "RESPONSE_TOO_LARGE")
                            .put("httpStatus", status)
                    output.write(bytes, 0, read)
                }
            }
            val data = try {
                JSONObject(output.toString("UTF-8"))
            } catch (_: Exception) {
                JSONObject().put("state", "INVALID_SERVER_RESPONSE")
            }
            data.put("httpStatus", status)
            return data
        } finally {
            conn.disconnect()
        }
    }

    private fun knownId(ctx: Context): String? =
        prefs(ctx).getString("deviceId", null)?.takeIf { idPattern.matches(it) }

    fun enroll(ctx: Context): JSONObject {
        if (knownId(ctx) != null) return status(ctx)
        val key = base64(publicKey().encoded)
        val payload = JSONObject().put("publicKey", key)
            .toString().toByteArray(Charsets.UTF_8)
        val result = request("/v1/device/enroll", "POST", payload)
        val id = result.optString("deviceId")
        val code = result.optString("verificationCode")
        val fingerprint = result.optString("fingerprint")
        if (result.optString("state") == "PENDING_APPROVAL" &&
            idPattern.matches(id) && code.matches(Regex("^[A-F0-9]{10}$")) &&
            fingerprint.matches(Regex("^[A-F0-9]{16}$"))) {
            check(prefs(ctx).edit().putString("deviceId", id)
                .putString("verificationCode", code)
                .putString("fingerprint", fingerprint).commit())
        }
        return result
    }

    fun status(ctx: Context): JSONObject {
        val id = knownId(ctx) ?: return JSONObject().put("state", "NOT_PAIRED")
        val result = request("/v1/device/status?device=" + id)
        result.put("verificationCode", prefs(ctx).getString("verificationCode", ""))
        result.put("fingerprint", prefs(ctx).getString("fingerprint", ""))
        return result
    }

    private fun signed(ctx: Context, method: String, path: String,
                       body: ByteArray? = null): JSONObject {
        val id = knownId(ctx) ?: return JSONObject().put("state", "NOT_PAIRED")
        val privateKey = keyStore().getKey(ALIAS, null) as? java.security.PrivateKey
            ?: return JSONObject().put("state", "KEY_MISSING")
        val now = (System.currentTimeMillis() / 1000L).toString()
        val nonceBytes = ByteArray(24)
        rng.nextBytes(nonceBytes)
        val nonce = base64Url(nonceBytes)
        val hash = base64Url(MessageDigest.getInstance("SHA-256")
            .digest(body ?: ByteArray(0)))
        val canonical = listOf(method, path, now, nonce, hash).joinToString("\n")
        val signer = Signature.getInstance("SHA256withRSA/PSS")
        signer.initSign(privateKey)
        signer.update(canonical.toByteArray(Charsets.UTF_8))
        val headers = mapOf(
            "X-Apex-Device" to id,
            "X-Apex-Time" to now,
            "X-Apex-Nonce" to nonce,
            "X-Apex-Signature" to base64Url(signer.sign())
        )
        return request(path, method, body, headers)
    }

    /** Genuine public availability probe, not a claim that either model ran. */
    fun health(ctx: Context): JSONObject {
        val result = request("/health")
        val now = System.currentTimeMillis()
        val verified = result.optInt("httpStatus") == 200 &&
            result.optString("service") == "apex-ai-edge" &&
            result.optString("state") == "RUNNING"
        if (verified) {
            prefs(ctx).edit().putLong("lastHealthyAt", now).apply()
        }
        return JSONObject()
            .put("state", if (verified) "RUNNING" else "UNAVAILABLE")
            .put("mode", if (verified) result.optString("activity", "UNKNOWN") else "UNKNOWN")
            .put("checkedAt", now)
            .put("lastHealthyAt", prefs(ctx).getLong("lastHealthyAt", 0))
            .put("httpStatus", result.optInt("httpStatus"))
    }

    private fun rememberAudit(ctx: Context, role: String, response: JSONObject) {
        val now = System.currentTimeMillis()
        val ok = response.optInt("httpStatus") == 200 &&
            response.optString("state") in setOf("OBSERVED_MODEL_OUTPUT", "OBSERVED_MODEL_BATCH") &&
            response.optString("role") == role
        val state = if (ok) "MODEL_OUTPUT" else
            response.optString("error", response.optString("state", "UNKNOWN")).take(48)
        synchronized(this) {
            val store = prefs(ctx)
            val old = try {
                JSONArray(store.getString("auditEvents", "[]"))
            } catch (_: Exception) {
                JSONArray()
            }
            val events = JSONArray()
            events.put(JSONObject().put("at", now).put("role", role)
                .put("state", state).put("success", ok))
            for (i in 0 until minOf(old.length(), 7)) {
                val item = old.optJSONObject(i)
                if (item != null) events.put(item)
            }
            val editor = store.edit()
                .putLong("lastAuditAt_" + role, now)
                .putBoolean("lastAuditOk_" + role, ok)
                .putString("lastAuditState_" + role, state)
                .putLong("lastAuditElapsed_" + role,
                    response.optLong("elapsedMs", 0L).coerceIn(0L, 180_000L))
                .putString("auditEvents", events.toString())
            if (ok) {
                editor.putInt("successAudit_" + role,
                    store.getInt("successAudit_" + role, 0) + 1)
                    .putLong("lastAuditSuccessAt_" + role, now)
            }
            editor.apply()
        }
    }

    /** Only confirmed real responses are counted; no text/evidence is retained. */
    fun activity(ctx: Context): JSONObject {
        val store = prefs(ctx)
        fun model(role: String): JSONObject = JSONObject()
            .put("successCount", store.getInt("successAudit_" + role, 0))
            .put("lastAt", store.getLong("lastAuditAt_" + role, 0))
            .put("lastSuccessAt", store.getLong("lastAuditSuccessAt_" + role, 0))
            .put("lastOk", store.getBoolean("lastAuditOk_" + role, false))
            .put("lastState", store.getString("lastAuditState_" + role, "UNKNOWN"))
            .put("lastWaitMs", store.getLong("lastAuditElapsed_" + role, 0))
        val events = try {
            JSONArray(store.getString("auditEvents", "[]"))
        } catch (_: Exception) {
            JSONArray()
        }
        return JSONObject()
            .put("state", "LOCAL_AUDIT")
            .put("analyst", model("analyst"))
            .put("critic", model("critic"))
            .put("events", events)
            .put("scope", "THIS_ANDROID_INSTALLATION_ONLY")
    }

    /** Authenticated read-only quota status, never invokes a model. */
    fun budget(ctx: Context): JSONObject =
        signed(ctx, "GET", "/v1/budget/status")

    /** Only sends explicitly selected real evidence; never opens trading orders. */
    /** One explicit user tap, one Cloudflare request for 2–3 assets. */
    fun auditBatch(ctx: Context, role: String, items: JSONArray): JSONObject {
        require(role == "analyst" || role == "critic") { "Unknown model" }
        require(items.length() in 2..3) { "Batch requires two or three assets" }
        val seen = mutableSetOf<String>()
        val assetRule = Regex("^[A-Z0-9]{2,16}USDT$")
        for (i in 0 until items.length()) {
            val item=items.optJSONObject(i)
                ?: throw IllegalArgumentException("Invalid batch item")
            val asset=item.optString("asset","")
            val evidence=item.optJSONArray("evidence")
            require(assetRule.matches(asset) && seen.add(asset) &&
                evidence != null && evidence.length() in 1..4) {
                "Invalid batch evidence"
            }
            if(role=="critic") {
                require(item.optJSONObject("analyst")!=null) {
                    "Critic requires a previous analyst result"
                }
            } else require(!item.has("analyst")) {
                "Analyst must not receive unverified prior claims"
            }
        }
        val bytes=JSONObject().put("role",role).put("items",items)
            .toString().toByteArray(Charsets.UTF_8)
        require(bytes.size<=24_000) { "Batch exceeds safe input" }
        val sentAt=android.os.SystemClock.elapsedRealtime()
        val result=try {
            signed(ctx,"POST","/v1/agents/batch",bytes)
        }catch (_: java.net.SocketTimeoutException) {
            JSONObject().put("state","MODEL_RESPONSE_TIMEOUT")
                .put("elapsedMs",android.os.SystemClock.elapsedRealtime()-sentAt)
        }catch (_: java.io.IOException) {
            JSONObject().put("state","MODEL_NETWORK_UNAVAILABLE")
                .put("elapsedMs",android.os.SystemClock.elapsedRealtime()-sentAt)
        }
        rememberAudit(ctx,role,result)
        return result
    }

    fun audit(ctx: Context, role: String, evidence: JSONArray,
              analyst: JSONObject? = null): JSONObject {
        require(role == "analyst" || role == "critic") { "Unknown research role" }
        require(evidence.length() in 1..16) { "1..16 sources required" }
        val requestBody = JSONObject().put("role", role).put("evidence", evidence)
        if (analyst != null) {
            require(role == "critic") { "Only the critic can receive analyst claims" }
            val text = analyst.optString("text", "")
            val ids = analyst.optJSONArray("source_ids")
            val captured = analyst.optLong("captured_at", 0)
            require(text.length in 15..2400 && ids != null &&
                ids.length() in 1..5 && captured > 0) { "Invalid analyst claims" }
            val evidenceIds = (0 until evidence.length()).mapNotNull {
                evidence.optJSONObject(it)?.optString("source_id")
            }.toSet()
            val analystIds = (0 until ids.length()).map { ids.optString(it) }
            require(analystIds.all { it in evidenceIds } &&
                analystIds.toSet().size == analystIds.size) { "Unmatched sources" }
            requestBody.put("analyst", JSONObject().put("text", text)
                .put("source_ids", ids).put("captured_at", captured))
        }
        val payload = requestBody.toString().toByteArray(Charsets.UTF_8)
        val sentAt = android.os.SystemClock.elapsedRealtime()
        val result = try {
            signed(ctx, "POST", "/v1/agents/analyze", payload)
        } catch (_: java.net.SocketTimeoutException) {
            JSONObject().put("state", "MODEL_RESPONSE_TIMEOUT")
                .put("elapsedMs", android.os.SystemClock.elapsedRealtime() - sentAt)
        } catch (_: java.io.IOException) {
            JSONObject().put("state", "MODEL_NETWORK_UNAVAILABLE")
                .put("elapsedMs", android.os.SystemClock.elapsedRealtime() - sentAt)
        }
        // Failed attempts matter: the server may have already reserved a D1 slot.
        // Never mark a timeout as successful or automatically retry it.
        rememberAudit(ctx, role, result)
        return result
    }
}
