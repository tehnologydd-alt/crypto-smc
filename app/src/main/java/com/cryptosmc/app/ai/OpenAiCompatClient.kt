package com.cryptosmc.app.ai

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** Универсальный клиент для любого OpenAI-совместимого API. */
object OpenAiCompatClient {

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val baseClient = OkHttpClient()

    suspend fun complete(
        cfg: ProviderConfig,
        apiKey: String,
        system: String,
        user: String
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val client = baseClient.newBuilder()
                .callTimeout(cfg.timeoutSec.toLong(), TimeUnit.SECONDS)
                .readTimeout(cfg.timeoutSec.toLong(), TimeUnit.SECONDS)
                .build()

            val body = buildJsonObject {
                put("model", cfg.model)
                put("temperature", 0.2)
                put("messages", buildJsonArray {
                    add(buildJsonObject {
                        put("role", "system")
                        put("content", system)
                    })
                    add(buildJsonObject {
                        put("role", "user")
                        put("content", user)
                    })
                })
            }.toString()

            val request = Request.Builder()
                .url(cfg.baseUrl.trimEnd('/') + "/chat/completions")
                .header("Authorization", "Bearer $apiKey")
                .post(body.toRequestBody(jsonMediaType))
                .build()

            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    error("HTTP ${response.code}: ${text.take(300)}")
                }
                Json.parseToJsonElement(text)
                    .jsonObject["choices"]!!
                    .jsonArray[0]
                    .jsonObject["message"]!!
                    .jsonObject["content"]!!
                    .jsonPrimitive.content
            }
        }
    }
}
