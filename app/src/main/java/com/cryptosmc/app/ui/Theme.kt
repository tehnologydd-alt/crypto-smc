package com.cryptosmc.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape

private val IntelligenceColors = darkColorScheme(
    primary = Color(0xFF8B9CFF),
    onPrimary = Color(0xFF10152B),
    secondary = Color(0xFF55D6BE),
    onSecondary = Color(0xFF06251F),
    tertiary = Color(0xFFFFB86B),
    background = Color(0xFF090E18),
    onBackground = Color(0xFFEAF0FA),
    surface = Color(0xFF111A29),
    onSurface = Color(0xFFEAF0FA),
    surfaceVariant = Color(0xFF1A2638),
    onSurfaceVariant = Color(0xFFB2C0D4),
    outline = Color(0xFF34445C)
)

@Composable
fun CryptoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = IntelligenceColors,
        shapes = Shapes(
            extraSmall = RoundedCornerShape(8.dp),
            small = RoundedCornerShape(12.dp),
            medium = RoundedCornerShape(18.dp),
            large = RoundedCornerShape(24.dp),
            extraLarge = RoundedCornerShape(28.dp)
        ),
        content = content
    )
}
