# `form_submitted` + Enhanced Conversions — setup

Container: **GTM-W9RNL2H8** · Google Ads: **AVMSmiles**

## What the site now does

`tracking.js` pushes one dataLayer event, **`form_submitted`**, and it fires *only*
after the Apps Script endpoint has confirmed the lead was written to the sheet.
This is the difference from `gtm.formInteract` (fires when someone touches a
field) and `gtm.formSubmit` (fires on the attempt, including ones that fail) —
neither is safe as a conversion trigger.

Pages wired up: `/`, `/clear-aligner-24999`, `/clear-aligner-29999`,
`/clear-aligners-24999`, `/dental-implant-10999`, `/dental-implant-14999`,
plus a replay safety net on `/thank-you`.

### Event payload

```js
{
  event: "form_submitted",
  lead_id: "lead-mtgozkwm-fdop25",   // unique per submission — use for dedup
  form_id: "implant-lead-form",
  form_name: "lead form",
  form_location: "hero" | "modal" | "mobile sticky",
  treatment: "dental implants" | "clear aligner",
  sheet_tab: "dental-Implant",
  page_path, page_location,
  utm_source, utm_medium, utm_campaign, utm_term, utm_content,
  gclid, gbraid, wbraid,

  // Plain, already normalised (lowercased email, E.164 phone)
  user_data: {
    email: "priya.sharma@example.com",
    phone_number: "+919876543210",
    address: { first_name, last_name, postal_code, country: "IN" }
  },

  // Same values pre-hashed with SHA-256, if you prefer hashing on the page
  user_data_hashed: {
    sha256_email_address, sha256_phone_number,
    address: { sha256_first_name, sha256_last_name, postal_code, country }
  }
}
```

### Redirect timing

The redirect to `/thank-you` waits for GTM's `eventCallback` (tags finished), or
1.2s, whichever is first. If the callback never came, the payload is left in
`sessionStorage` and `/thank-you` replays the identical event with the **same
`lead_id`**. A confirmed submission leaves nothing to replay, so a lead is
counted once — filter on `lead_id` if you ever see a duplicate.

---

## 1. GTM — trigger

**Triggers → New → Custom Event**

| Field | Value |
| --- | --- |
| Event name | `form_submitted` |
| Fires on | All Custom Events |

Name it `CE - form_submitted`.

## 2. GTM — variables

**Variables → New → Data Layer Variable** for each (Version 2):

`lead_id`, `form_location`, `treatment`, `gclid`, `gbraid`, `wbraid`,
`utm_source`, `utm_campaign`

## 3. GTM — Google Ads conversion tag

**Tags → New → Google Ads Conversion Tracking**

- Conversion ID / Label: from the AVMSmiles Ads conversion action (step 5)
- Conversion Value: leave blank, or a fixed lead value if you have one
- Transaction ID: `{{DLV - lead_id}}` ← this is what deduplicates the replay
- Trigger: `CE - form_submitted`

Make sure a **Google tag (`AW-…`)** is also in the container firing on
Initialization / All Pages — the conversion tag needs it.

## 4. GTM — Enhanced Conversions

**Admin → Google tag → Configure → Turn on Enhanced Conversions**, accept the
terms, and choose **Manual configuration** with source **Code** →
**User-Provided Data variable**.

**Variables → New → User-Provided Data → Manual configuration:**

| Field | Data Layer Variable |
| --- | --- |
| Email | `user_data.email` |
| Phone Number | `user_data.phone_number` |
| First Name | `user_data.address.first_name` |
| Last Name | `user_data.address.last_name` |
| Postal Code | `user_data.address.postal_code` |
| Country | `user_data.address.country` |

Nested paths work directly in a Data Layer Variable — type them exactly as
above. Then on the conversion tag from step 3, tick **Include user-provided
data from your website** and select this variable.

The values are already normalised the way Google requires (email lowercased and
trimmed, phone in E.164 `+91…`), and GTM hashes them in the browser before they
leave the page. Use `user_data_hashed.*` instead only if you configure the tag
for pre-hashed input.

## 5. Google Ads — conversion action

**Goals → Conversions → New conversion action → Website**

- Category: **Submit lead form**
- Value: a fixed value per lead (recommended — Smart Bidding needs one)
- Count: **One** (a repeat submission by the same person is the same lead)
- Click-through window: 30–90 days
- Attribution: data-driven
- Enhanced conversions: **On**, setup method **Google Tag Manager**

Then set it as the **Primary** action for the campaigns you optimise, and demote
any legacy action built on `gtm.formInteract` or a `/thank-you` pageview to
**Secondary** — otherwise the same lead is counted twice and bidding is skewed.

## 6. Enhanced conversions for leads (offline import)

The lead sheet already stores `gclid` / `gbraid` / `wbraid` (`click-ids.js`
keeps them for 90 days across page moves) plus email, phone, name and pincode.
Once you can mark which leads booked or showed up, import those back as offline
conversions against the stored click id, keyed on the same fields. That teaches
Smart Bidding on *qualified* leads rather than raw form fills, which is where
most of the campaign efficiency actually comes from.

---

## Verifying

1. GTM **Preview** → open the landing page → submit a real test lead.
2. Confirm `form_submitted` appears in the Tag Assistant timeline **after** the
   network call, and that the Google Ads tag fired on it.
3. On the event, check the **Variables** tab: `user_data` must be populated —
   an empty one means Enhanced Conversions silently degrade to normal ones.
4. In Google Ads, the conversion action shows **"Recording conversions"** within
   ~24h and enhanced-conversions diagnostics report no errors after ~48–72h.
5. Confirm the test lead landed in the sheet with its `gclid` column filled.
