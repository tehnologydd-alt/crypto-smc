package com.cryptosmc.app.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object IntelligencePalette {
    val background = Color(0xFF090E18)
    val surface = Color(0xFF151E2D)
    val surfaceRaised = Color(0xFF1B2738)
    val surfaceSoft = Color(0xFF202C3D)
    val primary = Color(0xFF91A8FF)
    val secondary = Color(0xFF55D6BE)
    val positive = Color(0xFF61D9A5)
    val negative = Color(0xFFFF7185)
    val warning = Color(0xFFFFC66D)
    val text = Color(0xFFEAF0FA)
    val muted = Color(0xFF9AAAC0)
    val outline = Color(0xFF34445C)
}

private val IntelligenceColors = darkColorScheme(
    primary = IntelligencePalette.primary,
    onPrimary = Color(0xFF10152B),
    secondary = IntelligencePalette.secondary,
    onSecondary = Color(0xFF06251F),
    tertiary = IntelligencePalette.warning,
    background = IntelligencePalette.background,
    onBackground = IntelligencePalette.text,
    surface = IntelligencePalette.surface,
    onSurface = IntelligencePalette.text,
    surfaceVariant = IntelligencePalette.surfaceRaised,
    onSurfaceVariant = IntelligencePalette.muted,
    outline = IntelligencePalette.outline,
    error = IntelligencePalette.negative
)

@Composable
fun CryptoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = IntelligenceColors,
        shapes = Shapes(
            extraSmall = RoundedCornerShape(9.dp),
            small = RoundedCornerShape(13.dp),
            medium = RoundedCornerShape(18.dp),
            large = RoundedCornerShape(23.dp),
            extraLarge = RoundedCornerShape(28.dp)
        ),
        typography = MaterialTheme.typography.copy(
            headlineSmall = TextStyle(fontSize = 25.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.4).sp),
            titleLarge = TextStyle(fontSize = 21.sp, fontWeight = FontWeight.SemiBold),
            titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
            bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
            labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.4.sp)
        ),
        content = content
    )
}
