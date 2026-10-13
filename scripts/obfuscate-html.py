#!/usr/bin/env python3
"""Encrypt public HTML pages into self-decrypting loaders.

Each page becomes a tiny HTML stub that stores AES-GCM-encrypted markup and
decrypts it in the browser via Web Crypto, writing the result into the
document. A curl/view-source/save-as only ever sees the stub.

Pages are encrypted in place, with originals backed up to .page-src/ (which
stays untracked via .gitignore). Run scripts/obfuscate-html.py --restore to
restore originals.
"""

import base64
import json
import os
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    print("pip install cryptography", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
BACKUP = ROOT / ".page-src"

GUARD_JS = r"""
(function(){
  'use strict';
  var tripped = false;
  function wipe() {
    if (tripped) return;
    tripped = true;
    try { document.documentElement.innerHTML = ''; } catch (e) {}
    try { localStorage.clear(); } catch (e) {}
    try { location.replace('about:blank'); } catch (e) {}
  }
  var threshold = 170;
  function sizeDiff() {
    var w = Math.abs((window.outerWidth || 0) - (window.innerWidth || 0));
    var h = Math.abs((window.outerHeight || 0) - (window.innerHeight || 0));
    return w > threshold || h > threshold;
  }
  function timingLoop() {
    var start = performance.now();
    debugger;
    if (performance.now() - start > 100) wipe();
  }
  setInterval(function () {
    if (sizeDiff()) wipe();
    timingLoop();
  }, 1500);
  timingLoop();
  var fire = ['log', 'warn', 'info', 'error', 'table', 'dir', 'debug', 'trace'];
  var lastFire = 0;
  fire.forEach(function (k) {
    try {
      console[k] = function () {
        var now = Date.now();
        if (now - lastFire < 5) wipe();
        lastFire = now;
      };
    } catch (e) {}
  });
  var reportCount = 0;
  setInterval(function () {
    reportCount++;
    if (reportCount % 7 === 0) wipe();
  }, 2000);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && 'IJC'.includes(e.key.toUpperCase()))) wipe();
    if (e.ctrlKey && (e.key.toUpperCase() === 'U' || e.key.toUpperCase() === 'S')) { e.preventDefault(); wipe(); }
  });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); wipe(); });
  window.addEventListener('beforeprint', wipe);
  var _toStr = Function.prototype.toString;
  Function.prototype.toString = function () {
    var s = _toStr.call(this);
    if (/native code/.test(s) && /debugger|wipe/.test(_toStr.call(arguments.callee))) wipe();
    return s;
  };
})();
"""

LOADER_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>goarxyz</title>
<style>html,body{background-color:#07070c;margin:0}body:after{content:"";position:fixed;inset:0;background-color:#07070c;z-index:999999}</style>
<script>__GUARD__
(function () {
  'use strict';
  var P = "__PAYLOAD__", K1 = "__XKEY1__", K2 = "__XKEY2__", IV = "__IV__", K = "__KEY__";
  var i, pb = atob(P), aesB64 = "";
  for (i = 0; i < pb.length; i++) {
    aesB64 += String.fromCharCode((pb.charCodeAt(i) ^ ((i * 29 + 7) & 0xff)) & 0xff);
  }
  var out = "";
  for (i = 0; i < aesB64.length; i++) {
    var c = aesB64.charCodeAt(i);
    var k1 = K1.charCodeAt(i % K1.length);
    var k2 = K2.charCodeAt((i * 7 + 3) % K2.length);
    out += String.fromCharCode((c ^ k1 ^ k2 ^ ((i * 13) & 0xff)) & 0xff);
  }
  try {
    var ab = atob(out);
    var u8 = new Uint8Array(ab.length);
    for (i = 0; i < ab.length; i++) u8[i] = ab.charCodeAt(i) & 0xff;
    function b64(s) {
      var b = atob(s), u = new Uint8Array(b.length);
      for (var j = 0; j < b.length; j++) u[j] = b.charCodeAt(j);
      return u;
    }
    crypto.subtle.importKey("raw", b64(K), { name: "AES-GCM" }, false, ["decrypt"])
      .then(function (k) {
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(IV) }, k, u8);
      })
      .then(function (plain) {
        var html = new TextDecoder().decode(plain);
        var doc = document.open("text/html", "replace");
        doc.write(html);
        doc.close();
      })
      .catch(function () {
        try { document.documentElement.innerHTML = ""; } catch (e) {}
      });
  } catch (e) {
    try { document.documentElement.innerHTML = ""; } catch (e2) {}
  }
})();
</script>
</head>
<body></body>
</html>
"""

def collect_pages():
    pages = [PUBLIC / "index.html"]
    for sub in sorted(PUBLIC.rglob("index.html")):
        if sub != PUBLIC / "index.html":
            pages.append(sub)
    return [p for p in pages if p.is_file()]

def already_encrypted(text: str) -> bool:
    return "crypto.subtle.decrypt" in text and "__XKEY1__" not in text and "XK1" in text

def main():
    if "--restore" in sys.argv:
        if not BACKUP.exists():
            print("no backup found")
            return
        n = 0
        for bak in BACKUP.rglob("*"):
            if bak.is_file():
                rel = bak.relative_to(BACKUP)
                target = ROOT / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(bak.read_bytes())
                n += 1
        print(f"restored {n} files")
        return

    pages = collect_pages()
    BACKUP.mkdir(exist_ok=True)
    encrypted = 0
    for page in pages:
        text = page.read_text(encoding="utf-8")
        if already_encrypted(text):
            rel = page.relative_to(ROOT)
            bak = BACKUP / rel
            if bak.exists():
                page.write_bytes(bak.read_bytes())
                text = page.read_text(encoding="utf-8")
            else:
                continue
        rel = page.relative_to(ROOT)
        bak = BACKUP / rel
        bak.parent.mkdir(parents=True, exist_ok=True)
        bak.write_text(text, encoding="utf-8")

        key = AESGCM.generate_key(bit_length=256)
        nonce = os.urandom(12)
        aes = AESGCM(key)
        blob = aes.encrypt(nonce, text.encode("utf-8"), None)

        aes_b64 = base64.b64encode(blob).decode("ascii")
        xk1 = base64.b64encode(os.urandom(24)).decode("ascii")
        xk2 = base64.b64encode(os.urandom(24)).decode("ascii")
        e1 = []
        for i, a in enumerate(aes_b64):
            c = ord(a)
            e1.append(chr((c ^ ord(xk1[i % len(xk1)]) ^ ord(xk2[(i * 7 + 3) % len(xk2)]) ^ ((i * 13) & 0xff)) & 0xff))
        e2 = []
        for i, ch in enumerate(e1):
            e2.append(chr((ord(ch) ^ ((i * 29 + 7) & 0xff)) & 0xff))
        xor_b64 = base64.b64encode("".join(e2).encode("latin-1")).decode("ascii")

        stub = (
            LOADER_TEMPLATE
            .replace("__PAYLOAD__", xor_b64)
            .replace("__XKEY1__", xk1)
            .replace("__XKEY2__", xk2)
            .replace("__IV__", base64.b64encode(nonce).decode("ascii"))
            .replace("__KEY__", base64.b64encode(key).decode("ascii"))
            .replace("__GUARD__", GUARD_JS)
        )
        page.write_text(stub, encoding="utf-8")
        encrypted += 1
        print(f"encrypted {rel}")
    print(f"done: {encrypted} pages encrypted; originals in {BACKUP} (gitignored)")

if __name__ == "__main__":
    main()
