using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Web.Script.Serialization;
internal static class PublicRefinementsHarness
{
    public static void Main(string[] args)
    {
        ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;var json=new JavaScriptSerializer();
        string parsed=json.Serialize(PublicSearch.Parse("<noscript><h2 data-kind='sound'><a itemprop='url' href='/artist/song'><b>Song</b> &amp; Title</a></h2><h2><a href='/artist/sets'>Not a track</a></h2></noscript>"));if(!parsed.Contains("Song")||parsed.Contains("Not a track"))throw new Exception("Flexible search parsing failed");
        if(PublicSearch.Queries("Ёлки — песня (ремикс)").Length<2||PublicSearch.Queries("test").Length>4||!PublicSearch.Queries("8 миля").Contains("8 milya")||PublicSearch.Transliterate("айсберг",true)!="aisberg")throw new Exception("Query variants failed");
        var track=SoundCloudPublic.Track(File.ReadAllText(args[0]),"https://soundcloud.com/forss/lux-aeterna");if(!track.ContainsKey("playback_count")||Convert.ToInt64(track["playback_count"])<1||String.IsNullOrEmpty(Convert.ToString(track["thumbnail_url"])))throw new Exception("Track stats/artwork parsing failed");
        bool rejected=false;try{SoundCloudPublic.Track(File.ReadAllText(args[0]),"https://soundcloud.com/someone/else");}catch{rejected=true;}if(!rejected)throw new Exception("Track identity mismatch accepted");
        var profile=json.Serialize(PublicArtist.Parse(File.ReadAllText(args[1]),"forss"));if(!profile.Contains("lux-aeterna"))throw new Exception("Popular profile parser failed");
        if(args.Length>2){var result=json.Serialize(PublicSearch.Search("The Living Tombstone — My Ordinary Life"));if(!result.Contains("tltombstone"))throw new Exception("Live SoundCloud title search missed the known artist");var russian=json.Serialize(PublicSearch.Search("8 миля"));if(russian.Contains("\"items\":[]"))throw new Exception("Live Cyrillic SoundCloud search returned no matches");Console.WriteLine("Live Latin and Cyrillic public SoundCloud title searches returned matching results");}
        Console.WriteLine("Flexible search, query variants, public play counts, cover identity and popular profile checks passed");
    }
}
