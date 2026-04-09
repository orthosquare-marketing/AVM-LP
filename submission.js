(function () {
  const WEB_APP_URL =
    "https://script.google.com/macros/s/AKfycbyPpDmvoytLHqhNO26sXOnMTk5iMmd8mz2xOVhbE6cuoLoM9pco7sHuxH5VpZPf5Md0/exec";
  const THANK_YOU_URL = "https://dentaloffers.avmsmiles.com/thank-you";

  function setStatus(statusEl, msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? "#b91c1c" : "#166534";
  }

  function setHidden(form, name, value) {
    const el = form.querySelector(`[name="${name}"]`);
    if (el) el.value = value || "";
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
    setHidden(form, "date", new Date().toISOString());

    if (!form.querySelector('[name="sheet_tab"]')?.value) {
      setHidden(form, "sheet_tab", "dental-Implant");
    }
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
})();
