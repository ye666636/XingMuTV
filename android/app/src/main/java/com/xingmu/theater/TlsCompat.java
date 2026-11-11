package com.xingmu.theater;

import android.content.Context;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.Socket;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/**
 * 老电视 HTTPS 兼容层。
 *
 * 实测 hongguoduanju.com 只接受 TLS 1.2（TLS 1.0/1.1 握手直接失败），证书链根是
 * DigiCert Global Root G2。Android 5/6 的部分厂商实现默认只开 TLS 1.0，且精简系统的
 * 根证书库可能缺这张 G2 根证书 —— 两者都会让所有数据请求失败，界面表现为「连不上网」。
 *
 * 这里做两件事：把系统根证书 + 内置 G2 根一起装进 TrustManager，再强制 socket 启用
 * TLS 1.1/1.2。不关闭证书校验（不会退化成信任所有证书）。
 */
public final class TlsCompat {

    private static volatile SSLSocketFactory cached;
    private static volatile boolean attempted;

    private TlsCompat() { }

    /** 返回兼容 socket factory；构建失败时返回 null，调用方退回系统默认。 */
    public static SSLSocketFactory get(Context context) {
        if (!attempted) {
            synchronized (TlsCompat.class) {
                if (!attempted) {
                    attempted = true;
                    try {
                        cached = build(context.getApplicationContext());
                    } catch (Exception error) {
                        cached = null;
                    }
                }
            }
        }
        return cached;
    }

    private static SSLSocketFactory build(Context context) throws Exception {
        KeyStore store = KeyStore.getInstance(KeyStore.getDefaultType());
        store.load(null, null);

        // 1) 系统自带根证书
        TrustManagerFactory systemFactory =
                TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        systemFactory.init((KeyStore) null);
        int index = 0;
        for (TrustManager manager : systemFactory.getTrustManagers()) {
            if (!(manager instanceof X509TrustManager)) continue;
            X509Certificate[] accepted = ((X509TrustManager) manager).getAcceptedIssuers();
            if (accepted == null) continue;
            for (X509Certificate cert : accepted) {
                store.setCertificateEntry("system-" + (index++), cert);
            }
        }

        // 2) 额外内置官网证书链的根（老电视系统根库可能没有）
        CertificateFactory certFactory = CertificateFactory.getInstance("X.509");
        InputStream stream = context.getResources().openRawResource(R.raw.digicert_root_g2);
        try {
            Certificate root = certFactory.generateCertificate(stream);
            store.setCertificateEntry("digicert-global-root-g2", root);
        } finally {
            try { stream.close(); } catch (IOException ignored) { }
        }

        TrustManagerFactory trustFactory =
                TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        trustFactory.init(store);
        SSLContext sslContext = SSLContext.getInstance("TLSv1.2");
        sslContext.init(null, trustFactory.getTrustManagers(), null);
        return new ForceTls12Factory(sslContext.getSocketFactory());
    }

    /** 某些厂商实现即便用了 TLSv1.2 的 SSLContext，socket 仍只开 TLS 1.0，这里显式打开。 */
    private static final class ForceTls12Factory extends SSLSocketFactory {
        private final SSLSocketFactory delegate;

        ForceTls12Factory(SSLSocketFactory delegate) {
            this.delegate = delegate;
        }

        private Socket patch(Socket socket) {
            if (socket instanceof SSLSocket) {
                try {
                    ((SSLSocket) socket).setEnabledProtocols(new String[]{"TLSv1.1", "TLSv1.2"});
                } catch (Exception ignored) { }
            }
            return socket;
        }

        @Override public String[] getDefaultCipherSuites() { return delegate.getDefaultCipherSuites(); }
        @Override public String[] getSupportedCipherSuites() { return delegate.getSupportedCipherSuites(); }
        @Override public Socket createSocket(Socket s, String host, int port, boolean autoClose) throws IOException {
            return patch(delegate.createSocket(s, host, port, autoClose));
        }
        @Override public Socket createSocket(String host, int port) throws IOException {
            return patch(delegate.createSocket(host, port));
        }
        @Override public Socket createSocket(String host, int port, InetAddress localHost, int localPort) throws IOException {
            return patch(delegate.createSocket(host, port, localHost, localPort));
        }
        @Override public Socket createSocket(InetAddress host, int port) throws IOException {
            return patch(delegate.createSocket(host, port));
        }
        @Override public Socket createSocket(InetAddress address, int port, InetAddress localAddress, int localPort) throws IOException {
            return patch(delegate.createSocket(address, port, localAddress, localPort));
        }
        @Override public Socket createSocket() throws IOException {
            return patch(delegate.createSocket());
        }
    }
}
