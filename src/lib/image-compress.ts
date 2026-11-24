/**
 * 浏览器端图片压缩：按长边限制缩放并转 WebP。
 *
 * 任何一步失败（解码失败、浏览器不支持 WebP 编码、转换后反而更大）都回退原文件，
 * 保证上传流程不会因为压缩而中断。
 */

const COMPRESSIBLE = /^image\/(jpeg|jpg|png|webp)$/i;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === "function") {
    try {
      // imageOrientation 让手机竖拍图按 EXIF 正确旋转
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // 部分浏览器/超大图解码失败，回退 <img>
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(
  file: File,
  { maxEdge = 2560, quality = 0.85 }: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  if (!COMPRESSIBLE.test(file.type)) return file;

  try {
    const source = await decode(file);
    if (!source) return file;

    const sourceWidth = source instanceof ImageBitmap ? source.width : source.naturalWidth;
    const sourceHeight = source instanceof ImageBitmap ? source.height : source.naturalHeight;
    if (!sourceWidth || !sourceHeight) return file;

    const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, width, height);
    if (source instanceof ImageBitmap) source.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/webp", quality);
    });
    // 浏览器不支持 WebP 编码时 toBlob 返回 null
    if (!blob) return file;
    // 没缩放且转换后反而更大，就没必要换格式（常见于小尺寸图标）
    if (scale === 1 && blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^./\\]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
  } catch {
    return file;
  }
}
