# Plan: Peak Trading Time Heatmap

## Goal
Add a "Heatmap" tab to the Peak Trading Time modal (`PeakTradingModal.tsx`) to visualize sales intensity by Day of Week and Hour of Day. The design will mimic the MUI X Heatmap with the requested red color scheme.

## Context
- **Target File**: `src/ui/components/revenue/PeakTradingModal.tsx`
- **Current State**: Shows a simple Bar Chart of hourly distribution (aggregated across all days).
- **Requirement**: "Add a tab that switches to a heatmap... use a different coloring like the red in the photo."

## Strategy
We will implement a custom CSS Grid-based heatmap. This avoids the heavy and expensive `@mui/x-charts-pro` dependency while allowing precise control over the styling to match the requested "Red Heatmap" look.

## Phase 1: Data Aggregation
Update the `useMemo` logic to generate a 2D dataset:
- **Dimensions**: 7 Days (y-axis) x 24 Hours (x-axis).
- **Structure**: Array of `{ day: number, hour: number, value: number }` or a nested matrix.
- **Aggregator**: Loop through `sales`, extract `day` (0-6) and `hour` (0-23), increment counts.

## Phase 2: UI Structure (Tabs)
Refactor the modal content to use Shadcn `Tabs`:
- **TabsList**:
  - "Hourly Distribution" (Existing Bar Chart)
  - "Weekly Heatmap" (New)
- **TabsContent**:
  - Wrap existing chart in `value="hourly"`.
  - Create new container for `value="heatmap"`.

## Phase 3: Heatmap Implementation
Build the heatmap using Tailwind CSS Grid:
- **Grid Layout**: `grid-cols-[auto_repeat(24,1fr)]` (Y-labels + 24 Hour columns).
- **Y-Axis**: Mon, Tue, Wed, Thu, Fri, Sat, Sun (Check layout localization).
- **X-Axis**: 00h, 06h, 12h, 18h labels.
- **Color Scale**:
  - Base Color: Red (`#ef4444` or similar).
  - Logic: Calculate `intensity = value / maxValue`.
  - Style: `rgba(239, 68, 68, ${intensity})` or discrete bucket classes (`bg-red-500/10`, `bg-red-500/30`, etc.).
- **Interactivity**: simple Tooltip on hover showing "Day, Time: X sales".

## Verification Plan
1.  **Visual Check**: Verify the heatmap looks like the red reference photo.
2.  **Accuracy**: Ensure "Peak Hour" stats match the displayed heatmap hotspots.
3.  **Responsiveness**: Ensure the grid scrolls or scales on smaller screens.
