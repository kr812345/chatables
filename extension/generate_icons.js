const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgLogo = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="128" fill="#FFF9F6" />
  <path d="M 269.28 296 A 80 80 0 1 1 269.28 216" stroke="#1C1917" stroke-width="24" stroke-linecap="round" />
  <path d="M 242.72 216 A 80 80 0 1 1 242.72 296" stroke="#FF5C00" stroke-width="24" stroke-linecap="round" />
  <circle cx="200" cy="256" r="20" fill="#FF5C00" />
  <circle cx="312" cy="256" r="20" fill="#1C1917" />
</svg>
`;

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

async function generate() {
  console.log('🎨 Generating PNG icons from SVG...');
  for (const size of sizes) {
    const filename = `icon${size}.png`;
    const outputPath = path.join(iconsDir, filename);
    await sharp(Buffer.from(svgLogo))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✅ Generated ${size}x${size} icon: public/icons/${filename}`);
  }
  console.log('🎉 All icons successfully generated!');
}

generate().catch(err => {
  console.error('❌ Error generating icons:', err);
  process.exit(1);
});
