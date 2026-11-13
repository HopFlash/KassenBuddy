# Fixed-Amount Quick Discounts Design

## Goal

Add configurable fixed-euro quick discounts alongside the existing percentage quick discounts. Each discount type can be enabled or disabled independently in Settings.

## User experience

- Settings expose three configurable fixed-amount values, initially €1, €2, and €3.
- Settings expose independent enable switches for percentage and fixed-amount quick discounts. Both types are enabled by default.
- The POS displays the quick-discount buttons for each enabled type. Disabling a type hides its buttons without deleting its configured values.
- A fixed-amount discount is applied to the cart subtotal and is capped at that subtotal, so the payable total cannot become negative.
- As with the existing percentage discount, only one quick discount is active at a time. Choosing a percentage or fixed-amount discount replaces the currently applied quick discount. The existing remove action clears it.
- Disabling a type affects button availability; it does not retroactively remove a discount already applied to the current cart.

## Data and compatibility

- Extend `Settings` with three fixed-amount values and two independent enable flags.
- Normalize stored values through the existing settings normalization path. Existing settings without the new fields continue to load: percentage discounts stay enabled and use their existing values; fixed-amount discounts use the new defaults and are enabled.
- Backup export/import continues to use the settings object and preserves the new fields.
- Represent both discount types as synthetic cart products, keeping discount values out of the regular product catalog and preserving the existing transaction-item representation. Use an unambiguous typed identifier for new discount products while continuing to recognize existing percentage-discount identifiers.
- Monetary calculations use cent rounding. Fixed amounts are positive values with two-decimal precision; applying an amount larger than the subtotal discounts only the subtotal.

## Implementation boundaries

- Update the Settings UI and validation for both value arrays and enable flags.
- Update the cart calculation and POS buttons without changing stock handling or other checkout behavior.
- Preserve compatibility for older persisted settings and existing percentage discount transactions.
- Update the README and changelog, and bump the application version from `1.1.2` to `1.2.0`.

## Verification

- Add focused tests for fixed-amount calculations, the subtotal cap, replacement of an existing percentage discount, and independently hidden quick-discount types.
- Verify settings normalization for legacy data and invalid fixed-amount values.
- Run the repository's Svelte/type checks and relevant Vitest tests; run the production web build if those checks pass.
