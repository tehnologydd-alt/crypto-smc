package com.cryptosmc.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/** Заголовок экрана: название, подпись и действия справа. */
@Composable
fun ScreenHeader(
    title: String,
    subtitle: String? = null,
    actions: @Composable RowScope.() -> Unit = {}
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MutedColor)
            }
        }
        actions()
    }
}

/** Базовая карточка. Если задан onClick, вся карточка нажимается. */
@Composable
fun AppCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    containerColor: Color = CardColor,
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = MaterialTheme.shapes.large
    val clickMod = if (onClick != null) Modifier.clip(shape).clickable(onClick = onClick) else Modifier
    Surface(
        modifier = modifier.fillMaxWidth().then(clickMod),
        shape = shape,
        color = containerColor,
        border = BorderStroke(1.dp, CardBorder)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            content = content
        )
    }
}

/** Сворачиваемая карточка: заголовок, короткое резюме и содержимое по нажатию. */
@Composable
fun ExpandableCard(
    title: String,
    summary: String? = null,
    initiallyExpanded: Boolean = false,
    content: @Composable ColumnScope.() -> Unit
) {
    var expanded by rememberSaveable(title) { mutableStateOf(initiallyExpanded) }
    AppCard {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(MaterialTheme.shapes.small)
                .clickable { expanded = !expanded },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                if (summary != null) {
                    Text(summary, style = MaterialTheme.typography.bodySmall, color = MutedColor)
                }
            }
            Icon(
                imageVector = if (expanded) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                contentDescription = null,
                tint = MutedColor
            )
        }
        if (expanded) {
            content()
        }
    }
}

/** Цветная «таблетка» для статусов и изменений. */
@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.16f))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(text, color = color, style = MaterialTheme.typography.labelMedium)
    }
}

/** Плитка с одним показателем. */
@Composable
fun StatTile(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = Color.Unspecified
) {
    Column(
        modifier = modifier
            .clip(MaterialTheme.shapes.medium)
            .background(TileColor)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MutedColor)
        Text(value, style = MaterialTheme.typography.titleMedium, color = valueColor)
    }
}

/** Ряд плиток с равными долями. */
@Composable
fun TileRow(content: @Composable RowScope.() -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        content = content
    )
}

@Composable
fun KeyValueRow(label: String, value: String, valueColor: Color = Color.Unspecified) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MutedColor)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = valueColor,
            fontWeight = FontWeight.Medium
        )
    }
}

/** Мелкий поясняющий текст (ограничения, дисклеймеры). */
@Composable
fun NoteText(text: String, color: Color = MutedColor) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = color)
}

@Composable
fun EmptyState(title: String, text: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(
            text,
            style = MaterialTheme.typography.bodySmall,
            color = MutedColor,
            textAlign = TextAlign.Center
        )
    }
}

/** Горизонтальный ряд чипов для выбора одного значения. */
@Composable
fun <T> ChipRow(
    options: List<T>,
    selected: T,
    label: (T) -> String,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        options.forEach { option ->
            FilterChip(
                selected = option == selected,
                onClick = { onSelect(option) },
                label = { Text(label(option)) }
            )
        }
    }
}

/** Полоса уверенности 0-100. */
@Composable
fun ConfidenceBar(percent: Double, color: Color) {
    val fraction = (percent / 100.0).coerceIn(0.0, 1.0).toFloat()
    Box(
        Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(CardBorder)
    ) {
        Box(Modifier.fillMaxWidth(fraction).fillMaxHeight().background(color))
    }
}

/** Двухцветная полоса соотношения (покупатели и продавцы). */
@Composable
fun SplitBar(leftShare: Double, leftColor: Color, rightColor: Color) {
    val l = leftShare.coerceIn(0.02, 0.98).toFloat()
    Row(
        Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(4.dp))
    ) {
        Box(Modifier.weight(l).fillMaxHeight().background(leftColor))
        Box(Modifier.weight(1f - l).fillMaxHeight().background(rightColor))
    }
}

@Composable
fun AssetAvatar(symbol: String) {
    Box(
        modifier = Modifier.size(40.dp).clip(CircleShape).background(Color(0xFF1F2B47)),
        contentAlignment = Alignment.Center
    ) {
        Text(
            baseAsset(symbol).take(3),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(color))
        Text(label, style = MaterialTheme.typography.labelSmall, color = MutedColor)
    }
}

/** Легенда зон на графике MarketChart. */
@Composable
fun ChartLegend() {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        LegendDot(Color(0xFF39C98A), "FVG вверх")
        LegendDot(Color(0xFFEF6678), "FVG вниз")
        LegendDot(Color(0xFF47A7FF), "OB бычий")
        LegendDot(Color(0xFFFF9B54), "OB медвежий")
        LegendDot(Color(0xFFFF5252), "SL")
        LegendDot(Color(0xFF40C4FF), "TP")
    }
}

fun directionLabel(direction: String): String = when (direction) {
    "long" -> "BUY / LONG"
    "short" -> "SELL / SHORT"
    else -> "НЕЙТРАЛЬНО"
}

fun directionColor(direction: String): Color = when (direction) {
    "long" -> BullColor
    "short" -> BearColor
    else -> WarnColor
}
