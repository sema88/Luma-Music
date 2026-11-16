using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.IO;
using System.Net;
using System.Drawing;
using System.Drawing.Imaging;
using System.Threading.Tasks;
using Windows.Media;
using Windows.Foundation;
using Windows.Storage.Streams;

[ComImport,Guid("ddb0472d-c911-4a1f-86d9-dc3d71a95f5a"),InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
internal interface IWindowMediaInterop
{
    [PreserveSig]int GetForWindow(IntPtr window,[In]ref Guid iid,[MarshalAs(UnmanagedType.IInspectable)]out object controls);
}
internal sealed class NativeMediaSession : IDisposable
{
    private readonly SystemMediaTransportControls controls;
    private readonly Action<string,double> command;
    private string stamp="";private bool enabled;private double lastPosition=-1,lastDuration=-1;
    private bool disposed,artworkReady,artworkPending;private int artworkRevision;private DateTime artworkRetry;
    private IRandomAccessStream artworkStream;
    private static readonly Dictionary<string,byte[]> artworkCache=new Dictionary<string,byte[]>();
    public string ArtworkFailure{get;private set;}
    public NativeMediaSession(IntPtr window,Action<string,double> onCommand)
    {
        command=onCommand;var factory=(IWindowMediaInterop)WindowsRuntimeMarshal.GetActivationFactory(typeof(SystemMediaTransportControls));var iid=new Guid("99fa3ff4-1742-42a6-902e-087d41f965ec");object value;
        Marshal.ThrowExceptionForHR(factory.GetForWindow(window,ref iid,out value));controls=(SystemMediaTransportControls)value;
        controls.IsPlayEnabled=true;controls.IsPauseEnabled=true;controls.IsNextEnabled=true;controls.IsPreviousEnabled=true;
        controls.ButtonPressed+=OnButton;controls.PlaybackPositionChangeRequested+=OnPosition;
    }
    private static string Text(Dictionary<string,object> value,string key,int length){object item;string text=value.TryGetValue(key,out item)?Convert.ToString(item):"";return text.Length>length?text.Substring(0,length):text;}
    private static double Number(Dictionary<string,object> value,string key,double maximum){object item;double number;if(!value.TryGetValue(key,out item)||!Double.TryParse(Convert.ToString(item),out number)||Double.IsInfinity(number)||Double.IsNaN(number))return 0;return Math.Max(0,Math.Min(maximum,number));}
    public void Update(Dictionary<string,object> snapshot)
    {
        string title=Text(snapshot,"title",500);if(title.Length==0){Clear();return;}
        string artist=Text(snapshot,"artist",300),album=Text(snapshot,"album",300),image=Text(snapshot,"image",2048);Uri imageUri;if(!Uri.TryCreate(image,UriKind.Absolute,out imageUri)||imageUri.Scheme!="https"||imageUri.UserInfo.Length!=0){image="";imageUri=null;}
        if(!enabled){controls.IsEnabled=true;enabled=true;}
        string nextStamp=title+"\n"+artist+"\n"+album+"\n"+image;
        if(nextStamp!=stamp){artworkRevision++;artworkReady=false;artworkPending=false;artworkRetry=DateTime.MinValue;ReleaseArtwork();var display=controls.DisplayUpdater;display.ClearAll();display.Type=MediaPlaybackType.Music;display.MusicProperties.Title=title;display.MusicProperties.Artist=artist;display.MusicProperties.AlbumTitle=album;display.Update();stamp=nextStamp;}
        if(imageUri!=null&&!artworkReady&&!artworkPending&&DateTime.UtcNow>=artworkRetry)LoadArtwork(imageUri,artworkRevision);
        object raw;bool paused=snapshot.TryGetValue("paused",out raw)&&raw is bool&&(bool)raw;var status=paused?MediaPlaybackStatus.Paused:MediaPlaybackStatus.Playing;if(controls.PlaybackStatus!=status)controls.PlaybackStatus=status;
        double duration=Number(snapshot,"duration",86400000),position=Number(snapshot,"position",duration);if(duration>0&&(duration!=lastDuration||Math.Abs(position-lastPosition)>=500)){controls.UpdateTimelineProperties(new SystemMediaTransportControlsTimelineProperties {StartTime=TimeSpan.Zero,EndTime=TimeSpan.FromMilliseconds(duration),MinSeekTime=TimeSpan.Zero,MaxSeekTime=TimeSpan.FromMilliseconds(duration),Position=TimeSpan.FromMilliseconds(position)});lastPosition=position;lastDuration=duration;}
    }
    private static byte[] DownloadArtwork(Uri uri)
    {
        string host=uri.Host;if(!(host.EndsWith(".scdn.co",StringComparison.OrdinalIgnoreCase)||host.EndsWith(".sndcdn.com",StringComparison.OrdinalIgnoreCase)||host.EndsWith(".spotifycdn.com",StringComparison.OrdinalIgnoreCase)))throw new IOException("Unsupported artwork host");
        lock(artworkCache){byte[] cached;if(artworkCache.TryGetValue(uri.AbsoluteUri,out cached))return cached;}
        var request=(HttpWebRequest)WebRequest.Create(uri);request.Timeout=8000;request.ReadWriteTimeout=8000;request.AllowAutoRedirect=false;request.UserAgent="LumaMusic/1.13";
        byte[] png;using(var response=request.GetResponse())using(var input=response.GetResponseStream())using(var bytes=new MemoryStream())
        {var buffer=new byte[16384];int count;while((count=input.Read(buffer,0,buffer.Length))>0){if(bytes.Length+count>5242880)throw new IOException("Artwork too large");bytes.Write(buffer,0,count);}bytes.Position=0;using(var image=Image.FromStream(bytes)){if((long)image.Width*image.Height>40000000)throw new IOException("Artwork dimensions too large");int side=Math.Min(512,Math.Max(image.Width,image.Height));using(var bitmap=new Bitmap(side,side))using(var graphics=Graphics.FromImage(bitmap))using(var output=new MemoryStream()){graphics.Clear(Color.Transparent);graphics.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;float ratio=Math.Min((float)side/image.Width,(float)side/image.Height);int width=(int)(image.Width*ratio),height=(int)(image.Height*ratio);graphics.DrawImage(image,(side-width)/2,(side-height)/2,width,height);bitmap.Save(output,ImageFormat.Png);png=output.ToArray();}}}
        lock(artworkCache){if(artworkCache.Count>=32)artworkCache.Clear();artworkCache[uri.AbsoluteUri]=png;}return png;
    }
    private async void LoadArtwork(Uri uri,int revision)
    {
        artworkPending=true;
        try
        {
            var bytes=await Task.Run(()=>DownloadArtwork(uri));if(disposed||revision!=artworkRevision)return;
            var stream=new InMemoryRandomAccessStream();bool keep=false;
            try{using(var writer=new DataWriter(stream)){writer.WriteBytes(bytes);var operation=writer.StoreAsync();while(((IAsyncInfo)operation).Status==AsyncStatus.Started)await Task.Delay(10);operation.GetResults();writer.DetachStream();}stream.Seek(0);if(disposed||revision!=artworkRevision)return;artworkStream=stream;keep=true;controls.DisplayUpdater.Thumbnail=RandomAccessStreamReference.CreateFromStream(stream);controls.DisplayUpdater.Update();artworkReady=true;}
            finally{if(!keep)stream.Dispose();}
        }
        catch(Exception failure){if(revision==artworkRevision){artworkRetry=DateTime.UtcNow.AddSeconds(30);ArtworkFailure=failure.GetType().Name+": "+failure.Message;}}
        finally{if(revision==artworkRevision)artworkPending=false;}
    }
    private void ReleaseArtwork(){if(artworkStream!=null){artworkStream.Dispose();artworkStream=null;}}
    private void OnButton(SystemMediaTransportControls sender,SystemMediaTransportControlsButtonPressedEventArgs args){string action=null;switch(args.Button){case SystemMediaTransportControlsButton.Play:action="play";break;case SystemMediaTransportControlsButton.Pause:action="pause";break;case SystemMediaTransportControlsButton.Next:action="next";break;case SystemMediaTransportControlsButton.Previous:action="previous";break;}if(action!=null)command(action,0);}
    private void OnPosition(SystemMediaTransportControls sender,PlaybackPositionChangeRequestedEventArgs args){command("seek",args.RequestedPlaybackPosition.TotalMilliseconds);}
    private void Clear(){artworkRevision++;ReleaseArtwork();artworkReady=false;artworkPending=false;if(!enabled)return;controls.PlaybackStatus=MediaPlaybackStatus.Closed;controls.DisplayUpdater.ClearAll();controls.DisplayUpdater.Update();controls.IsEnabled=false;enabled=false;stamp="";lastPosition=-1;lastDuration=-1;}
    public void Dispose(){disposed=true;Clear();controls.ButtonPressed-=OnButton;controls.PlaybackPositionChangeRequested-=OnPosition;}
}
