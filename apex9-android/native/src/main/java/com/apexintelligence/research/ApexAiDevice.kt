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
        require(path.startsWith("/v1/") && !path.contains("://"))
        val conn = URL(ORIGIN + path).openConnection() as HttpsURLConnection
        try {
            conn.instanceFollowRedirects = false
            conn.requestMethod = method
            conn.connectTimeout = 6000
            conn.readTimeout = 8000
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

    /** Authenticated read-only quota status, never invokes a model. */
    fun budget(ctx: Context): JSONObject =
        signed(ctx, "GET", "/v1/budget/status")

    /** Only sends explicitly selected real evidence; never opens trading orders. */
    fun audit(ctx: Context, role: String, evidence: JSONArray): JSONObject {
        require(role == "analyst" || role == "critic") { "Unknown research role" }
        require(evidence.length() in 1..16) { "1..16 sources required" }
        val payload = JSONObject().put("role", role).put("evidence", evidence)
            .toString().toByteArray(Charsets.UTF_8)
        return signed(ctx, "POST", "/v1/agents/analyze", payload)
    }
}
