package com.cryptosmc.app.ai

import kotlinx.serialization.Serializable

/**
 * Настройки одного AI-провайдера. Все провайдеры работают через
 * OpenAI-совместимый формат /chat/completions, поэтому добавить нового
 * можно без изменения кода: достаточно baseUrl, модели и ключа.
 */
@Serializable
data class ProviderConfig(
    val id: String,
    val name: String,
    val baseUrl: String,
    val model: String,
    val enabled: Boolean = false,
    val weight: Double = 1.0,
    val rpm: Int = 10,
    val dailyLimit: Int = 100,
    val timeoutSec: Int = 60
)

object ProviderPresets {
    // Названия моделей и адреса меняются со временем, поэтому всё редактируется в приложении.
    val defaults: List<ProviderConfig> = listOf(
        ProviderConfig("groq", "Groq", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
        ProviderConfig("gemini", "Google Gemini", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.0-flash"),
        ProviderConfig("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "meta-llama/llama-3.3-70b-instruct:free"),
        ProviderConfig("mistral", "Mistral", "https://api.mistral.ai/v1", "mistral-small-latest")
    )
}
