# APEX Android First — Evidence Lab Accessibility & Navigation Fix

## Issue
After the 9.0.196 interface renovation, users could not find **Качество исследований** where expected: the complete Evidence Lab and Research Validation panels had been moved to the bottom of Overview, rather than remaining discoverable from Forecasts.

## Resolution
- The full original `Evidence Lab` card (data integrity, source freshness, archived forward outcome audit) and nested `Research Validation` card (three historical H1 periods against fixed baseline) are **moved without copying or rebuilding** into one dedicated `view-quality` page.
- A prominent shortcut appears immediately beneath the Forecasts introduction and above the long forecast journal. Secondary Overview shortcut is compact; no duplicated full panels on Overview.
- The quality page has a visible **Прогнозы** back control; the Forecasts bottom tab remains selected on the subpage.
- Navigating to quality calls the existing `evidenceDashboard.open()` to refresh the available asset choices. User-triggered local audits and historic validation keep their existing controls, previously saved records and precise limitations. No extra API usage is required for these tests.
- No Android Room schema change, database reset, new permission or package ID change. Existing Favorites and four-stage forecast journal are untouched.

## Regression verification
`test-quality-navigation.mjs` asserts that Evidence Lab and Research Validation have one unique DOM instance, live inside the quality route instead of Overview, that Forecasts' shortcut occurs before the long journal, that navigation updates the correct dock state, and that all DOM IDs are unique.

Signed APK regression: existing full JS tests, bundled module validity, and Gradle signed APK build run in GitHub Actions. On-device checks:
1. Open **Прогнозы → Качество исследований**.
2. Confirm **Evidence Lab** and **Research Validation** are visible and functional using the selected asset from Favorites.
3. Tap **Прогнозы** back control; full Forecasts journal and user-selected observations return.
4. On Overview, find only a small link, not the bulky audit panel.
5. Confirm all existing favorite picks and Room histories survive an in-place signed upgrade.

## Data integrity
The 30 non-overlapping actual-forward-outcome minimum, missing-data/incomplete-journal suppression, and 45-window/3-period historical method comparison are unchanged. Validation remains retrospective and is not a live price prediction.
