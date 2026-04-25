# Onboarding Billing Production Final

## Product Positioning
- Billing remains honest to the current product architecture.
- No fake checkout, subscription portal, or payment capture was introduced.
- The onboarding billing step stays focused on launch-readiness and contact accuracy.

## Supported Billing Inputs
- `billingEmail`
- `invoiceContactName`
- readiness acknowledgement

## Readiness Logic
- Billing is considered ready when:
  - billing email exists
  - invoice contact name exists
  - billing status is active or readiness has been acknowledged

## Improvements Added
- Stronger billing email validation.
- Empty billing updates rejected.
- Billing updates now emit `onboarding_billing_info_updated`.
- Guided UI still exposes the billing explanation and missing-fields state.

## Remaining Deferred
- Real payment collection
- subscription lifecycle management
- billing portal
- tax/VAT/legal invoicing fields
