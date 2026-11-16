using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using System.Web;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal sealed class MainWindow : Form
{
    [System.Runtime.InteropServices.DllImport("dwmapi.dll")]private static extern int DwmSetWindowAttribute(IntPtr window,int attribute,ref int value,int size);
    [System.Runtime.InteropServices.DllImport("user32.dll")]private static extern IntPtr SendMessage(IntPtr window,int message,IntPtr wParam,IntPtr lParam);
    [System.Runtime.InteropServices.DllImport("user32.dll")]private static extern bool IsZoomed(IntPtr window);
    [System.Runtime.InteropServices.DllImport("user32.dll")]private static extern bool ShowWindow(IntPtr window,int command);
    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]private struct MinMaxInfo{public Point Reserved,MaxSize,MaxPosition,MinTrackSize,MaxTrackSize;}
    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]private struct NativeRect{public int Left,Top,Right,Bottom;}
    protected override CreateParams CreateParams{get{var value=base.CreateParams;value.Style|=0x00080000|0x00020000|0x00010000;if(!fullScreen)value.Style|=0x00C00000|0x00040000;return value;}}
    public bool NativeTransitionsConfigured {get;private set;}
    protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);int enabled=0;NativeTransitionsConfigured=DwmSetWindowAttribute(Handle,3,ref enabled,4)==0;int rounded=2;DwmSetWindowAttribute(Handle,33,ref rounded,4);}
    private readonly string startUrl,dataDir,origin;
    private readonly object oauthLock=new object();
    private WebView2 view;
    private Label status;
    private Panel content;
    private WindowChrome titleBar;
    private string pendingState;
    private DateTime pendingSince;
    private bool fullScreen;
    private FormWindowState previousState;
    private Rectangle previousBounds;
    private Rectangle normalBounds;
    private bool changingFullScreen;
    private NativeMediaSession systemMedia;
    private bool systemMediaUnavailable;
    public MainWindow(string url,string dataFolder)
    {
        startUrl=url;dataDir=dataFolder;origin=new Uri(url).GetLeftPart(UriPartial.Authority);
        Text="Luma Music";StartPosition=FormStartPosition.CenterScreen;Size=new Size(1380,900);MinimumSize=new Size(820,620);BackColor=Color.FromArgb(29,45,70);AutoScaleMode=AutoScaleMode.Dpi;ResizeRedraw=true;
        using(var iconStream=System.Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream("luma.ico"))using(var embeddedIcon=new Icon(iconStream))Icon=(Icon)embeddedIcon.Clone();
        FormBorderStyle=FormBorderStyle.None;Padding=new Padding(5);content=new Panel {Dock=DockStyle.Fill};titleBar=new WindowChrome(this);Controls.Add(content);Controls.Add(titleBar);content.BringToFront();
        titleBar.InteractionFinished+=delegate{if(view!=null&&!view.IsDisposed)view.Focus();};
        status=new Label {Dock=DockStyle.Fill,Text="Запускаем Luma…",TextAlign=ContentAlignment.MiddleCenter,ForeColor=Color.FromArgb(196,212,240),Font=new Font("Segoe UI",14)};content.Controls.Add(status);
        Shown+=delegate {InitializeWebView();};
    }
    private async void InitializeWebView()
    {
        try
        {
            CoreWebView2Environment.SetLoaderDllFolderPath(WebViewBootstrap.ExtractLoader(dataDir));
            view=new WebView2 {Dock=DockStyle.Fill,DefaultBackgroundColor=BackColor};content.Controls.Add(view);view.BringToFront();
            var options=new CoreWebView2EnvironmentOptions {AdditionalBrowserArguments="--disable-features=HardwareMediaKeyHandling"};
            var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(dataDir,"WebView2"),options);
            if(IsDisposed)return;await view.EnsureCoreWebView2Async(environment);if(IsDisposed)return;
            var core=view.CoreWebView2;core.Settings.IsStatusBarEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;
            core.Profile.IsGeneralAutofillEnabled=false;
            core.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs e)
            {Uri next;if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out next)||next.GetLeftPart(UriPartial.Authority)!=origin){e.Cancel=true;OpenExternal(e.Uri);}};
            core.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;if(e.IsUserInitiated)OpenExternal(e.Uri);};
            core.WebMessageReceived+=OnWebMessage;
            core.ContainsFullScreenElementChanged+=delegate{SetFullScreen(core.ContainsFullScreenElement);};
            core.ProcessFailed+=delegate{status.Text="Плеер WebView2 остановился. Закройте и снова откройте Luma.";status.Visible=true;status.BringToFront();};
            core.Navigate(startUrl);status.Visible=false;
        }
        catch(Exception e)
        {
            if(IsDisposed)return;if(view!=null){content.Controls.Remove(view);view.Dispose();view=null;}
            status.Visible=true;status.Text=e is WebView2RuntimeNotFoundException?"Для Luma нужен Microsoft Edge WebView2 Runtime.\nУстановите его и откройте Luma снова.":"Не удалось открыть окно Luma.\n"+e.Message;
            if(e is WebView2RuntimeNotFoundException){var button=new Button {Text="Скачать WebView2 Runtime",Dock=DockStyle.Bottom,Height=54};button.Click+=delegate{OpenExternal("https://developer.microsoft.com/microsoft-edge/webview2/");};content.Controls.Add(button);}
        }
    }
    private void OnWebMessage(object sender,CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            Uri source;if(!Uri.TryCreate(e.Source,UriKind.Absolute,out source)||source.GetLeftPart(UriPartial.Authority)!=origin)return;
            var message=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(e.TryGetWebMessageAsString());
            if(Convert.ToString(message["type"])=="media"){UpdateSystemMedia(message);return;}
            if(Convert.ToString(message["type"])=="window"){object action;if(message.TryGetValue("action",out action)){if(Convert.ToString(action)=="toggle-fullscreen")SetFullScreen(!fullScreen);else if(Convert.ToString(action)=="exit-fullscreen"&&fullScreen)SetFullScreen(false);}return;}
            if(Convert.ToString(message["type"])=="appearance"){titleBar.SetAppearance(Convert.ToString(message["theme"])=="dark",Convert.ToString(message["language"])=="en");object start,end;if(message.TryGetValue("backgroundStart",out start)&&message.TryGetValue("backgroundEnd",out end))titleBar.SetBackdropColors(Convert.ToString(start),Convert.ToString(end));BackColor=titleBar.BackColor;return;}
            if(Convert.ToString(message["type"])!="oauth")return;string url=Convert.ToString(message["url"]),state=DesktopLinks.OAuthState(url,origin);if(state==null)return;
            lock(oauthLock){pendingState=state;pendingSince=DateTime.UtcNow;}OpenExternal(url);
        }
        catch(Exception failure){MessageBox.Show(this,"Не удалось открыть вход Spotify.\n"+failure.Message,"Luma Music",MessageBoxButtons.OK,MessageBoxIcon.Information);}
    }
    public bool CompleteOAuth(Uri callback)
    {
        var query=HttpUtility.ParseQueryString(callback.Query);
        lock(oauthLock)
        {
            if(IsDisposed||!IsHandleCreated||pendingState==null||DateTime.UtcNow-pendingSince>TimeSpan.FromMinutes(15)||query["state"]!=pendingState||String.IsNullOrEmpty(query["code"])&&String.IsNullOrEmpty(query["error"]))return false;
            pendingState=null;
        }
        BeginInvoke((Action)delegate {if(!IsDisposed&&view!=null){ActivateFromOtherInstance();view.CoreWebView2.Navigate(callback.AbsoluteUri);}});return true;
    }
    public void ActivateFromOtherInstance()
    {
        if(InvokeRequired){BeginInvoke((Action)ActivateFromOtherInstance);return;}
        if(WindowState==FormWindowState.Minimized)WindowCommand(0xF120);Show();Activate();
    }
    private static void OpenExternal(string value)
    {
        Uri url=DesktopLinks.ExternalHttps(value);if(url==null)return;
        Process.Start(new ProcessStartInfo(url.AbsoluteUri){UseShellExecute=true});
    }
    private void SetFullScreen(bool enabled)
    {
        if(enabled==fullScreen)return;changingFullScreen=true;
        try
        {
            if(enabled)
            {
                previousState=WindowState;previousBounds=WindowState==FormWindowState.Normal?Bounds:!normalBounds.IsEmpty?normalBounds:RestoreBounds;
                var screen=Screen.FromHandle(Handle);WindowCommand(0xF120);fullScreen=true;UpdateStyles();titleBar.Visible=false;Padding=Padding.Empty;Bounds=screen.Bounds;
            }
            else
            {
                fullScreen=false;UpdateStyles();WindowCommand(0xF120);titleBar.Visible=true;Padding=new Padding(5);Bounds=previousBounds;normalBounds=previousBounds;
                if(previousState==FormWindowState.Maximized)WindowCommand(0xF030);
            }
        }
        finally{changingFullScreen=false;Invalidate(true);}
    }
    private void WindowCommand(int command){SendMessage(Handle,0x112,new IntPtr(command),IntPtr.Zero);}
    public void MinimizeWindow(){if(!fullScreen&&WindowState==FormWindowState.Normal)normalBounds=Bounds;ShowWindow(Handle,6);}
    public void ToggleMaximize()
    {
        if(fullScreen)return;
        if(IsZoomed(Handle)||WindowState==FormWindowState.Maximized){ShowWindow(Handle,9);WindowState=FormWindowState.Normal;if(!normalBounds.IsEmpty)Bounds=normalBounds;}
        else{if(WindowState==FormWindowState.Normal)normalBounds=Bounds;ShowWindow(Handle,3);if(WindowState!=FormWindowState.Maximized)WindowState=FormWindowState.Maximized;}
        Invalidate(true);
    }
    protected override void OnPaintBackground(PaintEventArgs e)
    {
        if(titleBar==null){base.OnPaintBackground(e);return;}titleBar.PaintWindowBackground(e.Graphics,new Rectangle(Padding.Left,0,ClientSize.Width-Padding.Horizontal,ClientSize.Height));
    }
    protected override void WndProc(ref Message message)
    {
        if(message.Msg==0x24)
        {
            base.WndProc(ref message);var screen=Screen.FromHandle(message.HWnd);var target=fullScreen?screen.Bounds:screen.WorkingArea;
            var limits=(MinMaxInfo)System.Runtime.InteropServices.Marshal.PtrToStructure(message.LParam,typeof(MinMaxInfo));
            limits.MaxPosition=new Point(target.Left-screen.Bounds.Left,target.Top-screen.Bounds.Top);limits.MaxSize=new Point(target.Width,target.Height);
            limits.MaxTrackSize=new Point(Math.Max(limits.MaxTrackSize.X,target.Width),Math.Max(limits.MaxTrackSize.Y,target.Height));
            System.Runtime.InteropServices.Marshal.StructureToPtr(limits,message.LParam,false);message.Result=IntPtr.Zero;return;
        }
        if(message.Msg==0x112)
        {
            int command=message.WParam.ToInt32()&0xFFF0;bool track=!fullScreen&&!changingFullScreen;
            if(fullScreen&&command==0xF030){Bounds=Screen.FromHandle(Handle).Bounds;message.Result=IntPtr.Zero;return;}
            if(track&&(command==0xF030||command==0xF020)&&WindowState==FormWindowState.Normal)normalBounds=Bounds;
            base.WndProc(ref message);
            if(track&&command==0xF120&&WindowState==FormWindowState.Normal&&!normalBounds.IsEmpty)Bounds=normalBounds;
            if(fullScreen&&command==0xF120)Bounds=Screen.FromHandle(Handle).Bounds;
            return;
        }
        if(message.Msg==0x83)
        {
            if(message.WParam!=IntPtr.Zero&&IsZoomed(message.HWnd)&&!fullScreen)
            {
                // Windows keeps an invisible resize frame outside the work area when maximized.
                // Keep the custom client content inside that frame rather than clipping the header.
                var area=Screen.FromHandle(message.HWnd).WorkingArea;
                var client=new NativeRect{Left=area.Left,Top=area.Top,Right=area.Right,Bottom=area.Bottom};
                System.Runtime.InteropServices.Marshal.StructureToPtr(client,message.LParam,false);
            }
            message.Result=IntPtr.Zero;return;
        }
        if(message.Msg==0xA3&&message.WParam.ToInt32()==2&&!fullScreen){ToggleMaximize();message.Result=IntPtr.Zero;return;}
        if(message.Msg==0x84&&!fullScreen&&WindowState==FormWindowState.Normal){long packed=message.LParam.ToInt64();Point point=PointToClient(new Point((short)(packed&0xffff),(short)((packed>>16)&0xffff)));int edge=Padding.Left;bool left=point.X<edge,right=point.X>=ClientSize.Width-edge,top=point.Y<edge,bottom=point.Y>=ClientSize.Height-edge;int hit=top?(left?13:right?14:12):bottom?(left?16:right?17:15):left?10:right?11:0;if(hit!=0){message.Result=new IntPtr(hit);return;}}
        if(message.Msg==0x84){message.Result=new IntPtr(1);return;}
        base.WndProc(ref message);
    }
    private async void PlaybackShortcut()
    {
        if(view==null||view.IsDisposed||view.CoreWebView2==null)return;
        try{await view.CoreWebView2.ExecuteScriptAsync("window.Luma && window.Luma.togglePlaybackFromShortcut()");}catch(Exception){/* Closing or initializing the view must not turn Space into a window action. */}
    }
    private void UpdateSystemMedia(System.Collections.Generic.Dictionary<string,object> snapshot)
    {
        if(systemMediaUnavailable)return;
        try{if(systemMedia==null){if(!snapshot.ContainsKey("title")||String.IsNullOrEmpty(Convert.ToString(snapshot["title"])))return;systemMedia=new NativeMediaSession(Handle,DispatchMediaCommand);}systemMedia.Update(snapshot);}
        catch(Exception){systemMediaUnavailable=true;try{if(systemMedia!=null)systemMedia.Dispose();}catch{}systemMedia=null;}
    }
    private void DispatchMediaCommand(string action,double position)
    {
        if(IsDisposed||!IsHandleCreated)return;
        try{BeginInvoke((Action)(async delegate{if(view==null||view.IsDisposed||view.CoreWebView2==null)return;try{await view.CoreWebView2.ExecuteScriptAsync("window.LumaExtras && window.LumaExtras.mediaControl("+new JavaScriptSerializer().Serialize(action)+","+position.ToString(System.Globalization.CultureInfo.InvariantCulture)+")");}catch{}}));}catch(InvalidOperationException){}
    }
    protected override void OnFormClosed(FormClosedEventArgs e){try{if(systemMedia!=null)systemMedia.Dispose();}catch{}base.OnFormClosed(e);}
    protected override bool ProcessCmdKey(ref Message message,Keys keyData)
    {
        if(keyData==Keys.F11){if((message.LParam.ToInt64()&(1L<<30))==0){if(view!=null&&view.CoreWebView2!=null&&view.CoreWebView2.ContainsFullScreenElement)view.CoreWebView2.ExecuteScriptAsync("document.fullscreenElement && document.exitFullscreen()");else SetFullScreen(!fullScreen);}return true;}
        if(keyData==Keys.Escape&&fullScreen&&(view==null||view.CoreWebView2==null||!view.CoreWebView2.ContainsFullScreenElement)){SetFullScreen(false);return true;}
        if(keyData==Keys.Space&&(view==null||!view.ContainsFocus)){if((message.LParam.ToInt64()&(1L<<30))==0)PlaybackShortcut();return true;}
        return base.ProcessCmdKey(ref message,keyData);
    }
}
