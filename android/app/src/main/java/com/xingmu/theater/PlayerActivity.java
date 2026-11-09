package com.xingmu.theater;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.HashMap;
import java.util.Map;

/**
 * 原生全屏播放器：系统 MediaPlayer + SurfaceView。
 * 直接用官网给的 mp4 直链，带上 Referer / UA，不用在 WebView 里解封装。
 */
public class PlayerActivity extends Activity implements SurfaceHolder.Callback {

    private SurfaceView surfaceView;
    private MediaPlayer player;
    private TextView osd;
    private LinearLayout osdBox;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private String url = "";
    private String title = "";
    private String userAgent = "";
    private String referer = "";
    private int index = 1;
    private int total = 0;
    private boolean preview = false;
    private boolean prepared = false;
    private boolean osdVisible = true;

    private final Runnable hideOsd = () -> {
        osdVisible = false;
        osdBox.animate().alpha(0f).setDuration(220).withEndAction(() -> osdBox.setVisibility(View.GONE)).start();
    };

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            updateOsd();
            if (player != null) handler.postDelayed(this, 500);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);

        Intent intent = getIntent();
        url = intent.getStringExtra("url");
        title = intent.getStringExtra("title");
        userAgent = intent.getStringExtra("userAgent");
        referer = intent.getStringExtra("referer");
        index = intent.getIntExtra("index", 1);
        total = intent.getIntExtra("total", 0);
        preview = intent.getBooleanExtra("preview", false);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        surfaceView = new SurfaceView(this);
        root.addView(surfaceView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        surfaceView.getHolder().addCallback(this);

        osdBox = new LinearLayout(this);
        osdBox.setOrientation(LinearLayout.VERTICAL);
        osdBox.setPadding(dp(40), dp(24), dp(40), dp(24));
        osdBox.setBackgroundColor(0xB3000000);
        osd = new TextView(this);
        osd.setTextColor(0xFFF5F5F7);
        osd.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        osdBox.addView(osd);
        FrameLayout.LayoutParams osdParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        osdParams.gravity = Gravity.TOP;
        root.addView(osdBox, osdParams);

        setContentView(root);
        showOsd();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void showOsd() {
        updateOsd();
        osdBox.setVisibility(View.VISIBLE);
        osdBox.animate().alpha(1f).setDuration(120).start();
        osdVisible = true;
        handler.removeCallbacks(hideOsd);
        handler.postDelayed(hideOsd, 3500);
    }

    private void updateOsd() {
        if (osd == null) return;
        StringBuilder text = new StringBuilder();
        if (title != null && !title.isEmpty()) {
            text.append(title);
            if (total > 0) text.append("  第 ").append(index).append(" / ").append(total).append(" 集");
            text.append('\n');
        }
        text.append(time(player == null ? 0 : player.getCurrentPosition()));
        if (player != null && player.getDuration() > 0) text.append(" / ").append(time(player.getDuration()));
        text.append(player == null || !prepared ? "   正在加载…" : (player.isPlaying() ? "   ▶ 播放中" : "   ⏸ 已暂停"));
        text.append("    返回键退出 · 左右快进快退 · 确定键播放/暂停");
        if (preview) text.append("\n官网公开通道目前只提供约 10 秒预览片；完整剧集需要 App 片源解密，正在开发。");
        osd.setText(text.toString());
    }

    private static String time(int ms) {
        if (ms <= 0) return "00:00";
        int totalSeconds = ms / 1000;
        int minutes = totalSeconds / 60;
        int seconds = totalSeconds % 60;
        return String.format("%02d:%02d", minutes, seconds);
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        startPlayback(holder);
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
        if (player != null) player.setSurface(holder.getSurface());
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        releasePlayer();
    }

    private void startPlayback(SurfaceHolder holder) {
        try {
            player = new MediaPlayer();
            Map<String, String> headers = new HashMap<>();
            if (referer != null && !referer.isEmpty()) headers.put("Referer", referer);
            if (userAgent != null && !userAgent.isEmpty()) headers.put("User-Agent", userAgent);
            player.setDataSource(this, Uri.parse(url), headers);
            player.setDisplay(holder);
            player.setOnPreparedListener(mp -> {
                prepared = true;
                mp.start();
                updateOsd();
                handler.post(tick);
            });
            player.setOnBufferingUpdateListener((mp, percent) -> updateOsd());
            player.setOnCompletionListener(mp -> {
                Toast.makeText(this, "本集播放结束", Toast.LENGTH_SHORT).show();
                finish();
            });
            player.setOnErrorListener((mp, what, extra) -> {
                Toast.makeText(this, "这一集暂时无法播放（" + what + "/" + extra + "），请换一集", Toast.LENGTH_LONG).show();
                finish();
                return true;
            });
            player.prepareAsync();
        } catch (Exception error) {
            Toast.makeText(this, "播放器初始化失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
            finish();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (player == null) return super.onKeyDown(keyCode, event);
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                togglePlay();
                return true;
            case KeyEvent.KEYCODE_DPAD_LEFT:
                seekBy(-10000);
                return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                seekBy(10000);
                return true;
            case KeyEvent.KEYCODE_DPAD_UP:
                seekBy(60000);
                return true;
            case KeyEvent.KEYCODE_DPAD_DOWN:
                seekBy(-60000);
                return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                seekBy(30000);
                return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                seekBy(-30000);
                return true;
            default:
                return super.onKeyDown(keyCode, event);
        }
    }

    private void togglePlay() {
        if (!prepared) return;
        if (player.isPlaying()) player.pause();
        else player.start();
        showOsd();
    }

    private void seekBy(int deltaMs) {
        if (!prepared) return;
        int target = Math.max(0, Math.min(player.getDuration(), player.getCurrentPosition() + deltaMs));
        player.seekTo(target);
        showOsd();
    }

    private void releasePlayer() {
        handler.removeCallbacks(tick);
        if (player != null) {
            try { player.reset(); } catch (Exception ignored) { }
            try { player.release(); } catch (Exception ignored) { }
            player = null;
        }
        prepared = false;
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (player != null && player.isPlaying()) player.pause();
    }

    @Override
    protected void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }
}
