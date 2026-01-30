# PLAN-sales-count-trend

Modify the "Sales volume trend" graph in the Team Performance page to display the count of sales per team member instead of revenue per currency. This will provide a clearer view of individual transaction volume over time.

## User Review Required

> [!IMPORTANT]
> - The graph will shift from showing **Revenue (Currency)** to **Total Sales (Count)**.
> - Each line will represent a specific staff member.
> - The current "Currency Filter" legend above the graph will be replaced with a **Staff Member** legend to match the new data.

## Proposed Changes

### [Frontend] Team Performance Page

#### [MODIFY] [TeamPerformance.tsx](file:///e:/ERP%20System/ERP%20System/src/ui/pages/TeamPerformance.tsx)

1.  **Update `StaffPerformance` Interface**:
    - Add `dailySalesCount: Record<string, number>` to track transaction counts per day.

2.  **Refactor `calculatePerformance`**:
    - Initialize `dailySalesCount` for each member.
    - Increment `dailySalesCount[date]` inside the sales iteration loop.

3.  **Update `trendData` calculation**:
    - Build data points based on all dates in the range.
    - Each data point will contain keys for each member ID (mapping to their daily sales count).

4.  **Update Rendering of "Performance Trend Chart"**:
    - Update Title and Description (using translation keys or hardcoded fallback if needed).
    - Replace the currency-based legend with a member-based legend.
    - Update `<AreaChart>` to render an `<Area>` for each member in `performanceData`.
    - Update `<Tooltip>` to show member names and transaction counts.
    - Update `<YAxis>` to show integers (counts) rather than currency-formatted values.

## Verification Plan

### Manual Verification
1.  Open the **Team Performance** page.
2.  Observe the "Sales volume trend" (or updated "Sales count trend") graph.
3.  Verify that it shows two lines (one for "admin", one for "staff") if both have sales in the period.
4.  Hover over points to see the specific count for each member on that date.
5.  Check that the legend correctly identifies each line by name.
6.  Compare the graph counts with the "Sales Count" column in the table above to ensure consistency.
