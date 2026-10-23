/**
 * Cloudflare Turnstile client helper (widget sitekey below).
 *
 * Renders the managed widget into a container, hands the single-use
 * `cf-turnstile-response` token to callers, and resets the widget after each
 * redemption so a retry gets a fresh token (tokens are single-use).
 *
 * Usage:
 *   <script src="/shared/turnstile.js" async defer></script>
 *   const t = await Turnstile.mount(document.getElementById("ts"), "my-action");
 *   const token = await t.token();            // resolves once the visitor passes
 *   fetch("/yt/search?q=x&cf-turnstile-response=" + encodeURIComponent(token));
 *   t.reset();                                 // before any retry
 */
(function () {
  "use strict";

  var SITEKEY = "0x4AAAAAAFVncJAeBOvaqWL7";
  var SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

  var scriptPromise = null;
  function loadScript() {
    if (window.turnstile) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("turnstile script failed to load")); };
      document.head.appendChild(s);
    });
    return scriptPromise;
  }

  function mount(container, action) {
    if (!container) return Promise.reject(new Error("turnstile container missing"));
    return loadScript().then(function () {
      return new Promise(function (resolve) {
        var id = window.turnstile.render(container, {
          sitekey: SITEKEY,
          action: action || undefined,
          callback: function () { resolve(api); },
          "expired-callback": function () { api.expired = true; },
          "error-callback": function () { api.failed = true; },
        });
        var api = {
          id: id,
          expired: false,
          failed: false,
          token: function () {
            return new Promise(function (res, rej) {
              var tries = 0;
              (function poll() {
                var t = window.turnstile.getResponse(id);
                if (t) return res(t);
                if (api.failed) return rej(new Error("turnstile failed"));
                if (++tries > 600) return rej(new Error("turnstile timeout"));
                setTimeout(poll, 100);
              })();
            });
          },
          reset: function () {
            api.expired = false;
            api.failed = false;
            window.turnstile.reset(id);
          },
          remove: function () { window.turnstile.remove(id); },
        };
      });
    });
  }

  window.Turnstile = { mount: mount, sitekey: SITEKEY };
})();
