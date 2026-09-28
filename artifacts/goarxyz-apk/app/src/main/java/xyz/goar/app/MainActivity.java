package xyz.goar.app;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebChromeClient.CustomViewCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
  private static final String APP_HOST = "appassets.goar.xyz";
  private WebView web;
  private View customView;
  private CustomViewCallback customCallback;
  private FrameLayout fullscreen;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    fullscreen = new FrameLayout(this);
    web = new WebView(this);
    fullscreen.addView(web, new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT));
    setContentView(fullscreen);

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(true);
    s.setAllowContentAccess(true);
    s.setLoadWithOverviewMode(true);
    s.setUseWideViewPort(true);
    s.setSupportZoom(false);
    s.setBuiltInZoomControls(false);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);
    try { s.setOffscreenPreRaster(true); } catch (Throwable ignored) {}

    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

    web.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (uri == null || !APP_HOST.equals(uri.getHost())) return null;
        return asset(uri.getPath());
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onShowCustomView(View view, CustomViewCallback callback) {
        if (customView != null) {
          callback.onCustomViewHidden();
          return;
        }
        customView = view;
        customCallback = callback;
        web.setVisibility(View.GONE);
        fullscreen.addView(view, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));
      }

      @Override
      public void onHideCustomView() {
        if (customView == null) return;
        fullscreen.removeView(customView);
        customView = null;
        web.setVisibility(View.VISIBLE);
        if (customCallback != null) customCallback.onCustomViewHidden();
        customCallback = null;
      }
    });

    web.loadUrl("https://" + APP_HOST + "/index.html");
  }

  private WebResourceResponse asset(String path) {
    if (path == null || path.contains("..")) return missing();
    if (path.equals("/")) path = "/index.html";
    if (path.endsWith("/")) path = path + "index.html";
    String name = "www" + path;
    try {
      InputStream in = getAssets().open(name);
      return new WebResourceResponse(mime(path), encoding(path), 200, "OK", headers(path), in);
    } catch (Exception e) {
      return missing();
    }
  }

  private WebResourceResponse missing() {
    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers(".txt"),
        new ByteArrayInputStream(new byte[0]));
  }

  private Map<String, String> headers(String path) {
    Map<String, String> h = new HashMap<String, String>();
    h.put("Access-Control-Allow-Origin", "*");
    h.put("Cache-Control", "no-cache");
    return h;
  }

  private String encoding(String path) {
    String m = mime(path);
    if (m.startsWith("text/") || m.contains("javascript") || m.contains("json") || m.contains("xml") || m.contains("svg"))
      return "utf-8";
    return null;
  }

  private String mime(String path) {
    String p = path.toLowerCase();
    int q = p.indexOf('?');
    if (q >= 0) p = p.substring(0, q);
    if (p.endsWith(".html")) return "text/html";
    if (p.endsWith(".css")) return "text/css";
    if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
    if (p.endsWith(".json")) return "application/json";
    if (p.endsWith(".webmanifest")) return "application/manifest+json";
    if (p.endsWith(".svg")) return "image/svg+xml";
    if (p.endsWith(".png")) return "image/png";
    if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
    if (p.endsWith(".webp")) return "image/webp";
    if (p.endsWith(".gif")) return "image/gif";
    if (p.endsWith(".ico")) return "image/x-icon";
    if (p.endsWith(".woff2")) return "font/woff2";
    if (p.endsWith(".woff")) return "font/woff";
    if (p.endsWith(".mp4")) return "video/mp4";
    if (p.endsWith(".m3u") || p.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
    return "application/octet-stream";
  }

  @Override
  public void onBackPressed() {
    if (customView != null) {
      customCallback.onCustomViewHidden();
      return;
    }
    if (web.canGoBack()) web.goBack();
    else super.onBackPressed();
  }

  @Override
  protected void onResume() {
    super.onResume();
    web.onResume();
  }

  @Override
  protected void onPause() {
    web.onPause();
    super.onPause();
  }

  @Override
  protected void onDestroy() {
    web.destroy();
    super.onDestroy();
  }
}
