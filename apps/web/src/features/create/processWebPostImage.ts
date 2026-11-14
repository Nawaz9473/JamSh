export type WebPostEditOptions = {
  rotation: 0 | 90 | 180 | 270;
  aspectRatio: 'original' | '1:1' | '4:5' | '16:9';
};

export async function processWebPostImage(file: File, options: WebPostEditOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const [ratioWidth, ratioHeight] = options.aspectRatio === 'original'
    ? [bitmap.width, bitmap.height]
    : options.aspectRatio.split(':').map(Number);
  const sourceRatio = bitmap.width / bitmap.height;
  const targetRatio = ratioWidth / ratioHeight;
  const cropWidth = sourceRatio > targetRatio ? bitmap.height * targetRatio : bitmap.width;
  const cropHeight = sourceRatio > targetRatio ? bitmap.height : bitmap.width / targetRatio;
  const cropX = (bitmap.width - cropWidth) / 2;
  const cropY = (bitmap.height - cropHeight) / 2;
  const isQuarterTurn = options.rotation === 90 || options.rotation === 270;
  canvas.width = isQuarterTurn ? cropHeight : cropWidth;
  canvas.height = isQuarterTurn ? cropWidth : cropHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image editing is unavailable in this browser');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((options.rotation * Math.PI) / 180);
  context.drawImage(
    bitmap,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    -cropWidth / 2,
    -cropHeight / 2,
    cropWidth,
    cropHeight
  );
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to process image')), 'image/jpeg', 0.92);
  });
}
