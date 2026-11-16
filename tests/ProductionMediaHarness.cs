using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Windows.Media.Control;
using Windows.Foundation;
internal static class ProductionMediaHarness
{
    private static T Wait<T>(IAsyncOperation<T> operation){var info=(IAsyncInfo)operation;var until=DateTime.UtcNow.AddSeconds(10);while(info.Status==AsyncStatus.Started&&DateTime.UtcNow<until){Application.DoEvents();Thread.Sleep(10);}if(info.Status!=AsyncStatus.Completed)throw new Exception("Windows media operation failed: "+info.Status);return operation.GetResults();}
    [DllImport("shell32.dll",CharSet=CharSet.Unicode)]private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
    [STAThread]public static void Main(string[] args)
    {
        const string appId="Luma.Music.QA.ProductionMedia113";SetCurrentProcessExplicitAppUserModelID(appId);Application.EnableVisualStyles();System.Net.ServicePointManager.SecurityProtocol=System.Net.SecurityProtocolType.Tls12;
        var assembly=Assembly.LoadFrom(args[0]);assembly.GetType("WebViewBootstrap").GetMethod("Configure").Invoke(null,null);
        using(var window=(Form)Activator.CreateInstance(assembly.GetType("MainWindow"),new object[]{"http://127.0.0.1:43887/",args[1]}))
        {
            var handle=window.Handle;var update=window.GetType().GetMethod("UpdateSystemMedia",BindingFlags.Instance|BindingFlags.NonPublic);
            var snapshot=new Dictionary<string,object>{{"title","Production EXE artwork fixture"},{"artist","Luma QA artist"},{"album","Luma QA album"},{"image",args[2]},{"duration",180000},{"position",12000},{"paused",false}};update.Invoke(window,new object[]{snapshot});
            if((bool)window.GetType().GetField("systemMediaUnavailable",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(window))throw new Exception("Production MainWindow failed to create its native media session");
            var manager=Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());GlobalSystemMediaTransportControlsSession session=null;
            for(int i=0;i<40&&session==null;i++){Application.DoEvents();Thread.Sleep(50);session=manager.GetSessions().FirstOrDefault(s=>s.SourceAppUserModelId==appId);}if(session==null)throw new Exception("Production media session missing");
            GlobalSystemMediaTransportControlsSessionMediaProperties metadata=null;
            for(int i=0;i<200;i++){Application.DoEvents();metadata=Wait(session.TryGetMediaPropertiesAsync());if(metadata.Thumbnail!=null)break;Thread.Sleep(50);}
            if(metadata==null||metadata.Title!="Production EXE artwork fixture"||metadata.Artist!="Luma QA artist"||metadata.Thumbnail==null){var publisher=window.GetType().GetField("systemMedia",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(window);throw new Exception("Production metadata or artwork missing: "+publisher.GetType().GetProperty("ArtworkFailure").GetValue(publisher,null));}
            using(var image=Wait(metadata.Thumbnail.OpenReadAsync()))if(image.Size<100)throw new Exception("Production artwork stream is empty");
            snapshot["title"]="Switched track without cover";snapshot["image"]="";update.Invoke(window,new object[]{snapshot});Application.DoEvents();metadata=Wait(session.TryGetMediaPropertiesAsync());if(metadata.Title!="Switched track without cover"||metadata.Thumbnail!=null)throw new Exception("Old artwork leaked into a new track");
            Console.WriteLine("Actual release EXE publishes title/artist and ready artwork bytes to Windows; track changes clear stale covers");
        }
    }
}
