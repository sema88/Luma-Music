using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Windows.Media;
using Windows.Media.Control;
using Windows.Foundation;
internal static class NativeMediaSessionHarness
{
    private static T Wait<T>(IAsyncOperation<T> operation){var info=(IAsyncInfo)operation;var until=DateTime.UtcNow.AddSeconds(8);while(info.Status==AsyncStatus.Started&&DateTime.UtcNow<until){Application.DoEvents();Thread.Sleep(10);}if(info.Status!=AsyncStatus.Completed)throw new Exception("Windows media query did not complete: "+info.Status);return operation.GetResults();}
    [DllImport("shell32.dll",CharSet=CharSet.Unicode)]private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
    [STAThread]public static void Main(string[] args)
    {
        const string appId="Luma.Music.QA.Media";SetCurrentProcessExplicitAppUserModelID(appId);
        var commands=new List<string>();using(var window=new Form())using(var publisher=new NativeMediaSession(window.Handle,(action,value)=>{lock(commands)commands.Add(action);}))
        {
            var snapshot=new Dictionary<string,object>{{"title","Luma metadata fixture"},{"artist","Fixture artist"},{"album","Fixture album"},{"image",args.Length>0?args[0]:""},{"duration",180000},{"position",42000},{"paused",false}};publisher.Update(snapshot);
            var manager=Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());GlobalSystemMediaTransportControlsSession session=null;
            for(int i=0;i<30&&session==null;i++){Application.DoEvents();session=manager.GetSessions().FirstOrDefault(s=>s.SourceAppUserModelId==appId);if(session==null)Thread.Sleep(100);}
            if(session==null)throw new Exception("The published Luma session is not visible to Windows consumers");
            var info=Wait(session.TryGetMediaPropertiesAsync());if(info.Title!="Luma metadata fixture"||info.Artist!="Fixture artist"||info.AlbumTitle!="Fixture album")throw new Exception("Windows consumers received incorrect song metadata");
            if(session.GetPlaybackInfo().PlaybackStatus!=GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing)throw new Exception("Playing state missing");
            if(args.Length>0){for(int i=0;i<40&&info.Thumbnail==null;i++){Application.DoEvents();Thread.Sleep(100);info=Wait(session.TryGetMediaPropertiesAsync());}if(info.Thumbnail==null)throw new Exception("Cover thumbnail missing");using(var stream=Wait(info.Thumbnail.OpenReadAsync()))if(stream.Size==0)throw new Exception("Cover thumbnail is empty");}
            if(!Wait(session.TryPauseAsync()))throw new Exception("Windows pause command rejected");for(int i=0;i<30&&!commands.Contains("pause");i++){Application.DoEvents();Thread.Sleep(50);}if(!commands.Contains("pause"))throw new Exception("Windows pause command did not reach Luma");
            snapshot["paused"]=true;publisher.Update(snapshot);for(int i=0;i<30&&session.GetPlaybackInfo().PlaybackStatus!=GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused;i++){Application.DoEvents();Thread.Sleep(50);}if(session.GetPlaybackInfo().PlaybackStatus!=GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused)throw new Exception("Pause state missing");
            Console.WriteLine("Windows consumer verified Luma song/artist/album, cover, playing/pause and media command delivery");
        }
    }
}
