/**
 * Captures paid-traffic click identifiers from the landing URL and keeps them
 * for 90 days, so a lead that submits after moving between pages still carries
 * the id the ad platform needs for offline conversion import.
 *
 *   Google   gclid, gbraid, wbraid
 *   Meta     fbclid, plus the _fbc / _fbp cookies the pixel writes
 *   Microsoft msclkid
 *   TikTok   ttclid
 *   LinkedIn li_fat_id
 *   X        twclid
 *
 * Referrer and landing page are stored alongside them, so an untagged lead can
 * still be traced back to where it came from.
 *
 * Usage:
 *   window.AVMAttribution.get() -> { gclid, fbclid, fbc, fbp, referrer, ... }
 *   window.AVMClickIds.get()    -> { gclid, gbraid, wbraid }   (kept for older callers)
 */
(function (w, d) {
  var STORAGE_KEY = "avm_attribution";
  var LEGACY_KEY = "avm_click_ids";
  var TTL_MS = 90 * 24 * 60 * 60 * 1000; // Google's offline import window

  // Ids that arrive as URL parameters. A landing URL carrying any of these is a
  // fresh click and replaces whatever the previous one left behind.
  var URL_KEYS = [
    "gclid",
    "gbraid",
    "wbraid",
    "fbclid",
    "msclkid",
    "ttclid",
    "li_fat_id",
    "twclid"
  ];

  // Context stored with the click, useful when the ad wasn't tagged at all.
  var CONTEXT_KEYS = ["referrer", "landing_page"];

  // Written by the Meta pixel after the page loads, so they are read at submit
  // time rather than at capture time.
  var COOKIE_KEYS = ["fbc", "fbp"];

  var ALL_KEYS = URL_KEYS.concat(CONTEXT_KEYS, COOKIE_KEYS);

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

  // Leads captured before this script grew beyond Google still have their ids
  // under the old key; carry them over rather than losing the attribution.
  function readLegacy() {
    try {
      var raw = w.localStorage.getItem(LEGACY_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.expires || parsed.expires < new Date().getTime()) {
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

  function readCookie(name) {
    try {
      var match = d.cookie.match(
        new RegExp("(?:^|;\\s*)" + name + "=([^;]*)")
      );
      return match ? decodeURIComponent(match[1]) : "";
    } catch (err) {
      return "";
    }
  }

  // Meta's own format: fb.<subdomain index>.<click time>.<fbclid>. The pixel
  // normally writes this cookie itself; building it covers the case where the
  // pixel is blocked or hasn't run yet.
  function buildFbc(fbclid) {
    if (!fbclid) return "";
    return "fb.1." + new Date().getTime() + "." + fbclid;
  }

  function capture() {
    var params = new URLSearchParams(w.location.search);
    var stored = readStored();
    if (!stored.gclid && !stored.gbraid && !stored.wbraid) {
      var legacy = readLegacy();
      Object.keys(legacy).forEach(function (key) {
        if (legacy[key] && !stored[key]) stored[key] = legacy[key];
      });
    }

    var fresh = {};
    var hasFresh = false;

    URL_KEYS.forEach(function (key) {
      var value = (params.get(key) || "").trim();
      if (value) {
        fresh[key] = value;
        hasFresh = true;
      }
    });

    // A new click always wins over whatever the last one left behind.
    if (hasFresh) {
      fresh.referrer = d.referrer || "";
      fresh.landing_page = w.location.href;
      if (fresh.fbclid) fresh.fbc = buildFbc(fresh.fbclid);
      store(fresh);
      return fresh;
    }

    // Untagged visit: remember where it came from if nothing is on file yet.
    if (!stored.landing_page) {
      stored.referrer = d.referrer || "";
      stored.landing_page = w.location.href;
      store(stored);
    }
    return stored;
  }

  var current = capture();

  function get() {
    var values = {};
    ALL_KEYS.forEach(function (key) {
      values[key] = current[key] || "";
    });

    // The pixel's own cookies are authoritative and may only appear after the
    // page has settled, so they are re-read on every call.
    COOKIE_KEYS.forEach(function (key) {
      var cookie = readCookie("_" + key);
      if (cookie) values[key] = cookie;
    });
    if (!values.fbc && values.fbclid) values.fbc = buildFbc(values.fbclid);

    return values;
  }

  w.AVMAttribution = { keys: ALL_KEYS, get: get };

  // Older call sites only ever asked for the three Google ids.
  w.AVMClickIds = {
    keys: ["gclid", "gbraid", "wbraid"],
    get: function () {
      var all = get();
      return { gclid: all.gclid, gbraid: all.gbraid, wbraid: all.wbraid };
    }
  };
})(window, document);
