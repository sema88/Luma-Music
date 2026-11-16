using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Collections;
using System.Collections.Generic;
using System.Threading;

internal static class GeniusLyrics
{
    private static readonly SemaphoreSlim slots=new SemaphoreSlim(2);
    public static object Search(string title,string artist)
    {
        title=(title??"").Trim();artist=(artist??"").Trim();if(title.Length==0||title.Length>160||artist.Length==0||artist.Length>160)throw new ArgumentException("Нужны название и исполнитель длиной до 160 символов.");
        string searchUrl="https://genius.com/search?q="+Uri.EscapeDataString(title+" "+artist);
        if(!slots.Wait(0))return new {source="genius",plainLyrics="",searchUrl=searchUrl,unavailable=true};
        try
        {
            string json=Read("https://genius.com/api/search/multi?q="+Uri.EscapeDataString(title+" "+artist));string url=FindSong(json,title,artist);
            string text=url==null?"":ParseLyrics(Read(url));
            return new {source="genius",plainLyrics=text,sourceUrl=url,searchUrl=searchUrl,unavailable=false};
        }
        catch(Exception){return new {source="genius",plainLyrics="",searchUrl=searchUrl,unavailable=true};}
        finally{slots.Release();}
    }
    private static string Read(string url)
    {
        var request=(HttpWebRequest)WebRequest.Create(url);request.Timeout=10000;request.ReadWriteTimeout=10000;request.AllowAutoRedirect=false;request.UserAgent="LumaMusic/1.9";request.Accept="application/json,text/html";request.AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate;
        using(var response=(HttpWebResponse)request.GetResponse())using(var stream=response.GetResponseStream())using(var bytes=new MemoryStream())
        {if(response.StatusCode!=HttpStatusCode.OK)throw new IOException("Genius недоступен.");byte[] buffer=new byte[16384];int count;while((count=stream.Read(buffer,0,buffer.Length))>0){if(bytes.Length+count>4194304)throw new IOException("Слишком большой ответ Genius.");bytes.Write(buffer,0,count);}return Encoding.UTF8.GetString(bytes.ToArray());}
    }
    private static Dictionary<string,object> Map(object item){return item as Dictionary<string,object>??new Dictionary<string,object>();}
    private static object Field(object item,string name){object result;return Map(item).TryGetValue(name,out result)?result:null;}
    private static string Normal(string value){return Regex.Replace((value??"").ToLowerInvariant(),@"[^\p{L}\p{Nd}]+"," ").Trim();}
    public static bool SafeSongUrl(string value){Uri url;return Uri.TryCreate(value,UriKind.Absolute,out url)&&url.Scheme=="https"&&url.Host=="genius.com"&&url.IsDefaultPort&&url.UserInfo.Length==0&&url.Query.Length==0&&url.Fragment.Length==0&&url.AbsolutePath.EndsWith("-lyrics",StringComparison.OrdinalIgnoreCase);}
    public static string FindSong(string json,string title,string artist)
    {
        var root=new JavaScriptSerializer {MaxJsonLength=4194304}.DeserializeObject(json);var sections=Field(Field(root,"response"),"sections") as IEnumerable;if(sections==null)return null;
        string wantedTitle=Normal(title),wantedArtist=Normal(artist);if(wantedTitle.Length==0||wantedArtist.Length==0)return null;
        foreach(var section in sections)
        {
            if(Convert.ToString(Field(section,"type"))!="song")continue;var hits=Field(section,"hits") as IEnumerable;if(hits==null)continue;
            foreach(var hit in hits){var song=Field(hit,"result");string songArtist=Normal(Convert.ToString(Field(Field(song,"primary_artist"),"name"))),url=Convert.ToString(Field(song,"url"));if(Normal(Convert.ToString(Field(song,"title")))!=wantedTitle||!SafeSongUrl(url))continue;if(songArtist==wantedArtist||(Math.Min(songArtist.Length,wantedArtist.Length)>=3&&(songArtist.Contains(wantedArtist)||wantedArtist.Contains(songArtist))))return url;}
        }return null;
    }
    public static string ParseLyrics(string html)
    {
        var result=new StringBuilder();int position=0;
        var opener=new Regex(@"<div\b[^>]*\bdata-lyrics-container\s*=\s*[""']true[""'][^>]*>",RegexOptions.IgnoreCase);
        var divs=new Regex(@"</?div\b[^>]*>",RegexOptions.IgnoreCase);
        while(position<html.Length)
        {
            var start=opener.Match(html,position);if(!start.Success)break;int content=start.Index+start.Length,depth=1,end=-1,next=content;
            for(var tag=divs.Match(html,content);tag.Success;tag=tag.NextMatch()){depth+=tag.Value.StartsWith("</")?-1:1;if(depth==0){end=tag.Index;next=tag.Index+tag.Length;break;}}
            if(end<0)break;string part=html.Substring(content,end-content);
            part=Regex.Replace(part,@"<(script|style|svg)\b[^>]*>.*?</\1>","",RegexOptions.IgnoreCase|RegexOptions.Singleline);
            part=Regex.Replace(part,@"<br\s*/?>|</(?:p|div|section)\s*>","\n",RegexOptions.IgnoreCase);part=WebUtility.HtmlDecode(Regex.Replace(part,"<[^>]*>",""));
            part=Regex.Replace(part,@"[\t \u00a0]+"," ");part=Regex.Replace(part,@" *\n *","\n");part=Regex.Replace(part,@"\n{3,}","\n\n").Trim();
            if(part.Length>0){if(result.Length>0)result.Append("\n\n");result.Append(part);}position=next;if(result.Length>=200000)break;
        }string lyrics=result.ToString();return lyrics.Length>200000?lyrics.Substring(0,200000):lyrics;
    }
}
