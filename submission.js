(function () {
  const WEB_APP_URL =
    "https://script.google.com/macros/s/AKfycby4JVZOuC9U7ziyniciX1j-1R4Q-PLakl0c6ZkDxGO3mxVoCRSjioPtlFnN3loKKStD/exec";
  const THANK_YOU_URL = "https://dentaloffers.avmsmiles.com/thank-you";

  function setStatus(statusEl, msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? "#b91c1c" : "#166534";
  }

  function setHidden(form, name, value) {
    let el = form.querySelector(`[name="${name}"]`);
    if (!el) {
      el = document.createElement("input");
      el.type = "hidden";
      el.name = name;
      form.appendChild(el);
    }
    el.value = value || "";
  }

  function ensureHiddenValues(form) {
    const params = new URLSearchParams(window.location.search);
    const pinDesktop = (
      form.querySelector('[name="pincode_desktop"]')?.value || ""
    ).trim();
    const pinMobile = (
      form.querySelector('[name="pincode_mobile"]')?.value || ""
    ).trim();
    const pincode =
      pinDesktop ||
      pinMobile ||
      (form.querySelector('[name="pincode"]')?.value || "").trim();

    setHidden(form, "pincode", pincode);
    setHidden(form, "utm_campaign", params.get("utm_campaign") || "");
    setHidden(form, "utm_medium", params.get("utm_medium") || "");
    setHidden(form, "utm_source", params.get("utm_source") || "");
    setHidden(form, "utm_term", params.get("utm_term") || "");
    setHidden(form, "utm_content", params.get("utm_content") || "");

    // Google Ads click ids, so the lead can be imported back as an offline conversion.
    const clickIds = (window.AVMClickIds && window.AVMClickIds.get()) || {};
    setHidden(form, "gclid", clickIds.gclid || params.get("gclid") || "");
    setHidden(form, "gbraid", clickIds.gbraid || params.get("gbraid") || "");
    setHidden(form, "wbraid", clickIds.wbraid || params.get("wbraid") || "");

    setHidden(form, "date", new Date().toISOString());

    const sheetTab = form.querySelector('[name="sheet_tab"]')?.value || "dental-Implant";
    setHidden(form, "sheet_tab", sheetTab);

    // Set treatment based on sheetTab value or default to dental implants
    let treatment = "dental implants";
    if (sheetTab.toLowerCase().includes("aligner")) {
      treatment = "clear aligner";
    }
    setHidden(form, "treatment", treatment);
  }

  function disableForm(form, disabled) {
    form
      .querySelectorAll('button[type="submit"], input[type="submit"]')
      .forEach((btn) => {
        btn.disabled = disabled;
        btn.style.opacity = disabled ? "0.7" : "";
        btn.style.pointerEvents = disabled ? "none" : "";
      });
  }

  function formLocation(formId) {
    if (formId.indexOf("modal") > -1) return "modal";
    if (formId.indexOf("mobile") > -1) return "mobile sticky";
    return "hero";
  }

  // Never let a tracking hiccup block the redirect the user is waiting on.
  function fireFormSubmitted(form, formId) {
    if (!window.AVMTracking) return Promise.resolve();
    try {
      return window.AVMTracking.formSubmitted(form, {
        form_id: formId,
        form_name: "lead form",
        form_location: formLocation(formId)
      }).catch(function () {});
    } catch (err) {
      return Promise.resolve();
    }
  }

  function attachSubmission(formId, statusId) {
    const form = document.getElementById(formId);
    const statusEl = document.getElementById(statusId);
    if (!form) return;

    let isSubmitting = false;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      if (isSubmitting) return;
      isSubmitting = true;
      disableForm(form, true);
      setStatus(statusEl, "Submitting...", false);

      try {
        ensureHiddenValues(form);

        const fd = new FormData(form);
        const phone = (fd.get("phone") || "").toString().trim();
        if (!phone) {
          setStatus(statusEl, "Please enter your contact number.", true);
          isSubmitting = false;
          disableForm(form, false);
          return;
        }

        const body = new URLSearchParams();
        for (const [k, v] of fd.entries()) body.append(k, v);

        const res = await fetch(WEB_APP_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: body.toString(),
        });

        const text = await res.text();
        if (!res.ok || text.trim().toLowerCase() !== "ok") {
          throw new Error("failed");
        }

        // Only now is the lead real: fire the conversion event, then leave.
        await fireFormSubmitted(form, formId);

        window.location.href = THANK_YOU_URL;
      } catch (err) {
        setStatus(statusEl, "Something went wrong. Please try again.", true);
        isSubmitting = false;
        disableForm(form, false);
      }
    });
  }

  attachSubmission("implant-lead-form-modal", "implant-lead-status-modal");
  attachSubmission("implant-lead-form", "implant-lead-status");
  attachSubmission("implant-lead-form-mobile", "implant-lead-status-mobile");
})();
