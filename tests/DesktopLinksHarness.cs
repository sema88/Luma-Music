using System;
internal static class DesktopLinksHarness
{
    private static int checks;
    private static void Check(bool ok){checks++;if(!ok)throw new Exception("Desktop link validation failed: "+checks);}
    public static void Main()
    {
        string origin="http://127.0.0.1:43850",state=new string('a',32),valid="https://accounts.spotify.com/authorize?state="+state+"&redirect_uri="+Uri.EscapeDataString(origin+"/callback")+"&response_type=code&code_challenge_method=S256";
        Check(DesktopLinks.OAuthState(valid,origin)==state);
        Check(DesktopLinks.OAuthState(valid.Replace("accounts.spotify.com","accounts.spotify.com.attacker.invalid"),origin)==null);
        Check(DesktopLinks.OAuthState(valid.Replace("https://","http://"),origin)==null);
        Check(DesktopLinks.OAuthState(valid,origin+"1")==null);
        Check(DesktopLinks.OAuthState(valid.Replace(state,"short"),origin)==null);
        Check(DesktopLinks.OAuthState(valid.Replace("S256","plain"),origin)==null);
        Check(DesktopLinks.ExternalHttps("file:///C:/Windows/System32/cmd.exe")==null&&DesktopLinks.ExternalHttps("javascript:alert(1)")==null);
        Check(DesktopLinks.ExternalHttps("https://user:secret@spotify.com")==null&&DesktopLinks.OAuthState(valid.Replace("accounts.spotify.com","accounts.spotify.com:8443"),origin)==null);
        Check(DesktopLinks.ExternalHttps("https://soundcloud.com/forss/flickermood")!=null);
        Console.WriteLine("9 desktop link validation checks passed");
    }
}
