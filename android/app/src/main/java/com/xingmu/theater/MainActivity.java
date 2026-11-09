package com.xingmu.theater;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * 星幕剧场 Android TV 主界面：全屏 WebView 承载现有的 React 界面，
 * 目录/搜索/详情都通过 XmBridge 走原生网络，播放交给 PlayerActivity。
 */
public class MainActivity extends Activity {

    private WebView webView;
    private LocalServer server;
    private long lastBackAt = 0;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
        webView = new WebView(this);
        webView.setBackgroundColor(0xFF000000);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setAllowUniversalAccessFromFileURLs(true);
            settings.setAllowFileAccessFromFileURLs(true);
        }

        WebView.setWebContentsDebuggingEnabled(true);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // 站外的二维码/广告一律不接管，全部留在应用内的播放页逻辑里。
                return !(url.startsWith("file://") || url.startsWith("about:") || url.contains("127.0.0.1"));
            }
        });

        webView.addJavascriptInterface(new XmBridge(this, webView), "XM");
        String startUrl = "file:///android_asset/index.html";
        try {
            server = new LocalServer(getAssets());
            int port = server.start();
            startUrl = "http://127.0.0.1:" + port + "/index.html";
        } catch (Exception error) {
            // 本地服务起不来时退回 file://：界面可能因 origin 限制白屏，但至少能加载。
            server = null;
        }
        webView.loadUrl(startUrl);
        webView.requestFocus();
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
    }

    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    /** 遥控器返回键：先让界面自己处理（关弹窗 / 退播放页），回到首页再按一次才退出应用。 */
    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "(function(){try{return window.__xmBack?window.__xmBack():'exit';}catch(e){return 'exit';}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        boolean exit = value == null || value.contains("exit");
                        if (!exit) return;
                        long now = System.currentTimeMillis();
                        if (now - lastBackAt < 2000) {
                            finish();
                        } else {
                            lastBackAt = now;
                            android.widget.Toast.makeText(MainActivity.this,
                                    "再按一次返回键退出星幕剧场", android.widget.Toast.LENGTH_SHORT).show();
                        }
                    }
                });
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // 播放器接管远程的播放/暂停键，这里把媒体键转给界面，避免系统吞掉。
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
            webView.evaluateJavascript("(function(){window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));})()", null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (server != null) {
            server.stop();
            server = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
