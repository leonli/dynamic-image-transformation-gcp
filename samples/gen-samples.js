// Generates synthetic sample images for e2e tests and the demo storyline.
const sharp = require('/home/lileon/dynamic-image-transformation-gcp/source/image-handler/node_modules/sharp');

(async () => {
  // 1200x800 landscape photo stand-in: blue-to-white gradient with grid
  const svgPhoto = `<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a73e8"/><stop offset="100%" stop-color="#e8f0fe"/>
    </linearGradient></defs>
    <rect width="1200" height="800" fill="url(#g)"/>
    <circle cx="900" cy="200" r="120" fill="#fbbc04"/>
    <text x="60" y="740" font-size="64" font-family="sans-serif" fill="#fff">GCP DIT sample 1200x800</text>
  </svg>`;
  await sharp(Buffer.from(svgPhoto)).jpeg({ quality: 92 }).toFile('landscape.jpg');

  // transparent PNG logo for watermark tests
  const svgLogo = `<svg width="300" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="292" height="92" rx="16" fill="#1a73e8" fill-opacity="0.85"/>
    <text x="150" y="63" font-size="36" font-family="sans-serif" fill="#fff" text-anchor="middle">WATERMARK</text>
  </svg>`;
  await sharp(Buffer.from(svgLogo)).png().toFile('logo.png');

  // small PNG with alpha for edits tests
  await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 52, g: 168, b: 83, alpha: 1 } } })
    .png().toFile('solid.png');

  // animated GIF (3 frames) via raw frame stacking
  const frames = [];
  for (const c of [{r:234,g:67,b:53},{r:251,g:188,b:4},{r:52,g:168,b:83}]) {
    frames.push(await sharp({ create: { width: 160, height: 120, channels: 3, background: c } }).png().toBuffer());
  }
  // join frames vertically then tell sharp it's an animation strip
  const strip = await sharp(frames[0]).extend({ bottom: 240, background: '#000' })
    .composite([{ input: frames[1], top: 120, left: 0 }, { input: frames[2], top: 240, left: 0 }])
    .png().toBuffer();
  await sharp(strip, { }).gif({ }).toFile('static.gif'); // static gif fallback
  // proper animated gif: use sharp's multi-page via webp->gif not supported; keep 2-frame manual GIF
  console.log('samples generated');
})();
