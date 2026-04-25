# Onboarding Validation Rules

## Added Server Validation
- Email fields must match a valid email shape.
- Phone fields must contain a realistic phone pattern and length.
- Website and logo URLs must be valid `http` or `https` URLs.
- Timezone fields must be valid IANA timezone identifiers.
- Opening-hours times must use `HH:MM`.
- Registration/legal text, billing names, and branding text are length-bounded.
- Empty billing updates are rejected.

## Affected Inputs
- School profile:
  - `workspaceName`
  - `street`
  - `houseNumber`
  - `postalCode`
  - `city`
  - `state`
  - `country`
  - `phone`
  - `website`
  - `timezone`
  - `registrationDetails`
  - `openingHours`
  - `openingHoursDetails`
- Email settings:
  - `brand_school_name`
  - `reply_to_email`
  - `footer_text`
  - `subject_prefix`
  - `logo_url`
  - `signature_html`
  - `manual_body_text`
- Billing profile:
  - `billingEmail`
  - `invoiceContactName`
  - readiness acknowledgement flags

## Error Contract
- Validation failures return readable `400` responses.
- Raw stack traces are not exposed to the onboarding UI.
- Guided mode now formats backend validation details into inline onboarding error messaging.
