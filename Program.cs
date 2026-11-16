using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Reflection;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Web;
using System.Web.Script.Serialization;
using System.Windows.Forms;


[assembly: AssemblyTitle("Luma Music")]
[assembly: AssemblyProduct("Luma Music")]
[assembly: AssemblyVersion("1.14.0.0")]
[assembly: AssemblyDescription("Personal Spotify library and music player for Windows")]

internal static class Program
{
    [System.Runtime.InteropServices.DllImport("shell32.dll",CharSet=System.Runtime.InteropServices.CharSet.Unicode)]private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
    private static string dataDir;
    private static string key;
    private static int port = 43821;
    private static bool noWindow;
    private static MainWindow desktop;
    private static string instanceFile;
    private static bool ownsLegacyInstance;
    private static TcpListener listener;
    private static long lastHeartbeat = DateTime.UtcNow.Ticks;
    private static readonly object filesLock = new object();
    private static readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 67108864, RecursionLimit = 128 };
    private static string Origin { get { return "http://127.0.0.1:" + port; } }

    [STAThread]
    private static void Main(string[] args)
    {
        SetCurrentProcessExplicitAppUserModelID("Luma.Music.Desktop");
        WebViewBootstrap.Configure();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
        dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LumaMusic");
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--no-window") noWindow = true;
            else if (args[i] == "--data-dir" && i + 1 < args.Length) dataDir = Path.GetFullPath(args[++i]);
            else if (args[i] == "--port" && i + 1 < args.Length) port = int.Parse(args[++i]);
        }
        int requestedPort = port;
        string buildVersion = Assembly.GetExecutingAssembly().GetName().Version.ToString(3);
        instanceFile = "instance-v" + buildVersion + "-" + requestedPort + ".json";
        bool first;
        using (var mutex = new Mutex(true, "Local\\LumaMusic.v" + buildVersion + "." + requestedPort, out first))
        {
            try
            {
                if (!first)
                {
                    string running = Path.Combine(dataDir, instanceFile);
                    if (File.Exists(running) && !noWindow)
                    {
                        var info = Parse(File.ReadAllText(running));
                        port = Convert.ToInt32(info["port"]);
                        ActivateExistingInstance(Origin, (string)info["key"]);
                    }
                    return;
                }
                Directory.CreateDirectory(dataDir);
                byte[] random = new byte[32];
                using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(random);
                key = Convert.ToBase64String(random).TrimEnd('=').Replace('+', '-').Replace('/', '_');
                for (int attempt = 0; ; attempt++)
                {
                    listener = new TcpListener(IPAddress.Loopback, port);
                    try { listener.Start(); break; }
                    catch (SocketException) { if (requestedPort != 43821 || attempt >= 8) throw; port++; }
                }
                byte[] instanceBytes = Encoding.UTF8.GetBytes(Serialize(new { key = key, port = port, version = buildVersion }));
                AtomicWrite(instanceFile, instanceBytes);
                if (port == requestedPort) { AtomicWrite("instance.json", instanceBytes); ownsLegacyInstance = true; }
                var accept = new Thread(AcceptLoop) { IsBackground = true };
                accept.Start();
                if (!noWindow)
                {
                    desktop=new MainWindow(Origin + "/#key=" + key,dataDir);
                    Application.Run(desktop);
                }
                else while(true) Thread.Sleep(2000);
            }
            catch (Exception e)
            {
                if (!noWindow) MessageBox.Show("Не удалось запустить Luma Music.\n\n" + e.Message, "Luma Music", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                if (listener != null) listener.Stop();
                if (first) { try { File.Delete(Path.Combine(dataDir, instanceFile)); if (ownsLegacyInstance) File.Delete(Path.Combine(dataDir, "instance.json")); } catch { } }
            }
        }
    }

    private static void ActivateExistingInstance(string origin,string sessionKey)
    {
        using(var client=new WebClient())
        {client.Headers["Authorization"]="Bearer "+sessionKey;client.UploadString(origin+"/api/show","POST","");}
    }

    private static void AcceptLoop()
    {
        try
        {
            while (true)
            {
                TcpClient client = listener.AcceptTcpClient();
                ThreadPool.QueueUserWorkItem(delegate { Handle(client); });
            }
        }
        catch (SocketException) { }
        catch (ObjectDisposedException) { }
    }

    private static string ReadLine(NetworkStream stream)
    {
        var bytes = new List<byte>();
        while (bytes.Count < 16384)
        {
            int b = stream.ReadByte();
            if (b < 0) throw new IOException("Unexpected end of request");
            if (b == 10) return Encoding.ASCII.GetString(bytes.ToArray()).TrimEnd('\r');
            bytes.Add((byte)b);
        }
        throw new IOException("Request line too long");
    }

    private static void DrainRejectedBody(NetworkStream stream,Dictionary<string,string> headers)
    {
        // Closing a socket with unread POST data can reset the connection before
        // the client receives its 401/403. Drain only small bodies within a fixed budget.
        string value;int remaining;if(!headers.TryGetValue("Content-Length",out value)||!Int32.TryParse(value,out remaining)||remaining<=0||remaining>65536)return;
        int originalTimeout=stream.ReadTimeout;var elapsed=Stopwatch.StartNew();var buffer=new byte[Math.Min(remaining,8192)];
        try{while(remaining>0){int budget=200-(int)elapsed.ElapsedMilliseconds;if(budget<=0)break;stream.ReadTimeout=budget;int read=stream.Read(buffer,0,Math.Min(buffer.Length,remaining));if(read==0)break;remaining-=read;}}
        catch(IOException){}finally{stream.ReadTimeout=originalTimeout;}
    }
    private static void Handle(TcpClient client)
    {
        using (client)
        {
            client.ReceiveTimeout = 15000;
            client.SendTimeout = 15000;
            try
            {
                using (NetworkStream stream = client.GetStream())
                {
                    string[] request = ReadLine(stream).Split(' ');
                    if (request.Length != 3) return;
                    string method = request[0];
                    Uri uri;
                    if (!request[1].StartsWith("/") || !Uri.TryCreate(Origin + request[1], UriKind.Absolute, out uri)) return;
                    var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    for (int i = 0; i < 80; i++)
                    {
                        string line = ReadLine(stream);
                        if (line.Length == 0) break;
                        int colon = line.IndexOf(':');
                        if (colon > 0) headers[line.Substring(0, colon)] = line.Substring(colon + 1).Trim();
                        if (i == 79) throw new IOException("Too many headers");
                    }
                    string host;
                    if (!headers.TryGetValue("Host", out host) || host != "127.0.0.1:" + port) { DrainRejectedBody(stream,headers);Reply(stream, 403, "application/json", "{\"error\":\"Invalid host\"}"); return; }
                    string origin;
                    if (headers.TryGetValue("Origin", out origin) && origin != Origin) { DrainRejectedBody(stream,headers);Reply(stream, 403, "application/json", "{\"error\":\"Invalid origin\"}"); return; }
                    bool api = uri.AbsolutePath.StartsWith("/api/");
                    string supplied;
                    if (api && (!headers.TryGetValue("Authorization", out supplied) || supplied != "Bearer " + key)) { DrainRejectedBody(stream,headers);Reply(stream, 401, "application/json", "{\"error\":\"Session required\"}"); return; }
                    int length = 0;
                    string rawLength;
                    if (headers.TryGetValue("Content-Length", out rawLength) && (!int.TryParse(rawLength, out length) || length < 0 || length > 67108864)) { Reply(stream, 413, "application/json", "{}"); return; }
                    byte[] body = new byte[length];
                    for (int offset = 0; offset < length;)
                    {
                        int read = stream.Read(body, offset, length - offset);
                        if (read == 0) throw new IOException("Incomplete request");
                        offset += read;
                    }
                    if (api) { Api(stream, method, uri, body); return; }
                    if (method != "GET") { Reply(stream, 405, "text/plain", "Method not allowed"); return; }
                    if(uri.AbsolutePath=="/callback"&&desktop!=null&&desktop.CompleteOAuth(uri))
                    {Reply(stream,200,"text/html; charset=utf-8","<!doctype html><html lang='ru'><meta charset='utf-8'><title>Luma Music</title><body style='background:#141b2c;color:#c4d4f0;font:20px Segoe UI,sans-serif;padding:60px'><h1>Вернитесь в Luma</h1><p>Ответ Spotify передан приложению. Эту вкладку можно закрыть.</p></body></html>");return;}
                    string resource = null, mime = "text/html; charset=utf-8";
                    switch (uri.AbsolutePath)
                    {
                        case "/": case "/callback": resource = "index.html"; break;
                        case "/style.css": resource = "style.css"; mime = "text/css; charset=utf-8"; break;
                        case "/glass.css": resource = "glass.css"; mime = "text/css; charset=utf-8"; break;
                        case "/features.css": resource = "features.css"; mime = "text/css; charset=utf-8"; break;
                        case "/features-core.js": resource = "features-core.js"; mime = "text/javascript; charset=utf-8"; break;
                        case "/i18n.js": resource = "i18n.js"; mime = "text/javascript; charset=utf-8"; break;
                        case "/features.js": resource = "features.js"; mime = "text/javascript; charset=utf-8"; break;
                        case "/discovery.css": resource = "discovery.css"; mime = "text/css; charset=utf-8"; break;
                        case "/discovery-core.js": resource = "discovery-core.js"; mime = "text/javascript; charset=utf-8"; break;
                        case "/discovery.js": resource = "discovery.js"; mime = "text/javascript; charset=utf-8"; break;
                        case "/services-core.js": resource = "services-core.js"; mime = "text/javascript; charset=utf-8"; break;
                        case "/services.js": resource = "services.js"; mime = "text/javascript; charset=utf-8"; break;
                        case "/services.css": resource = "services.css"; mime = "text/css; charset=utf-8"; break;
                        case "/artists-core.js": resource="artists-core.js"; mime="text/javascript; charset=utf-8"; break;
                        case "/artists.js": resource="artists.js"; mime="text/javascript; charset=utf-8"; break;
                        case "/artists.css": resource="artists.css"; mime="text/css; charset=utf-8"; break;
                        case "/media-session.js": resource="media-session.js"; mime="text/javascript; charset=utf-8"; break;
                        case "/playback-ui.js": resource="playback-ui.js"; mime="text/javascript; charset=utf-8"; break;
                        case "/playback-core.js": resource="playback-core.js"; mime="text/javascript; charset=utf-8"; break;
                        case "/modal-ui.js": resource="modal-ui.js"; mime="text/javascript; charset=utf-8"; break;
                        case "/core.js": resource = "core.js"; mime = "text/javascript; charset=utf-8"; break;
                        case "/app.js": resource = "app.js"; mime = "text/javascript; charset=utf-8"; break;
                        case "/icon.svg": resource = "icon.svg"; mime = "image/svg+xml"; break;
                    }
                    if (resource == null) { Reply(stream, 404, "text/plain", "Not found"); return; }
                    using (Stream embedded = Assembly.GetExecutingAssembly().GetManifestResourceStream(resource))
                    using (var buffer = new MemoryStream()) { embedded.CopyTo(buffer); Reply(stream, 200, mime, buffer.ToArray()); }
                }
            }
            catch (Exception) { /* A disconnected local client must not terminate the library host. */ }
        }
    }

    private static void Api(NetworkStream stream, string method, Uri uri, byte[] body)
    {
        try
        {
            if(uri.AbsolutePath=="/api/show"&&method=="POST")
            {if(desktop==null||desktop.IsDisposed){Reply(stream,409,"application/json","{}");return;}desktop.ActivateFromOtherInstance();Reply(stream,200,"application/json","{}");return;}
            if(uri.AbsolutePath=="/api/public-search"&&method=="POST")
            {
                var input=Parse(Encoding.UTF8.GetString(body));
                Reply(stream,200,"application/json; charset=utf-8",Serialize(PublicSearch.Search(Convert.ToString(input["query"]))));return;
            }
            if(uri.AbsolutePath=="/api/genius-lyrics"&&method=="POST")
            {var input=Parse(Encoding.UTF8.GetString(body));Reply(stream,200,"application/json; charset=utf-8",Serialize(GeniusLyrics.Search(Convert.ToString(input["title"]),Convert.ToString(input["artist"]))));return;}
            if(uri.AbsolutePath=="/api/public-artist"&&method=="POST")
            {var input=Parse(Encoding.UTF8.GetString(body));Reply(stream,200,"application/json; charset=utf-8",Serialize(PublicArtist.Fetch(Convert.ToString(input["slug"]))));return;}
            if (uri.AbsolutePath == "/api/link-metadata" && method == "POST")
            {
                var input=Parse(Encoding.UTF8.GetString(body));
                Reply(stream,200,"application/json; charset=utf-8",PublicMetadata.Fetch(Convert.ToString(input["url"]))); return;
            }
            lock (filesLock)
            {
                string path = uri.AbsolutePath;
                if (path == "/api/heartbeat" && method == "POST")
                {
                    Interlocked.Exchange(ref lastHeartbeat, DateTime.UtcNow.Ticks);
                    Reply(stream, 200, "application/json", "{\"ok\":true}"); return;
                }
                string file = null;
                bool encrypted = false;
                if (path == "/api/media-upload" && method == "PUT")
                {
                    string extension = HttpUtility.ParseQueryString(uri.Query)["extension"] ?? "";
                    if (!Regex.IsMatch(extension, "^\\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)$", RegexOptions.IgnoreCase) || body.Length == 0) { Reply(stream, 400, "application/json", "{\"error\":\"Unsupported audio file\"}"); return; }
                    string id = Guid.NewGuid().ToString("N");
                    AtomicWrite("media-" + id + ".bin", body);
                    Reply(stream, 200, "application/json", Serialize(new { id = id, size = body.Length })); return;
                }
                if (path == "/api/media-file" && method == "GET")
                {
                    string id = HttpUtility.ParseQueryString(uri.Query)["id"] ?? "";
                    if (!Regex.IsMatch(id, "^[a-f0-9]{32}$")) { Reply(stream, 400, "application/json", "{}"); return; }
                    string mediaPath = Path.Combine(dataDir, "media-" + id + ".bin");
                    if (!File.Exists(mediaPath)) { Reply(stream, 404, "application/json", "{}"); return; }
                    Reply(stream, 200, "application/octet-stream", File.ReadAllBytes(mediaPath)); return;
                }
                if (path == "/api/local-library") file = "local-library.json";
                if (path == "/api/manual-library") file = "manual-library.json";
                if (path == "/api/lyrics-cache") file = "lyrics-cache.json";
                if (path == "/api/settings") file = "settings.json";
                if (path == "/api/token") { file = "account.dat"; encrypted = true; }
                if (path == "/api/library")
                {
                    string account = HttpUtility.ParseQueryString(uri.Query)["account"];
                    if (string.IsNullOrEmpty(account) || account.Length > 200) throw new ArgumentException("Account required");
                    using (var sha = SHA256.Create()) file = "library-" + BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(account))).Replace("-", "").ToLowerInvariant() + ".json";
                }
                if (file == null) { Reply(stream, 404, "application/json", "{}"); return; }
                string absolute = Path.Combine(dataDir, file);
                if (method == "GET")
                {
                    if (!File.Exists(absolute)) { Reply(stream, 200, "application/json", "null"); return; }
                    byte[] bytes = File.ReadAllBytes(absolute);
                    if (encrypted) bytes = ProtectedData.Unprotect(bytes, null, DataProtectionScope.CurrentUser);
                    Reply(stream, 200, "application/json; charset=utf-8", bytes); return;
                }
                if (method == "DELETE" && path == "/api/token")
                {
                    if (File.Exists(absolute)) File.Delete(absolute);
                    Reply(stream, 200, "application/json", "{\"ok\":true}"); return;
                }
                if (method == "PUT")
                {
                    Parse(Encoding.UTF8.GetString(body));
                    if (encrypted) body = ProtectedData.Protect(body, null, DataProtectionScope.CurrentUser);
                    AtomicWrite(file, body);
                    Reply(stream, 200, "application/json", "{\"ok\":true}"); return;
                }
                Reply(stream, 405, "application/json", "{}");
            }
        }
        catch (Exception e)
        {
            Reply(stream, 500, "application/json; charset=utf-8", Serialize(new { error = (uri.AbsolutePath=="/api/public-search"?"Не удалось выполнить поиск SoundCloud: ":"Не удалось выполнить запрос: ") + e.Message }));
        }
    }

    private static void AtomicWrite(string name, byte[] body)
    {
        string destination = Path.Combine(dataDir, name), temporary = destination + ".tmp";
        using (var file = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None)) { file.Write(body, 0, body.Length); file.Flush(true); }
        if (File.Exists(destination)) File.Replace(temporary, destination, null);
        else File.Move(temporary, destination);
    }

    private static Dictionary<string, object> Parse(string value) { lock (json) return json.Deserialize<Dictionary<string, object>>(value); }
    private static string Serialize(object value) { lock (json) return json.Serialize(value); }
    private static void Reply(NetworkStream stream, int code, string type, string value) { Reply(stream, code, type, Encoding.UTF8.GetBytes(value)); }
    private static void Reply(NetworkStream stream, int code, string type, byte[] bytes)
    {
        string csp = "default-src 'self'; script-src 'self' https://sdk.scdn.co https://*.scdn.co https://w.soundcloud.com; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://*.spotify.com https://*.scdn.co https://lrclib.net wss://*.spotify.com; frame-src https://*.spotify.com https://*.scdn.co https://w.soundcloud.com; media-src 'self' blob: https://*.scdn.co https://*.spotify.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
        byte[] header = Encoding.ASCII.GetBytes("HTTP/1.1 " + code + " " + (code == 200 ? "OK" : "Error") + "\r\nContent-Type: " + type + "\r\nContent-Length: " + bytes.Length + "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: " + csp + "\r\n\r\n");
        stream.Write(header, 0, header.Length); stream.Write(bytes, 0, bytes.Length);
    }
}
