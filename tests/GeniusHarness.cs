using System;
using System.Web.Script.Serialization;
internal static class GeniusHarness
{
    private static int checks;private static void Check(bool ok){checks++;if(!ok)throw new Exception("Genius check failed: "+checks);}
    private static string Search(string url,string title="Test Song",string artist="Artist"){return new JavaScriptSerializer().Serialize(new{response=new{sections=new[]{new{type="song",hits=new[]{new{result=new{url=url,title=title,primary_artist=new{name=artist}}}}}}}});}
    public static void Main()
    {
        Check(GeniusLyrics.SafeSongUrl("https://genius.com/Artist-test-song-lyrics"));
        Check(!GeniusLyrics.SafeSongUrl("https://genius.com.attacker.invalid/Test-lyrics")&&!GeniusLyrics.SafeSongUrl("http://genius.com/Test-lyrics")&&!GeniusLyrics.SafeSongUrl("https://x:y@genius.com/Test-lyrics"));
        Check(GeniusLyrics.FindSong(Search("https://genius.com/Artist-test-song-lyrics"),"test song","artist")!=null);
        Check(GeniusLyrics.FindSong(Search("https://genius.com/Artist-test-song-lyrics"),"Other Song","Artist")==null);
        Check(GeniusLyrics.FindSong(Search("https://genius.com/Artist-test-song-lyrics", "Test Song","Genius English Translations"),"Test Song","Artist")==null);
        Check(GeniusLyrics.FindSong(Search("https://attacker.invalid/Artist-test-song-lyrics"),"Test Song","Artist")==null);
        Check(GeniusLyrics.ParseLyrics("<p>outside</p><div data-lyrics-container=\"true\">First &amp; last<br/>Second <a>line</a><div>Nested</div></div><div data-lyrics-container='true'>Next</div>")=="First & last\nSecond lineNested\n\nNext");
        Check(GeniusLyrics.ParseLyrics("<div data-lyrics-container=\"true\">Safe<script>bad()</script><svg>bad</svg></div>")=="Safe");
        Check(GeniusLyrics.ParseLyrics("<html>Challenge or changed layout</html>")=="");
        Console.WriteLine("9 Genius matching, URL and parser checks passed");
    }
}
