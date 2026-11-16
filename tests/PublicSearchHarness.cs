using System;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
internal static class PublicSearchHarness
{
    private static string Json(string html){return new JavaScriptSerializer().Serialize(PublicSearch.Parse(html));}
    private static int check;
    private static void Check(bool condition){check++;if(!condition)throw new Exception("Public search parser check failed: "+check);}
    public static void Main()
    {
        var html="<noscript><a href=\"/search/sounds\">Search</a><h2><a href=\"/artist/song\">Song &amp; Title</a></h2><h2><a href=\"/artist/song\">Duplicate</a></h2></noscript>";
        var json=Json(html);Check((json.Contains("Song & Title")||json.Contains("Song \\u0026 Title"))&&!json.Contains("Duplicate"));
        Check(!Json("<h2><a href=\"/attacker/other\">Outside</a></h2>"+html).Contains("Outside"));
        Check(Json("<noscript><a href=\"/search/sounds\">Search</a></noscript>").Contains("\"items\":[]"));
        bool rejected=false;try{Json("<html>unexpected format</html>");}catch{rejected=true;}Check(rejected);
        var many="<noscript>";for(int i=0;i<50;i++)many+="<h2><a href=\"/artist/song-"+i+"\">Song</a></h2>";many+="</noscript><noscript><h2><a href=\"/another/song\">Another</a></h2></noscript>";Check(Regex.Matches(Json(many),"https://soundcloud.com/").Count==30);
        Console.WriteLine("5 public search parser checks passed");
    }
}
