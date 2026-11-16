using System;
using System.Web;
using System.Text.RegularExpressions;

internal static class DesktopLinks
{
    public static Uri ExternalHttps(string value)
    {
        Uri url;return Uri.TryCreate(value,UriKind.Absolute,out url)&&url.Scheme=="https"&&url.UserInfo.Length==0?url:null;
    }
    public static string OAuthState(string value,string origin)
    {
        var target=ExternalHttps(value);
        if(target==null||target.Host!="accounts.spotify.com"||!target.IsDefaultPort||target.AbsolutePath!="/authorize")return null;
        var query=HttpUtility.ParseQueryString(target.Query);string state=query["state"];
        if(!Regex.IsMatch(state??"","^[a-zA-Z0-9_-]{24,128}$")||query["redirect_uri"]!=origin+"/callback"||query["response_type"]!="code"||query["code_challenge_method"]!="S256")return null;
        return state;
    }
}
