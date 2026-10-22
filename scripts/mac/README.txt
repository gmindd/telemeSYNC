telemeSYNC - telemetry overlay generator for bike videos (macOS)
================================================================

Works on Macs with Apple Silicon (M1, M2, M3, M4…) and with Intel processors, macOS 11 Big Sur or later.
There is nothing to install: everything the app needs is already in this folder.
The language is chosen with the flags at the top right of the app (English by default).

HOW TO START
1. Open the downloaded ZIP (Safari usually opens it by itself and leaves the "telemeSYNC" folder in Downloads).
   You can move the folder wherever you like, for example Documents or Applications.
2. Open the "telemeSYNC" folder and double-click "Iniciar telemeSYNC.command" (Start telemeSYNC).
3. A Terminal window opens and the browser opens at http://localhost:5174.
   Keep the Terminal window open while you use the app.

THE FIRST TIME, THE MAC SHOWS A WARNING
telemeSYNC is not registered with Apple yet, so macOS blocks it the first time:

  macOS 15 Sequoia or later
    a) "'Iniciar telemeSYNC.command' Not Opened" appears. Click "Done".
    b) Open System Settings > Privacy & Security.
    c) Scroll to the bottom: "'Iniciar telemeSYNC.command' was blocked…" appears. Click "Open Anyway"
       and confirm with your password or Touch ID.

  macOS 14 Sonoma or earlier
    Right-click (or Control-click) "Iniciar telemeSYNC.command" > Open > Open.

You only need to do this once. After that, a double-click is enough.

OTHER WARNINGS YOU MAY SEE
- "Terminal would like to access files in your Documents folder": click "Allow". That is where the
  videos are saved (Documents/telemeSYNC); you can choose another folder in the app.
- When closing the window, "Do you want to terminate running processes in this window?": click "Terminate".

TO STOP
Close the Terminal window (or press Control+C in it).

HEVC (H.265) VIDEOS
If the preview doesn't show the video, open http://localhost:5174 in Safari, which plays HEVC.
Sync and export work anyway.

Your videos never leave your computer: the app only reads their metadata (date, length, fps).
Terms of use: LICENCA.txt (in Portuguese). Third-party licences: LICENCAS-TERCEIROS.txt
