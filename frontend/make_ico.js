const sharp = require('sharp');
const fs = require('fs');

// png-to-ico exports as ESM default, use dynamic import
async function run() {
  try {
    const { default: pngToIco } = await import('png-to-ico');

    const sizes = [16, 32, 48, 64, 128, 256];

    // Generate PNG buffers for each size
    const buffers = await Promise.all(
      sizes.map(size =>
        sharp('public/icon_square.png')
          .resize(size, size)
          .png()
          .toBuffer()
      )
    );

    // Build multi-size ICO (Windows will pick the best size for each context)
    const icoBuffer = await pngToIco(buffers);
    fs.writeFileSync('src-tauri/icons/icon.ico', icoBuffer);

    // Also update the other icon files used by Tauri
    await sharp('public/icon_square.png').resize(256, 256).toFile('src-tauri/icons/icon.png');
    await sharp('public/icon_square.png').resize(128, 128).toFile('src-tauri/icons/128x128.png');
    await sharp('public/icon_square.png').resize(256, 256).toFile('src-tauri/icons/128x128@2x.png');
    await sharp('public/icon_square.png').resize(32, 32).toFile('src-tauri/icons/32x32.png');
    await sharp('public/icon_square.png').resize(64, 64).toFile('src-tauri/icons/64x64.png');

    console.log('Successfully generated multi-size icon.ico with sizes:', sizes.join(', '));
  } catch (err) {
    console.error('Error generating icon:', err);
  }
}

run();
