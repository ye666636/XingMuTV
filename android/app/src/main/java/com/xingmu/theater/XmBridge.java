package com.xingmu.theater;

import android.app.Activity;
import android.app.UiModeManager;
import android.content.Context;
import android.content.res.Configuration;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

/**
 * WebView 与原生之间的桥：发 HTTP、起播放器、下载安装新版 APK、报版本。
 * 所有耗时操作都在后台线程，回调通过 __xmHttp / __xmDownloadProgress 回到 JS。
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

    /** 电视与手机共用同一个 APK：电视用 1600 CSS 宽度铺满大屏，手机用 device-width。 */
    @JavascriptInterface
    public boolean isTv() {
        UiModeManager manager = (UiModeManager) activity.getSystemService(Context.UI_MODE_SERVICE);
        if (manager != null && manager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
        // 部分电视盒子/模拟器不声明 leanback UI mode，改用可用宽度（dp）判断：
        // 1080p 电视约 960dp，普通手机约 360~420dp。
        return activity.getResources().getConfiguration().screenWidthDp >= 900;
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

    /** 统一配置 HTTPS（老电视强制 TLS 1.2 + 内置根证书），并设置请求头。 */
    private HttpURLConnection open(String url, String headersJson) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        if (connection instanceof HttpsURLConnection) {
            javax.net.ssl.SSLSocketFactory factory = TlsCompat.get(activity);
            if (factory != null) ((HttpsURLConnection) connection).setSSLSocketFactory(factory);
        }
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
        return connection;
    }

    private String deviceTime() {
        try {
            return new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.CHINA).format(new Date());
        } catch (Exception error) {
            return String.valueOf(System.currentTimeMillis());
        }
    }

    private String networkSummary() {
        try {
            ConnectivityManager manager =
                    (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo info = manager == null ? null : manager.getActiveNetworkInfo();
            if (info == null) return "网络：无活动连接";
            return "网络：" + info.getTypeName() + (info.isConnected() ? "已连接" : "未连接");
        } catch (Exception error) {
            return "网络：状态未知";
        }
    }

    /** 把 Java 异常翻成电视上能看懂的中文，并附上设备时间/网络状态，方便直接拍屏定位。 */
    private String describeFailure(Exception error) {
        String type = error.getClass().getSimpleName();
        String raw = String.valueOf(error.getMessage());
        String lower = (type + " " + raw).toLowerCase(Locale.US);
        String hint;
        if (lower.contains("notyetvalid") || lower.contains("expired") || lower.contains("not valid")) {
            hint = "电视系统日期时间不对，请到「设置 → 日期时间」校对后重试（证书有效期校验失败）";
        } else if (lower.contains("trust anchor") || lower.contains("certpath") || lower.contains("certificate") && lower.contains("unknown")) {
            hint = "证书不被信任：系统根证书过旧或设备时间不对（本版已内置官网根证书）";
        } else if (lower.contains("sslhandshake") || lower.contains("sslprotocol") || lower.contains("protocol")) {
            hint = "TLS 握手失败：官网只支持 TLS 1.2（本版已强制启用，仍失败请校对电视时间）";
        } else if (lower.contains("unknownhost")) {
            hint = "DNS 解析失败：检查电视网络，或把 DNS 改为 223.5.5.5 / 114.114.114.114";
        } else if (lower.contains("timeout") || lower.contains("timed out")) {
            hint = "连接超时：检查电视 Wi-Fi / 网线是否正常联网";
        } else if (lower.contains("refused") || lower.contains("failed to connect") || lower.contains("unreachable")) {
            hint = "连不上服务器：检查电视网络是否被路由器隔离或需要网页认证";
        } else {
            hint = "网络请求失败，请检查电视网络";
        }
        return hint + "｜" + type + ": " + raw + "｜设备时间 " + deviceTime() + "｜" + networkSummary();
    }

    /** 发起一次 GET；完成后调用 window.__xmHttp(id, status, body)。失败带真实原因。 */
    @JavascriptInterface
    public void http(final String url, final String headersJson, final int callbackId) {
        pool.execute(() -> {
            int status = 0;
            String body = "";
            Exception failure = null;
            // 网络抖动时重试一次，老电视 WiFi 偶发丢包很常见。
            for (int attempt = 0; attempt < 2; attempt++) {
                try {
                    HttpURLConnection connection = open(url, headersJson);
                    status = connection.getResponseCode();
                    InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                    body = readAll(stream);
                    connection.disconnect();
                    failure = null;
                    break;
                } catch (Exception error) {
                    failure = error;
                    status = 0;
                    if (attempt == 0) {
                        try { Thread.sleep(400); } catch (InterruptedException ignored) { }
                    }
                }
            }
            if (failure != null) {
                body = "{\"error\":" + JSONObject.quote(describeFailure(failure)) + "}";
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

    /** 设置页「网络诊断」：逐项检测并把结果直接显示到电视屏幕上，方便拍屏反馈。 */
    @JavascriptInterface
    public void diagnose(final int callbackId) {
        pool.execute(() -> {
            JSONArray lines = new JSONArray();
            lines.put("星幕剧场 网络诊断  v" + version());
            lines.put("① 设备时间：" + deviceTime());
            lines.put("② " + networkSummary());
            try {
                InetAddress address = InetAddress.getByName("hongguoduanju.com");
                lines.put("③ DNS 解析：OK → " + address.getHostAddress());
            } catch (Exception error) {
                lines.put("③ DNS 解析：失败 → " + error.getClass().getSimpleName() + " " + error.getMessage());
            }
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress("hongguoduanju.com", 443), 8000);
                lines.put("④ TCP 443 连接：OK");
            } catch (Exception error) {
                lines.put("④ TCP 443 连接：失败 → " + error.getClass().getSimpleName() + " " + error.getMessage());
            }
            try {
                HttpURLConnection connection = open("https://hongguoduanju.com/category/real-drama", "");
                int code = connection.getResponseCode();
                connection.disconnect();
                lines.put("⑤ HTTPS 请求（TLS1.2+内置根证书）：HTTP " + code);
            } catch (Exception error) {
                lines.put("⑤ HTTPS 请求：失败 → " + error.getClass().getSimpleName() + " " + error.getMessage());
            }
            lines.put(TlsCompat.get(activity) != null ? "⑥ TLS 兼容层：已启用（TLS 1.2 + DigiCert G2 根）" : "⑥ TLS 兼容层：构建失败，使用系统默认");
            lines.put("把这一屏拍给开发者即可定位；按返回键或点击任意处关闭。");
            final String payload = lines.toString();
            activity.runOnUiThread(() -> {
                if (webView == null) return;
                webView.evaluateJavascript("window.__xmDiagnose(" + callbackId + "," + JSONObject.quote(payload) + ")", null);
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

    private volatile boolean downloadCancelled = false;

    private void emitDownload(final int percent, final String status, final String path, final String message) {
        activity.runOnUiThread(() -> {
            if (webView == null) return;
            String js = "window.__xmDownloadProgress(" + percent + "," + JSONObject.quote(status) + ","
                    + JSONObject.quote(path == null ? "" : path) + "," + JSONObject.quote(message == null ? "" : message) + ")";
            webView.evaluateJavascript(js, null);
        });
    }

    /** 下载 GitHub Release 里的新版 APK 到外部私有目录，回调进度到 WebView。 */
    @JavascriptInterface
    public void downloadApk(final String url, final String version) {
        downloadCancelled = false;
        pool.execute(() -> {
            File dir = new File(activity.getExternalFilesDir(null), "updates");
            if (!dir.exists() && !dir.mkdirs()) {
                emitDownload(0, "error", "", "无法创建下载目录");
                return;
            }
            String safe = String.valueOf(version).replaceAll("[^0-9A-Za-z._-]", "_");
            File target = new File(dir, "XingMuTV-" + safe + ".apk");
            File temp = new File(dir, "XingMuTV-" + safe + ".apk.part");
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                if (connection instanceof HttpsURLConnection) {
                    javax.net.ssl.SSLSocketFactory factory = TlsCompat.get(activity);
                    if (factory != null) ((HttpsURLConnection) connection).setSSLSocketFactory(factory);
                }
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setRequestMethod("GET");
                connection.setRequestProperty("User-Agent", "XingMuTV-Android-Updater");
                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
                long total = connection.getContentLength();
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(temp)) {
                    byte[] chunk = new byte[32 * 1024];
                    long received = 0;
                    int lastPercent = -1;
                    int read;
                    while ((read = in.read(chunk)) > 0) {
                        if (downloadCancelled) throw new InterruptedException("cancelled");
                        out.write(chunk, 0, read);
                        received += read;
                        if (total > 0) {
                            int percent = (int) Math.min(99, received * 100 / total);
                            if (percent >= lastPercent + 5) { lastPercent = percent; emitDownload(percent, "progress", "", ""); }
                        }
                    }
                }
                connection.disconnect();
                if (downloadCancelled) throw new InterruptedException("cancelled");
                if (target.exists() && !target.delete()) throw new IllegalStateException("无法覆盖旧安装包");
                if (!temp.renameTo(target)) throw new IllegalStateException("安装包保存失败");
                emitDownload(100, "done", target.getAbsolutePath(), "");
            } catch (InterruptedException cancelled) {
                if (temp.exists()) temp.delete();
                emitDownload(0, "idle", "", "");
            } catch (Exception error) {
                if (temp.exists()) temp.delete();
                emitDownload(0, "error", "", String.valueOf(error.getMessage()));
            }
        });
    }

    @JavascriptInterface
    public void cancelDownload() {
        downloadCancelled = true;
    }

    /** 调起系统安装器。Android 7+ 用自建 ContentProvider 提供 content:// URI，避免 FileUriExposedException。 */
    @JavascriptInterface
    public void installApk(final String path) {
        File apk = new File(path);
        if (!apk.isFile()) { toast("安装包不存在，请重新下载"); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(settings);
                toast("请允许「安装未知应用」后，再点一次立即安装");
            } catch (Exception error) {
                toast("请在系统设置里允许安装未知来源应用");
            }
            return;
        }
        try {
            Uri apkUri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                apkUri = Uri.parse("content://" + activity.getPackageName() + ".apkprovider/updates/" + apk.getName());
            } else {
                apkUri = Uri.fromFile(apk);
            }
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception error) {
            toast("无法打开安装器：" + error.getMessage());
        }
    }

    @JavascriptInterface
    public void openRelease(final String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception error) {
            toast("无法打开发布页，请用手机访问 GitHub");
        }
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
