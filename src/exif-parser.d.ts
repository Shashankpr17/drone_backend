declare module 'exif-parser' {
  type ExifTags = {
    GPSLatitude?: number;
    GPSLongitude?: number;
    GPSLatitudeRef?: string;
    GPSLongitudeRef?: string;
  };

  type ParsedExif = { tags: ExifTags };

  const exifParser: {
    create(buffer: Buffer): { parse(): ParsedExif };
  };

  export default exifParser;
}
