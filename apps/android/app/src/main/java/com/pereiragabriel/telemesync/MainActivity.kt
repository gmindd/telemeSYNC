package com.pereiragabriel.telemesync

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.WindowInsets
import android.webkit.ConsoleMessage
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

/**
 * The whole app is the web panel (apps/web) in a WebView, served from the APK assets. Rendering happens in the
 * page (browser workers); this activity only adds the file picker and, through [WebAppBridge], shared storage.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var filePicker: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web = WebView(this)
        web.setBackgroundColor(getColor(R.color.background))
        // Android 15 draws apps edge to edge: keep the page clear of the status and navigation bars.
        web.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime() or WindowInsets.Type.displayCutout())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsets.CONSUMED
        }
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            mediaPlaybackRequiresUserGesture = false
            setSupportMultipleWindows(false)
        }

        val assets = WebViewAssetLoader.AssetsPathHandler(this)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/") { path -> assets.handle("web/" + path.ifEmpty { "index.html" }) }
            .build()
        web.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            /** Links to the site, donations, e-mail… open outside the app. */
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == APP_HOST) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                } catch (_: ActivityNotFoundException) {
                }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                filePicker?.onReceiveValue(null)
                filePicker = callback
                // The page filters by extension (.fit, .mp4…), which the system picker doesn't know: offer everything,
                // or only videos when the page asks just for videos.
                val videosOnly = params.acceptTypes.any { it.startsWith("video/") }
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(if (videosOnly) "video/*" else "*/*")
                    .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                return try {
                    startActivityForResult(intent, PICK_FILES)
                    true
                } catch (_: ActivityNotFoundException) {
                    filePicker = null
                    false
                }
            }

            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                Log.d("telemeSYNC", "${m.messageLevel()}: ${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                return true
            }
        }
        web.addJavascriptInterface(WebAppBridge(this), "TelemeSYNCAndroid")
        if (savedInstanceState == null) web.loadUrl("https://$APP_HOST/index.html") else web.restoreState(savedInstanceState)
    }

    @Deprecated("Activity result API needs androidx.activity; this is the plain platform one")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != PICK_FILES) return super.onActivityResult(requestCode, resultCode, data)
        val uris = mutableListOf<Uri>()
        if (resultCode == RESULT_OK && data != null) {
            val clip = data.clipData
            if (clip != null) for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
            else data.data?.let { uris.add(it) }
        }
        filePicker?.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
        filePicker = null
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    /** The panel is one page: Back would close it and lose the work, so ask first. */
    @Deprecated("Back handling without androidx.activity")
    override fun onBackPressed() {
        AlertDialog.Builder(this)
            .setMessage(getString(R.string.exit_question))
            .setPositiveButton(getString(R.string.exit_yes)) { _, _ -> finish() }
            .setNegativeButton(getString(R.string.exit_no), null)
            .show()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    companion object {
        /** Virtual host WebViewAssetLoader serves the APK assets on (a secure origin: workers, WebCodecs). */
        const val APP_HOST = "appassets.androidplatform.net"
        private const val PICK_FILES = 1
    }
}
