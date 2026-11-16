using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

internal sealed class WindowChrome : Panel
{
    [DllImport("user32.dll")]private static extern bool ReleaseCapture();
    [DllImport("user32.dll")]private static extern IntPtr SendMessage(IntPtr window,int message,IntPtr wParam,IntPtr lParam);
    private readonly MainWindow owner;private readonly ChromeButton minimize,maximize,close;private readonly Image logo;
    private bool dark=true,english;
    private Color backdropStart=Color.FromArgb(29,45,70),backdropEnd=Color.FromArgb(41,35,60);
    public event EventHandler InteractionFinished;
    public WindowChrome(MainWindow form)
    {
        owner=form;Dock=DockStyle.Top;Height=66;DoubleBuffered=true;ResizeRedraw=true;AccessibleName="Luma Music";
        using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("app-icon.png"))if(stream!=null)using(var image=Image.FromStream(stream))logo=new Bitmap(image);
        minimize=new ChromeButton(0);maximize=new ChromeButton(1);close=new ChromeButton(2);Controls.AddRange(new Control[]{minimize,maximize,close});
        minimize.Click+=delegate{owner.MinimizeWindow();};maximize.Click+=delegate{ToggleMaximize();};close.Click+=delegate{owner.Close();};
        owner.Resize+=delegate{maximize.Restored=owner.WindowState==FormWindowState.Maximized;maximize.Invalidate();UpdateLabels();};
        MouseDown+=delegate(object sender,MouseEventArgs e){if(e.Button==MouseButtons.Left&&e.Clicks==1){ReleaseCapture();SendMessage(owner.Handle,0xA1,new IntPtr(2),IntPtr.Zero);ReturnFocus();}};
        MouseDoubleClick+=delegate(object sender,MouseEventArgs e){if(e.Button==MouseButtons.Left)ToggleMaximize();};SetAppearance(true,false);
    }
    private void ToggleMaximize(){owner.ToggleMaximize();ReturnFocus();}
    private void ReturnFocus(){if(InteractionFinished!=null)InteractionFinished(this,EventArgs.Empty);}
    protected override void OnSizeChanged(EventArgs e){base.OnSizeChanged(e);Invalidate(true);}
    protected override void OnLayout(LayoutEventArgs e){base.OnLayout(e);if(close==null)return;float s=Height/66f;int size=(int)(36*s),gap=(int)(7*s),right=Width-(int)(25*s);foreach(var button in new[]{close,maximize,minimize}){button.SetBounds(right-size,(Height-size)/2,size,size);right-=size+gap;}}
    public void SetAppearance(bool useDark,bool useEnglish)
    {
        dark=useDark;english=useEnglish;backdropStart=dark?Color.FromArgb(29,45,70):Color.FromArgb(217,234,254);backdropEnd=dark?Color.FromArgb(41,35,60):Color.FromArgb(232,224,248);BackColor=backdropStart;
        foreach(var button in new[]{minimize,maximize,close}){button.Dark=dark;button.BackColor=dark?Color.FromArgb(51,47,74):Color.FromArgb(233,234,249);button.ForeColor=dark?Color.FromArgb(203,218,243):Color.FromArgb(87,109,151);button.Invalidate();}UpdateLabels();Invalidate();
    }
    public void SetBackdropColors(string start,string end)
    {
        if(!IsHexColor(start)||!IsHexColor(end))return;
        backdropStart=ColorTranslator.FromHtml(start);backdropEnd=ColorTranslator.FromHtml(end);BackColor=backdropStart;Invalidate(true);owner.Invalidate();
    }
    private static bool IsHexColor(string value){return value!=null&&System.Text.RegularExpressions.Regex.IsMatch(value,"^#[0-9a-fA-F]{6}$");}
    internal void PaintWindowBackground(Graphics g,Rectangle area)
    {
        using(var fill=new LinearGradientBrush(new Point(area.Left,0),new Point(area.Left+Math.Max(1,area.Width-1),0),backdropStart,backdropEnd))g.FillRectangle(fill,new Rectangle(0,0,owner.ClientSize.Width,owner.ClientSize.Height));
    }
    private void UpdateLabels(){minimize.AccessibleName=english?"Minimize":"Свернуть";maximize.AccessibleName=owner.WindowState==FormWindowState.Maximized?(english?"Restore":"Восстановить"):(english?"Maximize":"Развернуть");close.AccessibleName=english?"Close":"Закрыть";}
    internal void PaintMaterial(Graphics g)
    {
        using(var background=new LinearGradientBrush(new Point(0,0),new Point(Math.Max(1,Width-1),0),backdropStart,backdropEnd))g.FillRectangle(background,ClientRectangle);
        g.SmoothingMode=SmoothingMode.AntiAlias;float s=Height/66f;var surface=new RectangleF(10*s,7*s,Width-20*s,Height-14*s);
        using(var shape=Round(surface,19*s))using(var fill=new LinearGradientBrush(surface,dark?Color.FromArgb(18,147,182,234):Color.FromArgb(173,255,255,255),dark?Color.FromArgb(10,103,121,176):Color.FromArgb(74,255,255,255),145f))
        {g.FillPath(fill,shape);using(var edge=new Pen(dark?Color.FromArgb(88,122,151,195):Color.FromArgb(225,255,255,255),s))g.DrawPath(edge,shape);}
        using(var shine=new Pen(dark?Color.FromArgb(25,226,238,255):Color.FromArgb(210,255,255,255),s))g.DrawLine(shine,29*s,8*s,Width-29*s,8*s);
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        var g=e.Graphics;PaintMaterial(g);float s=Height/66f;
        if(logo!=null)g.DrawImage(logo,28*s,16*s,34*s,34*s);
        using(var font=new Font("Segoe UI",21*s,FontStyle.Bold,GraphicsUnit.Pixel))using(var brush=new SolidBrush(dark?Color.FromArgb(217,229,251):Color.FromArgb(66,89,134)))g.DrawString("luma.",font,brush,75*s,17*s);
        using(var font=new Font("Segoe UI",8*s,FontStyle.Regular,GraphicsUnit.Pixel))using(var brush=new SolidBrush(dark?Color.FromArgb(136,158,195):Color.FromArgb(126,146,178)))g.DrawString("M U S I C  I S  Y O U R S",font,brush,153*s,29*s);
    }
    internal static GraphicsPath Round(RectangleF r,float radius){var p=new GraphicsPath();float d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
    protected override void Dispose(bool disposing){if(disposing&&logo!=null)logo.Dispose();base.Dispose(disposing);}
}
internal sealed class ChromeButton : Control
{
    private readonly int glyph;private bool hover,pressed;public bool Dark=true,Restored;
    public ChromeButton(int symbol){glyph=symbol;Text="";AccessibleRole=AccessibleRole.PushButton;TabStop=false;CausesValidation=false;SetStyle(ControlStyles.StandardClick|ControlStyles.StandardDoubleClick,false);SetStyle(ControlStyles.OptimizedDoubleBuffer|ControlStyles.UserPaint|ControlStyles.ResizeRedraw|ControlStyles.AllPaintingInWmPaint,true);}
    public void PerformClick(){if(Enabled)OnClick(EventArgs.Empty);}
    protected override void OnMouseDown(MouseEventArgs e){if(e.Button==MouseButtons.Left&&ClientRectangle.Contains(e.Location)){pressed=true;Capture=true;Invalidate();}base.OnMouseDown(e);}
    protected override void OnMouseUp(MouseEventArgs e){bool click=pressed&&e.Button==MouseButtons.Left&&ClientRectangle.Contains(e.Location);pressed=false;Capture=false;Invalidate();base.OnMouseUp(e);if(click)PerformClick();}
    protected override void OnMouseCaptureChanged(EventArgs e){if(!Capture){pressed=false;Invalidate();}base.OnMouseCaptureChanged(e);}
    protected override AccessibleObject CreateAccessibilityInstance(){return new CaptionAccessibleObject(this);}
    private sealed class CaptionAccessibleObject:ControlAccessibleObject
    {
        private readonly ChromeButton button;public CaptionAccessibleObject(ChromeButton value):base(value){button=value;}
        public override string DefaultAction{get{return "Press";}}
        public override void DoDefaultAction(){button.PerformClick();}
    }
    protected override bool IsInputKey(Keys keyData){return keyData==Keys.Space?false:base.IsInputKey(keyData);}
    protected override void OnKeyDown(KeyEventArgs e){if(e.KeyCode==Keys.Space){e.Handled=true;e.SuppressKeyPress=true;return;}base.OnKeyDown(e);}
    protected override void OnKeyUp(KeyEventArgs e){if(e.KeyCode==Keys.Space){e.Handled=true;e.SuppressKeyPress=true;return;}base.OnKeyUp(e);}
    protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
    protected override void OnMouseLeave(EventArgs e){hover=false;Invalidate();base.OnMouseLeave(e);}
    protected override void OnPaint(PaintEventArgs e)
    {
        var g=e.Graphics;var chrome=Parent as WindowChrome;if(chrome!=null){var saved=g.Save();g.TranslateTransform(-Left,-Top);chrome.PaintMaterial(g);g.Restore(saved);}else g.Clear(BackColor);g.SmoothingMode=SmoothingMode.AntiAlias;float s=Height/36f;var r=new RectangleF(s,s,Width-2*s,Height-2*s);
        using(var shape=WindowChrome.Round(r,12*s))using(var brush=new LinearGradientBrush(r,hover&&glyph==2?Color.FromArgb(215,102,132):Dark?(hover?Color.FromArgb(81,99,137):Color.FromArgb(64,75,108)):(hover?Color.FromArgb(249,253,255):Color.FromArgb(247,249,255)),hover&&glyph==2?Color.FromArgb(171,68,108):Dark?Color.FromArgb(47,54,84):Color.FromArgb(218,226,245),120f))
        {g.FillPath(brush,shape);using(var edge=new Pen(Dark?Color.FromArgb(75,184,206,243):Color.FromArgb(230,255,255,255),s))g.DrawPath(edge,shape);}
        float size=12*s,x=(Width-size)/2,y=(Height-size)/2;using(var pen=new Pen(hover&&glyph==2?Color.White:ForeColor,1.4f*s))
        {if(glyph==0)g.DrawLine(pen,x,y+size/2,x+size,y+size/2);else if(glyph==2){g.DrawLine(pen,x,y,x+size,y+size);g.DrawLine(pen,x+size,y,x,y+size);}else if(Restored){g.DrawLines(pen,new[]{new PointF(x+3*s,y),new PointF(x+size,y),new PointF(x+size,y+size-3*s)});g.DrawRectangle(pen,x,y+3*s,size-3*s,size-3*s);}else g.DrawRectangle(pen,x,y,size,size);}
        if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(g,new Rectangle(4,4,Width-8,Height-8));
    }
}
