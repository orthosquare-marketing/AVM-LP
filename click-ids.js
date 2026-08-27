/**
 * Captures Google Ads click identifiers (gclid / gbraid / wbraid) from the
 * landing URL and keeps them for 90 days, so a lead that submits after moving
 * between pages still carries the id that Google needs for offline conversion
 * import.
 *
 * Usage: window.AVMClickIds.get() -> { gclid, gbraid, wbraid }
 */
(function (w) {
  var STORAGE_KEY = "avm_click_ids";
  var KEYS = ["gclid", "gbraid", "wbraid"];
  var TTL_MS = 90 * 24 * 60 * 60 * 1000; // Google's offline import window

  function readStored() {
    try {
      var raw = w.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.expires || parsed.expires < new Date().getTime()) {
        w.localStorage.removeItem(STORAGE_KEY);
        return {};
      }
      return parsed.values || {};
    } catch (err) {
      return {};
    }
  }

  function store(values) {
    try {
      w.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          values: values,
          expires: new Date().getTime() + TTL_MS
        })
      );
    } catch (err) {
      /* private mode / storage disabled — fall back to the in-memory copy */
    }
  }

  function capture() {
    var params = new URLSearchParams(w.location.search);
    var stored = readStored();
    var fresh = {};
    var hasFresh = false;

    KEYS.forEach(function (key) {
      var value = (params.get(key) || "").trim();
      if (value) {
        fresh[key] = value;
        hasFresh = true;
      }
    });

    // A new click always wins over whatever the last one left behind.
    if (hasFresh) {
      store(fresh);
      return fresh;
    }
    return stored;
  }

  var current = capture();

  w.AVMClickIds = {
    keys: KEYS,
    get: function () {
      return {
        gclid: current.gclid || "",
        gbraid: current.gbraid || "",
        wbraid: current.wbraid || ""
      };
    }
  };
})(window);
