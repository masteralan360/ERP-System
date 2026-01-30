# Plan: Heatmap Localization & UI Fixes

## Goal
Fix localization issues and tooltip positioning in the Peak Trading Time Heatmap component.

## Context
- **Issue 1**: Missing translation keys (`revenue.hourly`, `revenue.heatmap`, `revenue.weeklyHeatmap`) causing fallback text or uppercase keys to display.
- **Issue 2**: Tooltips obscure the cell/header above. User wants them to "go down instead".
- **Issue 3**: Tooltip text is not fully localized (English "sales" used in Arabic/Kurdish).

## Strategy

### Phase 1: Localization Resource Update
Update `src/i18n/locales/en.json` and `src/i18n/locales/ku.json` (and `ar.json` if implied, though user checks `ku`):
- Add the following keys to the `revenue` section:
  ```json
  "hourly": "Hourly", // "Katjimêr" (KU)
  "heatmap": "Heatmap", // "Nexşeya Germiyê" (KU)
  "weeklyHeatmap": "Weekly Heatmap", // "Nexşeya Germiya Heftane" (KU)
  "less": "Less", // "Kêmtir" (KU)
  "more": "More", // "Zêdetir" (KU)
  "salesCount": "Sales" // "Firotin" (KU)
  ```

### Phase 2: UI Fixes (`PeakTradingModal.tsx`)
1.  **Tooltip Position**: Change `bottom-full mb-2` to `top-full mt-2`. This renders the tooltip *below* the cursor.
2.  **Tooltip Text**:
    - Use `t('revenue.salesCount')` instead of hardcoded string.
    - Ensure RTL safety: `<div dir="ltr">...</div>` or rely on flex-row with conditional ordering.
    - Format: `${dayName} ${hour}:00 • {count} {t('revenue.salesCount')}`.

## Verification
- Check that "HOURLY" and "HEATMAP" tabs display correct translated text.
- Verify hovering a cell shows the tooltip *below* the mouse.
- Verify tooltip text is fully localized (e.g., "Monday 10:00 • 5 Sales" -> "Duşem 10:00 • 5 Firotin").
