using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// Only public oEmbed metadata, never cookies, credentials or arbitrary URLs.
internal static class PublicMetadata
{
    public static string Fetch(string link)
    {
        Uri uri;if(!Uri.TryCreate(link,UriKind.Absolute,out uri)||uri.Scheme!="https"||uri.UserInfo!=""||!uri.IsDefaultPort)throw new ArgumentException("Нужна полная HTTPS-ссылка на трек.");
        string canonical,endpoint;
        Match spotify=Regex.Match(uri.AbsolutePath,@"^/(?:intl-[a-z]{2}/)?track/([a-zA-Z0-9]{22})/?$");
        if(uri.Host=="open.spotify.com"&&spotify.Success){canonical="https://open.spotify.com/track/"+spotify.Groups[1].Value;endpoint="https://open.spotify.com/oembed?url=";}
        else if((uri.Host=="soundcloud.com"||uri.Host=="www.soundcloud.com")&&Regex.IsMatch(uri.AbsolutePath,@"^/[-a-zA-Z0-9_]+/[-a-zA-Z0-9_]+/?$")){canonical="https://soundcloud.com"+uri.AbsolutePath.TrimEnd('/');endpoint="https://soundcloud.com/oembed?format=json&url=";}
        else throw new ArgumentException("Поддерживаются полные ссылки на отдельные треки Spotify и SoundCloud.");
        try
        {
            if(uri.Host=="soundcloud.com"||uri.Host=="www.soundcloud.com")try{return new JavaScriptSerializer().Serialize(SoundCloudPublic.Track(SoundCloudPublic.Page(canonical),canonical));}catch{/* Official oEmbed remains available if the public track page is unavailable. */}
            var request=(HttpWebRequest)WebRequest.Create(endpoint+Uri.EscapeDataString(canonical));request.Timeout=10000;request.ReadWriteTimeout=10000;request.AllowAutoRedirect=false;request.Accept="application/json";request.UserAgent="LumaMusic/1.4";
            using(var response=(HttpWebResponse)request.GetResponse())
            using(var stream=response.GetResponseStream())
            using(var buffer=new MemoryStream())
            {
                byte[] bytes=new byte[8192];int count;while((count=stream.Read(bytes,0,bytes.Length))>0){if(buffer.Length+count>1048576)throw new IOException("Metadata too large");buffer.Write(bytes,0,count);}
                var json=new JavaScriptSerializer();var raw=json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(buffer.ToArray()));
                var result=new Dictionary<string,object>();foreach(var name in new[]{"title","author_name","thumbnail_url"})if(raw.ContainsKey(name)&&raw[name] is string)result[name]=raw[name];
                return json.Serialize(result);
            }
        }
        catch(Exception){return "{\"unavailable\":true}";}
    }
}
