using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;

internal static class SoundCloudPublic
{
    private sealed class Cached{public string Html;public DateTime Until;}
    private static readonly Dictionary<string,Cached> cache=new Dictionary<string,Cached>();
    public static string Page(string address)
    {
        Uri url;if(!Uri.TryCreate(address,UriKind.Absolute,out url)||url.Scheme!="https"||url.Host!="soundcloud.com"||url.UserInfo.Length!=0||!url.IsDefaultPort)throw new ArgumentException("Invalid public SoundCloud page");
        lock(cache){Cached item;if(cache.TryGetValue(address,out item)&&item.Until>DateTime.UtcNow)return item.Html;}
        var request=(HttpWebRequest)WebRequest.Create(url);request.Timeout=12000;request.ReadWriteTimeout=12000;request.AllowAutoRedirect=false;request.UserAgent="Mozilla/5.0 (compatible; LumaMusic/1.13)";request.Accept="text/html";request.AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate;
        string html;using(var response=request.GetResponse())using(var stream=response.GetResponseStream())using(var data=new MemoryStream()){var buffer=new byte[16384];int count;while((count=stream.Read(buffer,0,buffer.Length))>0){if(data.Length+count>4194304)throw new IOException("SoundCloud page too large");data.Write(buffer,0,count);}html=Encoding.UTF8.GetString(data.ToArray());}
        lock(cache){if(cache.Count>=128)cache.Clear();cache[address]=new Cached{Html=html,Until=DateTime.UtcNow.AddMinutes(5)};}return html;
    }
    public static object Get(Dictionary<string,object> data,string key){object value;return data!=null&&data.TryGetValue(key,out value)?value:null;}
    public static Dictionary<string,object> Hydration(string html,string kind)
    {
        var match=Regex.Match(html,@"(?:window\.)?__sc_hydration\s*=\s*(\[.*?\]);?\s*</script>",RegexOptions.Singleline);
        if(!match.Success)return null;var entries=new JavaScriptSerializer{MaxJsonLength=4194304}.DeserializeObject(match.Groups[1].Value) as IEnumerable;
        if(entries!=null)foreach(var entry in entries){var item=entry as Dictionary<string,object>;if(Convert.ToString(Get(item,"hydratable"))==kind)return Get(item,"data") as Dictionary<string,object>;}return null;
    }
    public static Dictionary<string,object> Track(string html,string canonical)
    {
        var sound=Hydration(html,"sound");if(sound==null||!String.Equals(Convert.ToString(Get(sound,"permalink_url")).TrimEnd('/'),canonical.TrimEnd('/'),StringComparison.OrdinalIgnoreCase))throw new IOException("SoundCloud returned another track");
        var user=Get(sound,"user") as Dictionary<string,object>;
        string artwork=Convert.ToString(Get(sound,"artwork_url")??Get(user,"avatar_url"));if(artwork.StartsWith("https://i",StringComparison.OrdinalIgnoreCase)&&artwork.Contains(".sndcdn.com/"))artwork=artwork.Replace("-large.","-t500x500.");
        long plays,duration;var result=new Dictionary<string,object>{{"title",Convert.ToString(Get(sound,"title"))},{"author_name",Convert.ToString(Get(user,"username"))},{"thumbnail_url",artwork}};
        if(Int64.TryParse(Convert.ToString(Get(sound,"playback_count")),out plays)&&plays>=0)result["playback_count"]=plays;
        if(Int64.TryParse(Convert.ToString(Get(sound,"duration")),out duration)&&duration>=0)result["duration"]=duration;
        return result;
    }
}
