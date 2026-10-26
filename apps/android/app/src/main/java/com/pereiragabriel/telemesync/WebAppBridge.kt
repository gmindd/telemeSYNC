package com.pereiragabriel.telemesync

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.util.Base64
import android.view.WindowManager
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * `window.TelemeSYNCAndroid` in the page (apps/web/src/lib/local/android.ts). Writes the exports into shared
 * storage through MediaStore, so they show up in the Files app and can be copied to a computer.
 * Paths are relative to the storage root, e.g. "Documents/telemeSYNC/2024-06-15 Sintra/GX010123/GX010123_speed.mov".
 * Methods run on the WebView's bridge thread and return "" on success or an error message.
 */
class WebAppBridge(private val activity: Activity) {
    private class OpenFile(val uri: Uri, val pfd: ParcelFileDescriptor, val channel: FileChannel) {
        var position = 0L
    }

    private val files = ConcurrentHashMap<Int, OpenFile>()
    private val nextId = AtomicInteger(1)
    private val resolver get() = activity.contentResolver
    private val collection get() = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)

    @JavascriptInterface
    fun appVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun defaultOutputDir(): String = "Documents/telemeSYNC"

    /** Creates the file (replacing one this app made before), hidden from other apps until [close]. */
    @JavascriptInterface
    fun createFile(relPath: String, mime: String): String = try {
        val (dir, name) = split(relPath)
        deleteExisting(dir, name)
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "$dir/")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(collection, values) ?: throw IllegalStateException("MediaStore refused $relPath")
        val pfd = resolver.openFileDescriptor(uri, "rw") ?: throw IllegalStateException("Cannot open $relPath")
        val id = nextId.getAndIncrement()
        files[id] = OpenFile(uri, pfd, FileOutputStream(pfd.fileDescriptor).channel)
        JSONObject().put("id", id).toString()
    } catch (e: Exception) {
        JSONObject().put("error", e.message ?: e.toString()).toString()
    }

    @JavascriptInterface
    fun write(id: Int, base64: String): String = io(id) { f ->
        val buf = ByteBuffer.wrap(Base64.decode(base64, Base64.DEFAULT))
        while (buf.hasRemaining()) f.position += f.channel.write(buf, f.position)
    }

    /** Overwrites bytes already written (container headers patched at the end). */
    @JavascriptInterface
    fun writeAt(id: Int, offset: Double, base64: String): String = io(id) { f ->
        val buf = ByteBuffer.wrap(Base64.decode(base64, Base64.DEFAULT))
        var pos = offset.toLong()
        while (buf.hasRemaining()) pos += f.channel.write(buf, pos)
    }

    @JavascriptInterface
    fun close(id: Int): String {
        val f = files.remove(id) ?: return "File $id is not open"
        return try {
            f.channel.force(true)
            f.pfd.close()
            resolver.update(f.uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            ""
        } catch (e: Exception) {
            e.message ?: e.toString()
        }
    }

    @JavascriptInterface
    fun abort(id: Int) {
        val f = files.remove(id) ?: return
        try {
            f.pfd.close()
        } catch (_: Exception) {
        }
        try {
            resolver.delete(f.uri, null, null)
        } catch (_: Exception) {
        }
    }

    @JavascriptInterface
    fun writeText(relPath: String, text: String, mime: String): String {
        val res = JSONObject(createFile(relPath, mime))
        if (res.has("error")) return res.getString("error")
        val id = res.getInt("id")
        val err = write(id, Base64.encodeToString(text.toByteArray(Charsets.UTF_8), Base64.NO_WRAP))
        if (err.isNotEmpty()) {
            abort(id)
            return err
        }
        return close(id)
    }

    /** Shows the folder in the system Files app (DocumentsUI); false when it can't. */
    @JavascriptInterface
    fun openFolder(relPath: String): Boolean {
        val docId = "primary:" + relPath.trim('/')
        val uri = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", docId)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, DocumentsContract.Document.MIME_TYPE_DIR)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        return onUiThread {
            try {
                activity.startActivity(intent)
                true
            } catch (_: ActivityNotFoundException) {
                false
            } catch (_: SecurityException) {
                false
            }
        }
    }

    /** Keeps the screen on while exporting: with the screen off Android pauses the page and the export stops. */
    @JavascriptInterface
    fun keepAwake(on: Boolean) {
        activity.runOnUiThread {
            if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    private inline fun io(id: Int, block: (OpenFile) -> Unit): String {
        val f = files[id] ?: return "File $id is not open"
        return try {
            block(f)
            ""
        } catch (e: Exception) {
            e.message ?: e.toString()
        }
    }

    private fun <T> onUiThread(block: () -> T): T {
        var result: T? = null
        val done = CountDownLatch(1)
        activity.runOnUiThread {
            result = block()
            done.countDown()
        }
        done.await(5, TimeUnit.SECONDS)
        @Suppress("UNCHECKED_CAST")
        return result as T
    }

    /** "Documents/a/b.mov" → ("Documents/a", "b.mov"). */
    private fun split(relPath: String): Pair<String, String> {
        val clean = relPath.replace('\\', '/').trim('/')
        val slash = clean.lastIndexOf('/')
        require(slash > 0) { "Invalid path: $relPath" }
        return clean.substring(0, slash) to clean.substring(slash + 1)
    }

    /** Re-exporting replaces the old file instead of adding "name (1).mov" (only files made by this app). */
    private fun deleteExisting(dir: String, name: String) {
        resolver.query(
            collection,
            arrayOf(MediaStore.MediaColumns._ID),
            "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND ${MediaStore.MediaColumns.DISPLAY_NAME} = ?",
            arrayOf("$dir/", name),
            null,
        )?.use { c ->
            while (c.moveToNext()) {
                try {
                    resolver.delete(Uri.withAppendedPath(collection, c.getLong(0).toString()), null, null)
                } catch (_: SecurityException) {
                    // made by another install of the app: MediaStore picks a new name
                }
            }
        }
    }
}
