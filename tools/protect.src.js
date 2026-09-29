(function () {
  "use strict";
  if (!window.aesjs) return;
  var key = [71, 111, 97, 114, 120, 121, 122, 45, 97, 101, 115, 45, 107, 101, 121, 49];
  var iv = [4, 7, 1, 9, 2, 8, 5, 3, 6, 0, 11, 14, 10, 13, 12, 15];
  function bytes(value) {
    var out = [];
    for (var i = 0; i < value.length; i++) out.push(value.charCodeAt(i) & 255);
    return out;
  }
  function text(value) {
    var out = "";
    for (var i = 0; i < value.length; i++) out += String.fromCharCode(value[i]);
    return out;
  }
  var plain = aesjs.padding.pkcs7.pad(bytes("goarxyz"));
  var sealed = new aesjs.ModeOfOperation.cbc(key, iv).encrypt(plain);
  var opened = text(aesjs.padding.pkcs7.strip(new aesjs.ModeOfOperation.cbc(key, iv).decrypt(sealed)));
  if (opened !== "goarxyz") return;
  var quiet = false;
  function docked() {
    var width = Math.abs((window.outerWidth || 0) - (window.innerWidth || 0));
    var height = Math.abs((window.outerHeight || 0) - (window.innerHeight || 0));
    return width > 180 || height > 180;
  }
  function hush() {
    if (quiet || !docked()) return;
    quiet = true;
    ["log", "debug", "info", "dir", "table"].forEach(function (name) {
      try { console[name] = function () {}; } catch (err) {}
    });
  }
  setInterval(hush, 2000);
  hush();
})();
