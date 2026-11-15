package com.pereiragabriel.telemesync;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Updates the app from inside it: downloads the new APK from the project's GitHub releases into the cache, then hands
 * it to Android's installer. The first time, Android asks to allow installing apps from telemeSYNC. Android itself
 * refuses an APK that isn't signed with the same key as the installed app.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    private static final String ALLOWED = "https://github.com/gmindd/telemeSYNC/releases/download/";

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith(ALLOWED) || !url.endsWith(".apk") || url.contains("..")) {
            call.reject("invalid url");
            return;
        }
        new Thread(() -> {
            try {
                download(url, apkFile());
                getActivity().runOnUiThread(() -> installOrAsk(call));
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "download failed", e);
            }
        }).start();
    }

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, "telemesync-update.apk");
    }

    /** Follows GitHub's redirect to its file storage (https only) and reports progress as it goes. */
    private void download(String url, File target) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        int code = conn.getResponseCode();
        if (code != 200) throw new IllegalStateException("HTTP " + code);
        if (!"https".equals(conn.getURL().getProtocol())) throw new IllegalStateException("insecure redirect");
        long total = conn.getContentLengthLong();
        long done = 0;
        int lastPercent = -1;
        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(target)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                done += n;
                int percent = total > 0 ? (int) (done * 100 / total) : -1;
                if (percent != lastPercent) {
                    lastPercent = percent;
                    JSObject p = new JSObject();
                    p.put("fraction", total > 0 ? (double) done / total : -1);
                    notifyListeners("progress", p);
                }
            }
        } finally {
            conn.disconnect();
        }
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private void installOrAsk(PluginCall call) {
        if (canInstall()) {
            launchInstaller(call);
            return;
        }
        // "Install unknown apps" for telemeSYNC; the installer opens when the user comes back with it allowed.
        notifyListeners("permission", new JSObject());
        Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        startActivityForResult(call, settings, "afterPermission");
    }

    @ActivityCallback
    private void afterPermission(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (canInstall()) launchInstaller(call);
        else call.reject("permission");
    }

    private void launchInstaller(PluginCall call) {
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apkFile());
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "installer failed", e);
        }
    }
}
