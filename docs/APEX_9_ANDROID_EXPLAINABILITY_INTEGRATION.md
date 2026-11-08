# APEX 9 — Explainability & Quality Integration

## Purpose
Connect asset passports and favorite cards directly to a manually requested, source-verified explanation for the same cryptoasset. The interaction does not trade or create suggestions; it only reads the device's existing H1 historical records and explains their validated research results.

## One tap from context
- The asset passport has a contextual quality status (initially "Историческая проверка не запускалась"), detail and an "Объяснить исследования" button.
- Each favorite card keeps its primary action that opens the passport and adds a separate accessible "Почему?" action that loads this favorite's explanation. Its tap must not bubble into the ordinary asset-open or favorite-remove action.
- Both call one openAssetExplanation handler, which synchronizes the chosen asset, forces the exact evidence-asset selector to that asset (dispatching the shared change event to invalidate stale audits), navigates to the Quality page's synthesis-panel, and starts the existing Research Synthesis read-only audit once. No hidden background audit is started simply by opening a passport or favorite.
- The Quality page's back action changes to "Актив" only for direct explain navigation and remains "Прогнозы" for normal navigation.
- All generated audit observations derive from the original complete H1 archive and existing validator. No stale cross-asset reports are carried to a newly chosen asset. The status is NOT_RUN, BLOCKED, PARTIAL or CHECKED, where CHECKED means only that source-backed historical audits completed; it is never a prediction reliability score.
- Switching the Quality asset or cancelling an audit clears pending reports and the passport's completion status, so another asset's figures cannot be shown under the wrong symbol.

## Engineering
research-quality-route.mjs is a pure, deterministic context/label helper with standalone tests for verified, incomplete, wrong asset and unknown ticker states. Existing Evidence Lab select gains a selectAsset API that resynchronizes the native analysis selector and raises change on actual changes; Synthesis UI gains openForAsset and completion callbacks. App navigation, favorites, CSS and Android bundling are updated. No new exchange APIs, native permissions, Room migrations, or persistent state introduced.

## Validation
CI runs all existing source integrity suites, HTML/navigation checks and new pure-route tests. On Android, verify a BTC favorite "Почему?" opens BTC Synthesis and that the back button returns to BTC's passport; repeat with ETH and a non-favorite asset. Check that a missing H1 archive never displays a checked status, that rapidly switching the selected asset cannot leak a previous report, and that normal Quality navigation still returns to Forecasts.
