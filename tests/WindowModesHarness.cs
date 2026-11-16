using System;
using System.ComponentModel;
using System.Drawing;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

internal static class WindowModesHarness
{
    [DllImport("user32.dll")]private static extern IntPtr SendMessage(IntPtr window,int message,IntPtr wParam,IntPtr lParam);
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]private static extern IntPtr GetWindowLongPtr(IntPtr window,int index);
    [STAThread]public static void Main(string[] args)
    {
        Application.EnableVisualStyles();var assembly=Assembly.LoadFrom(args[0]);assembly.GetType("WebViewBootstrap").GetMethod("Configure").Invoke(null,null);
        using(var page=args.Length>2?new LocalPage():null)
        using(var window=(Form)Activator.CreateInstance(assembly.GetType("MainWindow"),new object[]{page==null?"http://127.0.0.1:43879/":page.Url,args[1]}))
        {
            // Exercise a real native window without starting WebView or touching a music account.
            if(page==null){var key=typeof(Form).GetFields(BindingFlags.NonPublic|BindingFlags.Static).Single(field=>field.Name.ToLowerInvariant().Contains("shown")).GetValue(null);var events=(EventHandlerList)typeof(Component).GetProperty("Events",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(window,null);events.RemoveHandler(key,events[key]);}
            window.ShowInTaskbar=false;window.Opacity=0;window.Show();Pump();
            if(page!=null)WaitForWebView(window);
            var header=window.Controls.Cast<Control>().Single(control=>control.GetType().Name=="WindowChrome");
            var maximize=header.Controls.Cast<Control>().OrderBy(control=>control.Left).ElementAt(1);
            var minimize=header.Controls.Cast<Control>().OrderBy(control=>control.Left).First();
            var fullScreen=window.GetType().GetMethod("SetFullScreen",BindingFlags.NonPublic|BindingFlags.Instance);
            var normal=window.Bounds;var screen=Screen.FromHandle(window.Handle);
            foreach(Control button in header.Controls)
            {
                foreach(int y in new[]{3,button.Height/2,button.Height-4})
                {
                    var point=button.PointToScreen(new Point(button.Width/2,y));
                    var packed=new IntPtr((point.X&0xFFFF)|((point.Y&0xFFFF)<<16));
                    var hit=SendMessage(window.Handle,0x84,IntPtr.Zero,packed).ToInt32();
                    Expect(hit==1,"Hidden native frame intercepts custom caption button: hit="+hit+" point="+point);
                }
            }
            for(int attempt=0;attempt<5;attempt++)
            {
                PointerClick(maximize);Pump();ExpectMaximized(window,header,screen.WorkingArea);
                PointerClick(maximize);Pump();Expect(window.WindowState==FormWindowState.Normal&&window.Bounds==normal,"Maximize/restore changed the saved normal bounds");
            }
            SendMessage(window.Handle,0xA3,new IntPtr(2),IntPtr.Zero);Pump();ExpectMaximized(window,header,screen.WorkingArea);
            SendMessage(window.Handle,0xA3,new IntPtr(2),IntPtr.Zero);Pump();Expect(window.Bounds==normal&&window.WindowState==FormWindowState.Normal,"Caption double-click did not restore the window");
            Command(window,0xF020);Expect(window.WindowState==FormWindowState.Minimized,"Minimize command failed");Command(window,0xF120);Expect(window.Bounds==normal,"Minimize/restore changed normal size");
            PointerClick(minimize);Pump();Expect(window.WindowState==FormWindowState.Minimized,"Minimize pointer click failed");Command(window,0xF120);Expect(window.Bounds==normal,"Minimize pointer/restore changed normal size");
            maximize.AccessibilityObject.DoDefaultAction();Pump();ExpectMaximized(window,header,screen.WorkingArea);maximize.AccessibilityObject.DoDefaultAction();Pump();Expect(window.Bounds==normal&&window.WindowState==FormWindowState.Normal,"Accessible caption action did not restore window");
            foreach(bool startMaximized in new[]{false,true})
            {
                if(startMaximized)PointerClick(maximize);Pump();
                fullScreen.Invoke(window,new object[]{true});Pump();ExpectFullScreen(window,header,screen.Bounds);
                Command(window,0xF030);ExpectFullScreen(window,header,screen.Bounds);
                Command(window,0xF020);Command(window,0xF120);ExpectFullScreen(window,header,screen.Bounds);
                fullScreen.Invoke(window,new object[]{false});Pump();
                if(startMaximized){ExpectMaximized(window,header,screen.WorkingArea);PointerClick(maximize);Pump();}
                Expect(window.WindowState==FormWindowState.Normal&&window.Bounds==normal,"Exiting full screen lost the previous normal size");
            }
            var mouseDown=maximize.GetType().GetMethod("OnMouseDown",BindingFlags.NonPublic|BindingFlags.Instance);var mouseUp=maximize.GetType().GetMethod("OnMouseUp",BindingFlags.NonPublic|BindingFlags.Instance);
            mouseUp.Invoke(maximize,new object[]{new MouseEventArgs(MouseButtons.Left,1,5,5,0)});Expect(window.WindowState==FormWindowState.Normal,"Release without press activated maximize");
            mouseDown.Invoke(maximize,new object[]{new MouseEventArgs(MouseButtons.Left,1,5,5,0)});mouseUp.Invoke(maximize,new object[]{new MouseEventArgs(MouseButtons.Left,1,-10,5,0)});Expect(window.WindowState==FormWindowState.Normal,"Release outside caption button activated maximize");
            var processKey=window.GetType().GetMethod("ProcessCmdKey",BindingFlags.NonPublic|BindingFlags.Instance);
            var f11=Message.Create(window.Handle,0x100,new IntPtr((int)Keys.F11),new IntPtr(1));processKey.Invoke(window,new object[]{f11,Keys.F11});Pump();ExpectFullScreen(window,header,screen.Bounds);
            var escape=Message.Create(window.Handle,0x100,new IntPtr((int)Keys.Escape),new IntPtr(1));processKey.Invoke(window,new object[]{escape,Keys.Escape});Pump();Expect(window.Bounds==normal,"Escape did not restore F11 window bounds");
            Console.WriteLine((page==null?"Native shell":"Loaded WebView2 with focused text input")+": caption pointer press/release, hit testing, maximize/restore, minimize, fullscreen and F11/Escape passed");
        }
    }
    private static void Command(Form window,int command){SendMessage(window.Handle,0x112,new IntPtr(command),IntPtr.Zero);Pump();}
    private static void Pump(){Application.DoEvents();}
    private static void PointerClick(Control button){var point=new MouseEventArgs(MouseButtons.Left,1,button.Width/2,button.Height/2,0);button.GetType().GetMethod("OnMouseDown",BindingFlags.NonPublic|BindingFlags.Instance).Invoke(button,new object[]{point});button.GetType().GetMethod("OnMouseUp",BindingFlags.NonPublic|BindingFlags.Instance).Invoke(button,new object[]{point});}
    private static Rectangle ClientOnScreen(Form window){return window.RectangleToScreen(window.ClientRectangle);}
    private static void ExpectMaximized(Form window,Control header,Rectangle area){Expect(window.WindowState==FormWindowState.Maximized&&ClientOnScreen(window)==area,"Maximized client must exactly fill the monitor work area: "+ClientOnScreen(window));Expect(header.Visible&&header.Top>=0&&header.Bottom<=window.ClientSize.Height,"Maximized header is clipped");}
    private static void ExpectFullScreen(Form window,Control header,Rectangle area){Expect(ClientOnScreen(window)==area&&window.Bounds==area,"Full screen must cover the complete monitor: "+ClientOnScreen(window));Expect(!header.Visible&&window.Padding==Padding.Empty,"Full screen retained the titlebar or padding");Expect((GetWindowLongPtr(window.Handle,-16).ToInt64()&0x00C40000)==0,"Full screen retained a native sizing/caption frame");}
    private static void Expect(bool condition,string message){if(!condition)throw new Exception(message);}
    private static void WaitForWebView(Form window)
    {
        var until=DateTime.UtcNow.AddSeconds(25);
        while(DateTime.UtcNow<until)
        {
            Pump();var view=window.GetType().GetField("view",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(window);
            var core=view==null?null:view.GetType().GetProperty("CoreWebView2").GetValue(view,null);
            if(core!=null)
            {
                var task=(Task)core.GetType().GetMethod("ExecuteScriptAsync").Invoke(core,new object[]{"!!document.querySelector('#qa') && (document.querySelector('#qa').focus(), true)"});
                while(!task.IsCompleted&&DateTime.UtcNow<until){Pump();Thread.Sleep(10);}
                if(task.IsCompleted&&!task.IsFaulted&&Convert.ToString(task.GetType().GetProperty("Result").GetValue(task,null))=="true"){((Control)view).Focus();return;}
            }
            Thread.Sleep(20);
        }
        throw new Exception("The isolated WebView2 input page did not load");
    }
    private sealed class LocalPage:IDisposable
    {
        private readonly TcpListener listener;private readonly Thread worker;
        public string Url{get;private set;}
        public LocalPage(){listener=new TcpListener(IPAddress.Loopback,0);listener.Start();Url="http://127.0.0.1:"+((IPEndPoint)listener.LocalEndpoint).Port+"/";worker=new Thread(Run){IsBackground=true};worker.Start();}
        private void Run(){try{while(true)using(var client=listener.AcceptTcpClient())using(var stream=client.GetStream()){client.ReceiveTimeout=2000;var input=new byte[4096];stream.Read(input,0,input.Length);var body=Encoding.UTF8.GetBytes("<!doctype html><html><body><input id='qa' value='Isolated caption regression'></body></html>");var header=Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: "+body.Length+"\r\nConnection: close\r\n\r\n");stream.Write(header,0,header.Length);stream.Write(body,0,body.Length);}}catch(SocketException){}catch(System.IO.IOException){}catch(ObjectDisposedException){}}
        public void Dispose(){listener.Stop();worker.Join(1000);}
    }
}
