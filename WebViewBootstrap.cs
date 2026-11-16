using System;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Collections.Generic;

internal static class WebViewBootstrap
{
    private static readonly Dictionary<string,Assembly> loaded=new Dictionary<string,Assembly>();
    private static readonly object loadLock=new object();
    private static bool configured;
    public static void Configure()
    {
        lock(loadLock){if(configured)return;configured=true;}
        AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs args)
        {
            string name=new AssemblyName(args.Name).Name;
            if(name!="Microsoft.Web.WebView2.Core"&&name!="Microsoft.Web.WebView2.WinForms")return null;
            lock(loadLock){Assembly result;if(loaded.TryGetValue(name,out result))return result;foreach(var existing in AppDomain.CurrentDomain.GetAssemblies())if(existing.FullName==args.Name){loaded[name]=existing;return existing;}result=Assembly.Load(Resource(name+".dll"));loaded[name]=result;return result;}
        };
    }
    public static string ExtractLoader(string dataDir)
    {
        string folder=Path.Combine(dataDir,"Runtime",Assembly.GetExecutingAssembly().GetName().Version.ToString(),"x64");Directory.CreateDirectory(folder);
        string path=Path.Combine(folder,"WebView2Loader.dll");byte[] expected=Resource("WebView2Loader.dll");bool same=false;
        if(File.Exists(path))using(var sha=SHA256.Create())same=Convert.ToBase64String(sha.ComputeHash(File.ReadAllBytes(path)))==Convert.ToBase64String(sha.ComputeHash(expected));
        if(!same)File.WriteAllBytes(path,expected);return folder;
    }
    private static byte[] Resource(string name)
    {
        using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("runtime."+name))using(var memory=new MemoryStream())
        {if(stream==null)throw new IOException("Не найдена встроенная библиотека "+name);stream.CopyTo(memory);return memory.ToArray();}
    }
}
