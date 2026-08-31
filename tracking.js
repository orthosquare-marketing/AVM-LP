/**
 * Lead tracking for GTM / Google Ads.
 *
 * Pushes a single `form_submitted` dataLayer event that fires ONLY after the
 * lead has actually been written to the sheet, so it can be used as the Google
 * Ads conversion trigger (unlike gtm.formInteract / gtm.formSubmit, which fire
 * on interaction or on an attempt that may still fail).
 *
 * The event carries the user-provided data Google Ads needs for Enhanced
 * Conversions, both as plain values (for GTM's own "User-Provided Data"
 * variable) and pre-hashed with SHA-256 (for a tag configured with hashed
 * inputs).
 *
 * Usage: window.AVMTracking.formSubmitted(form, { form_name: "..." })
 *          .then(function () { window.location.href = THANK_YOU_URL; });
 */
(function (w, d) {
  var EVENT_NAME = "form_submitted";
  var PENDING_KEY = "avm_lead_pending";
  var REDIRECT_TIMEOUT_MS = 1200; // don't hold the user if a tag stalls

  w.dataLayer = w.dataLayer || [];

  function val(form, name) {
    var el = form && form.querySelector('[name="' + name + '"]');
    return el && el.value ? String(el.value).trim() : "";
  }

  function firstFilled(form, names) {
    for (var i = 0; i < names.length; i++) {
      var v = val(form, names[i]);
      if (v) return v;
    }
    return "";
  }

  /** Google requires E.164. Every form here collects a 10-digit Indian number. */
  function normalizePhone(raw) {
    var digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10) return "+91" + digits;
    if (digits.length === 12 && digits.indexOf("91") === 0) return "+" + digits;
    if (digits.length === 11 && digits.indexOf("0") === 0) {
      return "+91" + digits.slice(1);
    }
    return "+" + digits;
  }

  function normalizeEmail(raw) {
    return String(raw || "").trim().toLowerCase();
  }

  function normalizeName(raw) {
    return String(raw || "").trim().toLowerCase();
  }

  function sha256(value) {
    if (!value) return Promise.resolve("");
    var subtle = w.crypto && (w.crypto.subtle || w.crypto.webkitSubtle);
    if (!subtle || !w.TextEncoder) return Promise.resolve("");
    try {
      return subtle
        .digest("SHA-256", new TextEncoder().encode(value))
        .then(function (buf) {
          var bytes = new Uint8Array(buf);
          var out = "";
          for (var i = 0; i < bytes.length; i++) {
            out += ("0" + bytes[i].toString(16)).slice(-2);
          }
          return out;
        })
        .catch(function () {
          return "";
        });
    } catch (err) {
      return Promise.resolve("");
    }
  }

  function leadId() {
    return (
      "lead-" +
      new Date().getTime().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  /**
   * Collects the fields the form actually has, whichever markup it uses.
   * `extra.values` wins, for pages whose inputs are not named consistently.
   */
  function collect(form, extra) {
    extra = extra || {};
    var given = extra.values || {};
    var params = new URLSearchParams(w.location.search);
    var clickIds = (w.AVMClickIds && w.AVMClickIds.get()) || {};
    var firstName =
      given.firstName ||
      firstFilled(form, ["firstName", "first_name", "fname", "name"]);
    var lastName =
      given.lastName || firstFilled(form, ["lastName", "last_name", "lname"]);

    // "name" may hold a full name on the older pages; split it for Google.
    if (!lastName && firstName.indexOf(" ") > -1) {
      var parts = firstName.split(/\s+/);
      firstName = parts.shift();
      lastName = parts.join(" ");
    }

    return {
      email: normalizeEmail(
        given.email || firstFilled(form, ["email", "email_id"])
      ),
      phone: normalizePhone(
        given.phone || firstFilled(form, ["phone", "mobile", "contact"])
      ),
      firstName: normalizeName(firstName),
      lastName: normalizeName(lastName),
      pincode:
        given.pincode ||
        firstFilled(form, [
          "pincode",
          "pincode_desktop",
          "pincode_mobile",
          "zip"
        ]),
      treatment: extra.treatment || val(form, "treatment") || "",
      sheet_tab: val(form, "sheet_tab") || "",
      utm_source: val(form, "utm_source") || params.get("utm_source") || "",
      utm_medium: val(form, "utm_medium") || params.get("utm_medium") || "",
      utm_campaign:
        val(form, "utm_campaign") || params.get("utm_campaign") || "",
      utm_term: val(form, "utm_term") || params.get("utm_term") || "",
      utm_content: val(form, "utm_content") || params.get("utm_content") || "",
      gclid: clickIds.gclid || params.get("gclid") || "",
      gbraid: clickIds.gbraid || params.get("gbraid") || "",
      wbraid: clickIds.wbraid || params.get("wbraid") || ""
    };
  }

  function buildEvent(lead, meta, hashes) {
    return {
      event: EVENT_NAME,
      lead_id: meta.lead_id,
      form_id: meta.form_id || "",
      form_name: meta.form_name || meta.form_id || "",
      form_location: meta.form_location || "",
      treatment: lead.treatment,
      sheet_tab: lead.sheet_tab,
      page_path: w.location.pathname,
      page_location: w.location.href,
      utm_source: lead.utm_source,
      utm_medium: lead.utm_medium,
      utm_campaign: lead.utm_campaign,
      utm_term: lead.utm_term,
      utm_content: lead.utm_content,
      gclid: lead.gclid,
      gbraid: lead.gbraid,
      wbraid: lead.wbraid,
      // Plain values -> GTM "User-Provided Data" variable (manual configuration).
      user_data: {
        email: lead.email,
        phone_number: lead.phone,
        address: {
          first_name: lead.firstName,
          last_name: lead.lastName,
          postal_code: lead.pincode,
          country: "IN"
        }
      },
      // Pre-hashed values, for a conversion tag configured with hashed inputs.
      user_data_hashed: {
        sha256_email_address: hashes.email,
        sha256_phone_number: hashes.phone,
        address: {
          sha256_first_name: hashes.firstName,
          sha256_last_name: hashes.lastName,
          postal_code: lead.pincode,
          country: "IN"
        }
      }
    };
  }

  function clearPending() {
    try {
      w.sessionStorage.removeItem(PENDING_KEY);
    } catch (err) {
      /* nothing to clear */
    }
  }

  /**
   * Pushes `form_submitted` and resolves once GTM reports its tags are done
   * (or after REDIRECT_TIMEOUT_MS, whichever comes first), so the caller can
   * navigate to the thank-you page without cutting the conversion tag off.
   */
  function formSubmitted(form, meta) {
    meta = meta || {};
    meta.lead_id = meta.lead_id || leadId();
    if (form && form.id && !meta.form_id) meta.form_id = form.id;

    var lead = collect(form, meta);

    return Promise.all([
      sha256(lead.email),
      sha256(lead.phone),
      sha256(lead.firstName),
      sha256(lead.lastName)
    ])
      .then(function (h) {
        return { email: h[0], phone: h[1], firstName: h[2], lastName: h[3] };
      })
      .catch(function () {
        return { email: "", phone: "", firstName: "", lastName: "" };
      })
      .then(function (hashes) {
        var payload = buildEvent(lead, meta, hashes);

        // Remembered so the thank-you page can fire a backup conversion if the
        // tags here never confirmed before the redirect.
        try {
          w.sessionStorage.setItem(
            PENDING_KEY,
            JSON.stringify({ payload: payload, at: new Date().getTime() })
          );
        } catch (err) {
          /* storage disabled - the primary push below still runs */
        }

        return new Promise(function (resolve) {
          var done = false;
          function finish(confirmed) {
            if (done) return;
            done = true;
            if (confirmed) clearPending();
            resolve(payload);
          }

          payload.eventCallback = function () {
            finish(true);
          };
          payload.eventTimeout = REDIRECT_TIMEOUT_MS;

          w.dataLayer.push(payload);
          w.setTimeout(function () {
            finish(false);
          }, REDIRECT_TIMEOUT_MS);
        });
      });
  }

  /**
   * Thank-you page safety net: replays `form_submitted` only when the landing
   * page pushed it but GTM never confirmed the tags fired before navigation.
   * The lead_id is unchanged, so the conversion can be deduplicated.
   */
  function replayPending() {
    var raw;
    try {
      raw = w.sessionStorage.getItem(PENDING_KEY);
    } catch (err) {
      return null;
    }
    if (!raw) return null;
    clearPending();

    var stored;
    try {
      stored = JSON.parse(raw);
    } catch (err) {
      return null;
    }
    if (!stored || !stored.payload) return null;
    // Only a redirect that just happened counts; anything older is stale.
    if (new Date().getTime() - (stored.at || 0) > 5 * 60 * 1000) return null;

    var payload = stored.payload;
    delete payload.eventCallback;
    delete payload.eventTimeout;
    payload.is_replay = true;
    payload.page_path = w.location.pathname;
    payload.page_location = w.location.href;
    w.dataLayer.push(payload);
    return payload;
  }

  w.AVMTracking = {
    eventName: EVENT_NAME,
    formSubmitted: formSubmitted,
    replayPending: replayPending
  };
})(window, document);
