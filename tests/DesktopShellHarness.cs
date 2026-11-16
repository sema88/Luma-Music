using System;
using System.Drawing;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;
using System.Runtime.InteropServices;
internal static class DesktopShellHarness
{
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]private static extern IntPtr GetWindowLongPtr(IntPtr window,int index);
    [STAThread]public static void Main(string[] args)
    {
        Application.EnableVisualStyles();var assembly=Assembly.LoadFrom(args[0]);assembly.GetType("WebViewBootstrap").GetMethod("Configure",BindingFlags.Static|BindingFlags.Public).Invoke(null,null);
        using(var window=(Form)Activator.CreateInstance(assembly.GetType("MainWindow"),new object[]{"http://127.0.0.1:43859/#key=isolated",args[1]}))
        {
            window.PerformLayout();if(window.Icon==null||window.Icon.Width<16)throw new Exception("Luma window icon missing");
            var header=window.Controls.Cast<Control>().Single(c=>c.GetType().Name=="WindowChrome");var content=window.Controls.Cast<Control>().Single(c=>c!=header);
            if(header.Height<60||content.Top<header.Bottom||content.Width!=header.Width)throw new Exception("Titlebar overlaps WebView content");
            if(window.FormBorderStyle!=FormBorderStyle.None)throw new Exception("Standard titlebar still enabled");
            var headerHandle=header.Handle;bool fullRepaint=false;header.Invalidated+=delegate(object sender,InvalidateEventArgs e){if(e.InvalidRect.Contains(header.ClientRectangle))fullRepaint=true;};
            long style=GetWindowLongPtr(window.Handle,-16).ToInt64();if((style&0x00C40000)!=0x00C40000)throw new Exception("Windows frame styles for system transitions are missing");if(!(bool)window.GetType().GetProperty("NativeTransitionsConfigured").GetValue(window,null))throw new Exception("DWM rejected the window transition setting");
            foreach(int width in new[]{1920,1000,2560,1380}){fullRepaint=false;window.ClientSize=new Size(width,900);window.PerformLayout();if(!fullRepaint)throw new Exception("Resizing did not invalidate the whole titlebar: "+width);var buttons=header.Controls.Cast<Control>().OrderBy(c=>c.Left).ToArray();if(buttons.Length!=3||buttons[2].Right>header.Width||buttons[0].Right>buttons[1].Left)throw new Exception("Broken resized titlebar layout");}
            foreach(Control button in header.Controls){var inputKey=button.GetType().GetMethod("IsInputKey",BindingFlags.Instance|BindingFlags.NonPublic);if(button.TabStop||(bool)inputKey.Invoke(button,new object[]{Keys.Space}))throw new Exception("Caption button accepts Space as an activation key");}
            var processKey=window.GetType().GetMethod("ProcessCmdKey",BindingFlags.Instance|BindingFlags.NonPublic);var state=window.WindowState;
            foreach(long flags in new[]{1L,1L|(1L<<30)}){var message=Message.Create(IntPtr.Zero,0x100,new IntPtr(32),new IntPtr(flags));if(!(bool)processKey.Invoke(window,new object[]{message,Keys.Space})||window.WindowState!=state)throw new Exception("Space can change window size");}
            Console.WriteLine("Native shell icon/layout, full-width resize repaint and Space command routing passed");
        }
    }
}
