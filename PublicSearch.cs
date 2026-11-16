using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.Threading.Tasks;

internal static class PublicSearch
{
    public static string Transliterate(string query,bool alternate)
    {
        const string letters="абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
        string[] latin={"a","b","v","g","d","e","e","zh","z","i",alternate?"i":"y","k","l","m","n","o","p","r","s","t","u","f",alternate?"kh":"h","ts","ch","sh","shch","","y","","e","yu","ya"};
        var result=new StringBuilder();foreach(char value in query.ToLowerInvariant()){int index=letters.IndexOf(value);result.Append(index>=0?latin[index]:value.ToString());}return result.ToString();
    }
    public static string[] Queries(string query)
    {
        var values=new List<string>();Action<string> add=value=>{value=Regex.Replace(value??"",@"\s+"," ").Trim();if(value.Length>0&&!values.Contains(value)&&values.Count<4)values.Add(value);};
        add(query.Normalize(NormalizationForm.FormKC));string clean=Regex.Replace(query,@"[^\p{L}\p{Nd}\s]"," ").Replace('ё','е').Replace('Ё','Е');
        if(Regex.IsMatch(query,@"[а-яА-ЯёЁ]")){add(Transliterate(clean,false));add(Transliterate(clean,true));string shortName=Regex.Replace(query,@"[\(\[][\s\S]*?[\)\]]"," ");add(Transliterate(shortName,false));}else add(clean);
        add(Regex.Replace(query,@"[\(\[][\s\S]*?[\)\]]"," "));
        if(values.Count<4){var parts=Regex.Split(query,@"\s+[-–—]\s+");if(parts.Length==2)add(parts[1]+" "+parts[0]);}
        if(values.Count<4){var words=Regex.Matches(query.ToLowerInvariant(),@"[\p{L}\p{Nd}]+");var useful=new List<string>();foreach(Match word in words)if(Array.IndexOf(new[]{"the","feat","ft","prod","official","audio"},word.Value)<0)useful.Add(word.Value);if(useful.Count>3)add(String.Join(" ",useful.GetRange(0,3)));}
        return values.ToArray();
    }
    public static object Search(string query)
    {
        query=(query??"").Trim();if(query.Length==0||query.Length>160)throw new ArgumentException("Введите запрос от 1 до 160 символов.");
        var queries=Queries(query);var tasks=new Task<List<Dictionary<string,object>>>[queries.Length];
        for(int i=0;i<queries.Length;i++){string text=queries[i];tasks[i]=Task.Run(()=>{try{return Items(SoundCloudPublic.Page("https://soundcloud.com/search/sounds?q="+Uri.EscapeDataString(text)));}catch{return null;}});}
        Task.WaitAll(tasks);var combined=new List<Dictionary<string,object>>();var seen=new HashSet<string>();bool available=false;
        foreach(var task in tasks){if(task.Result==null)continue;available=true;foreach(var item in task.Result)if(seen.Add((string)item["url"]))combined.Add(item);}
        if(!available)throw new IOException("SoundCloud не вернул публичный поиск. Проверьте доступ к сервису.");
        var tokens=Regex.Matches(query.ToLowerInvariant().Replace('ё','е'),@"[\p{L}\p{Nd}]+");
        Func<Dictionary<string,object>,int> score=item=>{string title=((string)item["title"]).ToLowerInvariant().Replace('ё','е'),text=title+" "+((string)item["url"]).Replace('-',' ').Replace('_',' ');int value=title.Contains(query.ToLowerInvariant())?100:0;foreach(Match token in tokens){if(title.Contains(token.Value))value+=12;else if(text.Contains(token.Value))value+=4;}return value;};
        var order=new Dictionary<string,int>();for(int i=0;i<combined.Count;i++)order[(string)combined[i]["url"]]=i;
        combined.Sort((a,b)=>{int compare=score(b).CompareTo(score(a));return compare!=0?compare:order[(string)a["url"]].CompareTo(order[(string)b["url"]]);});
        if(combined.Count>30)combined=combined.GetRange(0,30);return new {items=combined,source="soundcloud",provider="public-page",total=combined.Count};
    }
    private static List<Dictionary<string,object>> Items(string html)
    {
        var result=new List<Dictionary<string,object>>();var seen=new HashSet<string>();
        foreach(Match block in Regex.Matches(html,@"<noscript\b[^>]*>(.*?)</noscript>",RegexOptions.Singleline|RegexOptions.IgnoreCase))
        foreach(Match heading in Regex.Matches(block.Groups[1].Value,@"<h2\b[^>]*>(.*?)</h2>",RegexOptions.Singleline|RegexOptions.IgnoreCase))
        {
            var item=Regex.Match(heading.Groups[1].Value,@"<a\b[^>]*\bhref\s*=\s*[""'](/[-a-zA-Z0-9_]+/[-a-zA-Z0-9_]+)[""'][^>]*>(.*?)</a>",RegexOptions.Singleline|RegexOptions.IgnoreCase);
            if(!item.Success)continue;string path=item.Groups[1].Value;var parts=path.Split('/');
            if(!PublicArtist.ValidSlug(parts[1])||Array.IndexOf(new[]{"sets","likes","tracks","albums","reposts","popular-tracks"},parts[2])>=0||!seen.Add(path))continue;
            string title=WebUtility.HtmlDecode(Regex.Replace(item.Groups[2].Value,"<[^>]*>",""));if(String.IsNullOrWhiteSpace(title))continue;
            result.Add(new Dictionary<string,object>{{"url","https://soundcloud.com"+path},{"title",title},{"author_name",parts[1].Replace('-',' ')}});if(result.Count==30)return result;
        }
        if(result.Count==0&&html.IndexOf("<noscript",StringComparison.OrdinalIgnoreCase)<0)throw new IOException("Формат публичного поиска SoundCloud изменился.");
        if(result.Count==0&&html.IndexOf("/search/sounds",StringComparison.OrdinalIgnoreCase)<0)throw new IOException("SoundCloud не отдал публичный список.");return result;
    }
    public static object Parse(string html){return new {items=Items(html),source="soundcloud",provider="public-page"};}
}
