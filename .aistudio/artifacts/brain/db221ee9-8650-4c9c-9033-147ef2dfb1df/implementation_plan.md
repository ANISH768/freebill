# Product Selection on Enter in Billing (`CreateEstimate`)

## Goal
Update the billing item input behavior in `CreateEstimate.tsx` so that typing a product name only shows product recommendations without automatically filling product details while typing. All product details (`name`, `hsn`/`sku`, `unit`, `mrp`, `price`, `disc`) will only be populated when the user presses `Enter` on the highlighted recommendation (or clicks a recommendation), after which cursor focus will move to the `Qty` field of the same row.

## Key Changes

### 1. Disable Automatic Product Fill While Typing (`src/components/CreateEstimate.tsx`)
- In `handleRowChange(id, field, value)`, remove the automatic product lookup (`products.find(...)`) when `field === 'name'`.
- Typing in the Product / Service Name field will only update the row's `name` text and display the live recommendation dropdown (`getRowMatchingProducts`), keeping the first recommended product highlighted (`suggestionHighlightedIndex = 0`) and allowing `ArrowDown` / `ArrowUp` navigation.

### 2. Populate All Product Details Only on `Enter` (or Click) (`src/components/CreateEstimate.tsx`)
- When the user presses `Enter` in the Product / Service Name field (`field === 'name'` in `handleRowKeyDown`):
  - If the recommendation dropdown has a highlighted product (`matchingProds[suggestionHighlightedIndex]`), call `selectProductForRow(currentRow.id, matchingProds[suggestionHighlightedIndex])` to populate all details (`name`, `hsn`, `qty`, `unit`, `mrp`, `price`, `disc`, `rowDiscountVal`, `purchasePrice`).
  - If no recommendation matches (custom/manual item name), keep the typed `name`, close the recommendation dropdown, and move cursor focus to the same row's `Qty` input so the user can enter quantity and rate.
- Ensure `selectProductForRow` closes the recommendation list and moves focus directly to the same row's `Qty` input (`qty-input-${rowId}` / `qty-input-mobile-${rowId}`) with text selected for quick editing.
- Pressing `Enter` inside `Qty`, `MRP`, or `Rate` continues to advance to the next item row (or create a new row if on the last row).
