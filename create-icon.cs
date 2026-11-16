using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Collections.Generic;
internal static class CreateIcon
{
    private static GraphicsPath Round(RectangleF r,float radius){var p=new GraphicsPath();float d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
    private static Bitmap Draw(int size)
    {
        var bitmap=new Bitmap(size,size,PixelFormat.Format32bppArgb);using(var g=Graphics.FromImage(bitmap))
        {
            g.SmoothingMode=SmoothingMode.AntiAlias;g.ScaleTransform(size/64f,size/64f);
            using(var shape=Round(new RectangleF(1.5f,1.5f,61,61),19))using(var gradient=new LinearGradientBrush(new PointF(5,3),new PointF(57,61),Color.FromArgb(185,219,255),Color.FromArgb(122,104,205)))
            {g.FillPath(gradient,shape);using(var pen=new Pen(Color.FromArgb(200,255,255,255),1.5f))g.DrawPath(pen,shape);}
            using(var shine=Round(new RectangleF(4,4,56,27),15))using(var brush=new LinearGradientBrush(new Point(0,4),new Point(0,32),Color.FromArgb(90,255,255,255),Color.Transparent))g.FillPath(brush,shine);
            using(var mark=new GraphicsPath())using(var white=new SolidBrush(Color.White))
            {
                mark.StartFigure();mark.AddLine(19,16,19,40);mark.AddBezier(19,40,19,44.4f,22.6f,48,27,48);mark.AddLine(27,48,31,48);mark.AddLine(31,48,31,41);mark.AddLine(31,41,28,41);mark.AddBezier(28,41,26.9f,41,26,40.1f,26,39);mark.AddLine(26,39,26,16);mark.CloseFigure();
                mark.StartFigure();mark.AddLine(34,27,34,40);mark.AddBezier(34,40,34,45,38,49,43,49);mark.AddBezier(43,49,48,49,52,45,52,40);mark.AddLine(52,40,52,27);mark.AddLine(52,27,45,27);mark.AddLine(45,27,45,40);mark.AddBezier(45,40,45,41.1f,44.1f,42,43,42);mark.AddBezier(43,42,41.9f,42,41,41.1f,41,40);mark.AddLine(41,40,41,27);mark.CloseFigure();g.FillPath(white,mark);
            }
        }return bitmap;
    }
    public static void Main(string[] args)
    {
        int[] sizes={16,20,24,32,40,48,64,128,256};var images=new List<byte[]>();foreach(int size in sizes)using(var bitmap=Draw(size))using(var bytes=new MemoryStream()){bitmap.Save(bytes,ImageFormat.Png);images.Add(bytes.ToArray());if(size==256)bitmap.Save(Path.Combine(args[0],"app-icon.png"),ImageFormat.Png);}
        using(var output=new BinaryWriter(File.Create(Path.Combine(args[0],"luma.ico")))){output.Write((ushort)0);output.Write((ushort)1);output.Write((ushort)sizes.Length);int offset=6+16*sizes.Length;for(int i=0;i<sizes.Length;i++){output.Write((byte)(sizes[i]==256?0:sizes[i]));output.Write((byte)(sizes[i]==256?0:sizes[i]));output.Write((byte)0);output.Write((byte)0);output.Write((ushort)1);output.Write((ushort)32);output.Write(images[i].Length);output.Write(offset);offset+=images[i].Length;}foreach(var bytes in images)output.Write(bytes);}
    }
}
