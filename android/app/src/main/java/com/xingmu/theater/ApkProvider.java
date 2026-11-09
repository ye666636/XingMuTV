package com.xingmu.theater;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * 给系统安装器提供下载好的 APK（content:// 形式）。
 *
 * Android 7.0 起跨应用传 file:// 会抛 FileUriExposedException；项目不依赖 AndroidX，
 * 所以这里用纯 framework 实现一个只读 ContentProvider，覆盖到 minSdk 21 的老电视盒子。
 */
public class ApkProvider extends ContentProvider {

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File dir = new File(getContext().getExternalFilesDir(null), "updates");
        File file = new File(dir, String.valueOf(uri.getLastPathSegment()));
        try {
            if (!file.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator)) {
                throw new FileNotFoundException("invalid path");
            }
        } catch (java.io.IOException error) {
            throw new FileNotFoundException("invalid path");
        }
        if (!file.isFile()) throw new FileNotFoundException("apk not found");
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
