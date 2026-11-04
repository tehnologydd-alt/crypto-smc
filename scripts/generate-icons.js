import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Function to generate uncompressed or deflate-compressed valid PNG file
function createPng(width, height, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth 8
  ihdr.writeUInt8(2, 9); // color type 2 (RGB)
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);

  // Raw image data: filter byte (0) + width * 3 bytes per scanline
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 3;
      // Draw a subtle border & center crypto emerald mark
      const distFromCenter = Math.hypot(x - width / 2, y - height / 2);
      const isCenter = distFromCenter < width * 0.32;
      const isInner = distFromCenter < width * 0.28;
      const isRing = distFromCenter >= width * 0.38 && distFromCenter <= width * 0.42;

      if (isRing) {
        rawData[pxOffset] = 16;
        rawData[pxOffset + 1] = 185;
        rawData[pxOffset + 2] = 129; // emerald
      } else if (isInner) {
        rawData[pxOffset] = 14;
        rawData[pxOffset + 1] = 165;
        rawData[pxOffset + 2] = 233; // cyan
      } else if (isCenter) {
        rawData[pxOffset] = 245;
        rawData[pxOffset + 1] = 158;
        rawData[pxOffset + 2] = 11; // amber
      } else {
        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const checksum = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(checksum, 0);

  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Simple CRC32 implementation
function crc32(buf) {
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  table[i] = c >>> 0;
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Write PWA PNGs
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, 9, 13, 22));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, 9, 13, 22));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, 9, 13, 22));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, 9, 13, 22));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createPng(32, 32, 9, 13, 22));

console.log('PWA PNG icons created successfully.');
