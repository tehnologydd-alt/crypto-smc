package com.cryptosmc.app.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Палитра приложения. Семантические цвета используются везде одинаково.
val BgColor = Color(0xFF0A0F1A)
val NavColor = Color(0xFF0F1626)
val CardColor = Color(0xFF131C2E)
val CardBorder = Color(0xFF223049)
val TileColor = Color(0xFF0E1627)
val BullColor = Color(0xFF2EE6A6)
val BearColor = Color(0xFFFF6B7A)
val WarnColor = Color(0xFFFFC857)
val InfoColor = Color(0xFF6EA8FF)
val MutedColor = Color(0xFF9AA6BD)

private val AppColors = darkColorScheme(
    primary = Color(0xFF3DDC97),
    onPrimary = Color(0xFF04241A),
    secondary = InfoColor,
    tertiary = WarnColor,
    background = BgColor,
    onBackground = Color(0xFFE8ECF4),
    surface = NavColor,
    onSurface = Color(0xFFE8ECF4),
    surfaceVariant = Color(0xFF1B2640),
    onSurfaceVariant = MutedColor,
    outline = Color(0xFF3A4766),
    outlineVariant = CardBorder,
    error = BearColor,
    surfaceContainer = NavColor,
    surfaceContainerHigh = CardColor,
    surfaceContainerHighest = Color(0xFF1A2540)
)

private val base = Typography()
private val AppTypography = Typography(
    headlineMedium = base.headlineMedium.copy(fontSize = 28.sp, fontWeight = FontWeight.Bold),
    titleLarge = base.titleLarge.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold),
    titleMedium = base.titleMedium.copy(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = base.titleSmall.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = base.bodyLarge.copy(fontSize = 15.sp),
    bodyMedium = base.bodyMedium.copy(fontSize = 14.sp),
    bodySmall = base.bodySmall.copy(fontSize = 12.sp),
    labelMedium = base.labelMedium.copy(fontSize = 12.sp, fontWeight = FontWeight.Medium),
    labelSmall = base.labelSmall.copy(fontSize = 11.sp)
)

private val AppShapes = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(18.dp)
)

@Composable
fun CryptoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AppColors,
        typography = AppTypography,
        shapes = AppShapes,
        content = content
    )
}
