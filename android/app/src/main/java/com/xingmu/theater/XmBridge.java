package com.xingmu.theater;

import android.app.Activity;
import android.content.Intent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * WebView 与原生之间的桥：只做三件事 —— 发 HTTP、起播放器、报版本。
 * 所有耗时操作都在后台线程，回调通过 __xmHttp 回到 JS。
 */
public class XmBridge {

    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private final Activity activity;
    private final WebView webView;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    XmBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public String version() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (Exception error) {
            return "0.1.0";
        }
    }

    @JavascriptInterface
    public void toast(String message) {
        activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show());
    }

    /** 发起一次 GET；完成后调用 window.__xmHttp(id, status, body)。 */
    @JavascriptInterface
    public void http(final String url, final String headersJson, final int callbackId) {
        pool.execute(() -> {
            int status = 0;
            String body = "";
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(12000);
                connection.setReadTimeout(18000);
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9");
                if (headersJson != null && !headersJson.isEmpty()) {
                    JSONObject headers = new JSONObject(headersJson);
                    Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        connection.setRequestProperty(key, headers.optString(key));
                    }
                }
                status = connection.getResponseCode();
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                body = readAll(stream);
                connection.disconnect();
            } catch (Exception error) {
                status = 0;
                body = "{\"error\":" + JSONObject.quote(String.valueOf(error.getMessage())) + "}";
            }
            final int finalStatus = status;
            final String finalBody = body;
            activity.runOnUiThread(() -> {
                if (webView == null) return;
                String js = "window.__xmHttp(" + callbackId + "," + finalStatus + "," + JSONObject.quote(finalBody) + ")";
                webView.evaluateJavascript(js, null);
            });
        });
    }

    /** 打开原生播放器。参数是 JSON：url / userAgent / referer / title / index / total / seriesId。 */
    @JavascriptInterface
    public void play(String payloadJson) {
        String url = "";
        String title = "";
        int index = 1;
        int total = 0;
        String userAgent = "";
        String referer = "";
        boolean preview = false;
        try {
            JSONObject payload = new JSONObject(payloadJson);
            url = payload.optString("url");
            title = payload.optString("title");
            index = payload.optInt("index", 1);
            total = payload.optInt("total", 0);
            userAgent = payload.optString("userAgent");
            referer = payload.optString("referer");
            preview = payload.optBoolean("preview", false);
        } catch (Exception ignored) {
            // 参数异常时按空处理，播放器会给出明确提示。
        }
        if (url.isEmpty()) {
            toast("没有拿到播放地址，请重试");
            return;
        }
        Intent intent = new Intent(activity, PlayerActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("title", title);
        intent.putExtra("index", index);
        intent.putExtra("total", total);
        intent.putExtra("userAgent", userAgent);
        intent.putExtra("referer", referer);
        intent.putExtra("preview", preview);
        activity.startActivity(intent);
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[16 * 1024];
        int read;
        int total = 0;
        while ((read = stream.read(chunk)) > 0) {
            total += read;
            if (total > MAX_BYTES) break;
            buffer.write(chunk, 0, read);
        }
        stream.close();
        return buffer.toString("UTF-8");
    }
}
