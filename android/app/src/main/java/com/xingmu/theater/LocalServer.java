package com.xingmu.theater;

import android.content.res.AssetManager;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 极简本地静态服务器：把 APK 里的 assets 通过 http://127.0.0.1:port 提供出来。
 *
 * 为什么不直接用 file://：WebView 里 ES module 与 localStorage 在 file:// 下会因
 * origin 为 null 被拦，界面会白屏。起一个只监听本机回环的小服务最稳，
 * 也不用额外依赖任何三方库。
 */
public class LocalServer {

    private final AssetManager assets;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private ServerSocket socket;
    private int port = 0;

    public LocalServer(AssetManager assets) {
        this.assets = assets;
    }

    public int start() throws IOException {
        ServerSocket server = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
        this.socket = server;
        this.port = server.getLocalPort();
        Thread accept = new Thread(() -> {
            while (!server.isClosed()) {
                try {
                    final Socket client = server.accept();
                    pool.execute(() -> handle(client));
                } catch (IOException ignored) {
                    return;
                }
            }
        }, "xingmu-assets");
        accept.setDaemon(true);
        accept.start();
        return port;
    }

    public void stop() {
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) { }
        pool.shutdownNow();
    }

    private void handle(Socket client) {
        try (Socket connection = client) {
            connection.setSoTimeout(8000);
            InputStream in = new BufferedInputStream(connection.getInputStream());
            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) return;
            String path = requestLine.split(" ").length > 1 ? requestLine.split(" ")[1] : "/";
            int query = path.indexOf('?');
            if (query >= 0) path = path.substring(0, query);
            if (path.equals("/") || path.isEmpty()) path = "/index.html";
            if (path.startsWith("/")) path = path.substring(1);
            path = java.net.URLDecoder.decode(path, "UTF-8");

            // 读掉请求头，避免客户端等待
            String line;
            do {
                line = readLine(in);
            } while (line != null && !line.isEmpty());

            byte[] body;
            try {
                body = readAsset(path);
            } catch (IOException missing) {
                body = null;
            }
            OutputStream out = connection.getOutputStream();
            if (body == null) {
                String message = "Not Found";
                write(out, "404 Not Found", "text/plain; charset=utf-8", message.getBytes("UTF-8"));
            } else {
                write(out, "200 OK", contentType(path), body);
            }
            out.flush();
        } catch (Exception ignored) {
            // 单个请求失败不影响界面，浏览器会重试。
        }
    }

    private static void write(OutputStream out, String status, String type, byte[] body) throws IOException {
        String head = "HTTP/1.1 " + status + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes("UTF-8"));
        out.write(body);
    }

    private byte[] readAsset(String path) throws IOException {
        try (InputStream stream = assets.open(path)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[32 * 1024];
            int read;
            while ((read = stream.read(chunk)) > 0) buffer.write(chunk, 0, read);
            return buffer.toByteArray();
        }
    }

    private static String readLine(InputStream in) throws IOException {
        StringBuilder builder = new StringBuilder();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') builder.append((char) c);
        }
        return builder.length() == 0 && c == -1 ? null : builder.toString();
    }

    private static final Map<String, String> TYPES = new HashMap<>();
    static {
        TYPES.put("html", "text/html; charset=utf-8");
        TYPES.put("js", "application/javascript; charset=utf-8");
        TYPES.put("mjs", "application/javascript; charset=utf-8");
        TYPES.put("css", "text/css; charset=utf-8");
        TYPES.put("json", "application/json; charset=utf-8");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("png", "image/png");
        TYPES.put("jpg", "image/jpeg");
        TYPES.put("jpeg", "image/jpeg");
        TYPES.put("webp", "image/webp");
        TYPES.put("ico", "image/x-icon");
        TYPES.put("woff2", "font/woff2");
        TYPES.put("woff", "font/woff");
        TYPES.put("ttf", "font/ttf");
        TYPES.put("mp4", "video/mp4");
        TYPES.put("wasm", "application/wasm");
    }

    private static String contentType(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        String type = TYPES.get(ext);
        return type != null ? type : "application/octet-stream";
    }
}
