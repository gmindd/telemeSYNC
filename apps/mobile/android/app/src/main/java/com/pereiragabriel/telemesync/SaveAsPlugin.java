package com.pereiragabriel.telemesync;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * "Save as": the system's file dialog (Storage Access Framework), where the user picks the folder and can change the
 * name, then the exported video is copied there from the app's cache. No storage permission is needed.
 */
@CapacitorPlugin(name = "SaveAs")
public class SaveAsPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String path = call.getString("path");
        String name = call.getString("name", "telemesync.mp4");
        if (path == null || path.contains("..")) {
            call.reject("invalid path");
            return;
        }
        File source = new File(getContext().getCacheDir(), path);
        if (!source.isFile()) {
            call.reject("file not found");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "video/mp4"));
        intent.putExtra(Intent.EXTRA_TITLE, name);
        String initial = call.getString("initialUri");
        // Opens in the folder of the previous save (Android 8+; ignored when that folder is gone).
        if (initial != null) intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(initial));
        startActivityForResult(call, intent, "onPicked");
    }

    @ActivityCallback
    private void onPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri target = data.getData();
        File source = new File(getContext().getCacheDir(), call.getString("path"));
        // Copied off the main thread: a long video is hundreds of megabytes.
        new Thread(() -> {
            try (InputStream in = new FileInputStream(source); OutputStream out = getContext().getContentResolver().openOutputStream(target, "wt")) {
                if (out == null) throw new IllegalStateException("cannot open the destination");
                byte[] buf = new byte[1 << 20];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                out.flush();
                JSObject ret = new JSObject();
                ret.put("cancelled", false);
                ret.put("uri", target.toString());
                ret.put("name", displayName(target));
                ret.put("folder", folderOf(target));
                call.resolve(ret);
            } catch (Exception e) {
                try {
                    DocumentsContract.deleteDocument(getContext().getContentResolver(), target);
                } catch (Exception ignored) {
                    // the partial file stays; nothing more to do
                }
                call.reject(e.getMessage() != null ? e.getMessage() : "copy failed", e);
            }
        }).start();
    }

    /** File name as the provider stored it (it may add " (1)" when the name is taken). */
    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
            // fall through
        }
        return uri.getLastPathSegment();
    }

    /** Folder path for phone storage ("Movies/telemeSYNC"); null for other providers (Drive…), where it has no meaning. */
    private String folderOf(Uri uri) {
        try {
            if (!"com.android.externalstorage.documents".equals(uri.getAuthority())) return null;
            String id = DocumentsContract.getDocumentId(uri);
            String rel = id.substring(id.indexOf(':') + 1);
            int slash = rel.lastIndexOf('/');
            return slash > 0 ? rel.substring(0, slash) : "";
        } catch (Exception e) {
            return null;
        }
    }
}
