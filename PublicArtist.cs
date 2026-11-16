using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;

internal static class PublicArtist
{
    public static bool ValidSlug(string slug){return Regex.IsMatch(slug??"",@"^[a-zA-Z0-9_-]{1,100}$")&&Array.IndexOf(new[]{"search","discover","you","settings","stream","stations","tags","pages","oauth"},(slug??"").ToLowerInvariant())<0;}
    public static object Fetch(string slug)
    {
        if(!ValidSlug(slug))throw new ArgumentException("Некорректный профиль SoundCloud.");
        try{string popular=SoundCloudPublic.Page("https://soundcloud.com/"+slug+"/popular-tracks");try{string catalog=SoundCloudPublic.Page("https://soundcloud.com/"+slug+"/tracks");foreach(Match block in Regex.Matches(catalog,@"<noscript\b[^>]*>.*?</noscript>",RegexOptions.Singleline|RegexOptions.IgnoreCase))popular+=block.Value;}catch{}return Parse(popular,slug);}catch{/* Some creators only expose their normal public profile. */}
        var request=(HttpWebRequest)WebRequest.Create("https://soundcloud.com/"+slug);request.Timeout=15000;request.ReadWriteTimeout=15000;request.AllowAutoRedirect=false;request.UserAgent="LumaMusic/1.11";request.Accept="text/html";request.AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate;
        using(var response=(HttpWebResponse)request.GetResponse())using(var stream=response.GetResponseStream())using(var bytes=new MemoryStream())
        {byte[] buffer=new byte[16384];int count;while((count=stream.Read(buffer,0,buffer.Length))>0){if(bytes.Length+count>4194304)throw new IOException("Слишком большой профиль SoundCloud.");bytes.Write(buffer,0,count);}return Parse(Encoding.UTF8.GetString(bytes.ToArray()),slug);}
    }
    private static string Text(object value,int limit){string text=Convert.ToString(value);return text.Length>limit?text.Substring(0,limit):text;}
    private static object Get(Dictionary<string,object> value,string key){object result;return value!=null&&value.TryGetValue(key,out result)?result:null;}
    private static string Image(object value){Uri url;string text=Convert.ToString(value);return Uri.TryCreate(text,UriKind.Absolute,out url)&&url.Scheme=="https"&&url.UserInfo.Length==0?url.AbsoluteUri:"";}
    private static long? Number(object value){if(value==null)return null;long result;return Int64.TryParse(Convert.ToString(value),out result)&&result>=0?(long?)result:null;}
    public static object Parse(string html,string slug)
    {
        if(!ValidSlug(slug))throw new ArgumentException("Некорректный профиль SoundCloud.");Dictionary<string,object> user=null;
        var hydration=Regex.Match(html,@"(?:window\.)?__sc_hydration\s*=\s*(\[.*?\]);?\s*</script>",RegexOptions.Singleline);
        if(hydration.Success)
        {
            var entries=new JavaScriptSerializer {MaxJsonLength=4194304}.DeserializeObject(hydration.Groups[1].Value) as IEnumerable;
            if(entries!=null)foreach(var entry in entries){var item=entry as Dictionary<string,object>;if(Convert.ToString(Get(item,"hydratable"))!="user")continue;var data=Get(item,"data") as Dictionary<string,object>;if(String.Equals(Convert.ToString(Get(data,"permalink")),slug,StringComparison.OrdinalIgnoreCase)){user=data;break;}}
        }
        if(user==null)throw new IOException("SoundCloud не вернул публичные данные профиля. Повторите позже.");
        string name=Text(Get(user,"username"),300),avatar=Image(Get(user,"avatar_url"));var tracks=new List<object>();var seen=new HashSet<string>();
        foreach(Match block in Regex.Matches(html,@"<noscript\b[^>]*>(.*?)</noscript>",RegexOptions.IgnoreCase|RegexOptions.Singleline))
        foreach(Match heading in Regex.Matches(block.Groups[1].Value,@"<h2\b[^>]*>(.*?)</h2>",RegexOptions.IgnoreCase|RegexOptions.Singleline))
        {
            if(tracks.Count>=200)continue;
            var link=Regex.Match(heading.Groups[1].Value,@"<a\b[^>]*\bhref=[""'](/([-a-zA-Z0-9_]+)/([-a-zA-Z0-9_]+))[""'][^>]*>(.*?)</a>",RegexOptions.IgnoreCase|RegexOptions.Singleline);
            if(!link.Success||!String.Equals(link.Groups[2].Value,slug,StringComparison.OrdinalIgnoreCase)||link.Groups[3].Value=="sets"||!seen.Add(link.Groups[1].Value))continue;
            tracks.Add(new {url="https://soundcloud.com"+link.Groups[1].Value,title=WebUtility.HtmlDecode(Regex.Replace(link.Groups[4].Value,"<[^>]*>","")),author_name=name,thumbnail_url=""});if(tracks.Count==200)break;
        }
        return new {source="soundcloud",id=slug,name=name,url="https://soundcloud.com/"+slug,image=avatar,bio=Text(Get(user,"description"),6000),followers=Number(Get(user,"followers_count")),totalTracks=Number(Get(user,"track_count")),location=Text(Get(user,"city"),160),tracks=tracks,limited=true};
    }
}
