using System;
using System.IO;
using System.Web.Script.Serialization;
internal static class PublicArtistHarness
{
    private static int count;private static void Check(bool ok){count++;if(!ok)throw new Exception("Public artist check failed: "+count);}
    public static void Main(string[] args)
    {
        var json=new JavaScriptSerializer();string html="<script>window.__sc_hydration=[{\"hydratable\":\"user\",\"data\":{\"permalink\":\"artist\",\"username\":\"Artist & Name\",\"description\":\"A biography\",\"avatar_url\":\"https://images.test/avatar.jpg\",\"followers_count\":42,\"track_count\":3}}];</script><noscript><h2 itemprop='name'><a itemprop='url' href=\"/artist/song\">Song &amp; Title</a> by <a href=\"/artist\">Artist</a></h2><h2><a href=\"/other/song\">Other</a></h2><h2><a href=\"/artist/sets\">Collection</a></h2></noscript>";
        var value=json.Serialize(PublicArtist.Parse(html,"artist"));Check(value.Contains("Artist ")&&value.Contains("\"followers\":42"));Check(value.Contains("artist/song")&&!value.Contains("other/song")&&!value.Contains("artist/sets"));
        Check(!PublicArtist.ValidSlug("../settings")&&!PublicArtist.ValidSlug("https://attacker.invalid")&&!PublicArtist.ValidSlug("search"));
        bool rejected=false;try{PublicArtist.Parse(html,"someone-else");}catch{rejected=true;}Check(rejected);
        Check(json.Serialize(PublicArtist.Parse(html.Replace("https://images.test/avatar.jpg","javascript:alert(1)"),"artist")).Contains("\"image\":\"\""));
        Check(json.Serialize(PublicArtist.Parse(html.Replace("\"followers_count\":42,",""),"artist")).Contains("\"followers\":null"));
        if(args.Length>0){var live=json.Serialize(PublicArtist.Parse(File.ReadAllText(args[0]),"forss"));Check(live.Contains("Forss")&&live.Contains("forss/lux-aeterna"));}
        Console.WriteLine(count+" public SoundCloud artist checks passed");
    }
}
