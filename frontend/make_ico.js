const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const fs = require('fs');

async function run() {
  try {
    // Resize `icon_square.png` to exactly 256x256
    const buffer256 = await sharp('public/icon_square.png')
      .resize(256, 256)
      .toBuffer();

    // Use png-to-ico to convert the buffer into an .ico file
    const icoBuffer = await pngToIco(buffer256);
    
    // Write it to src-tauri/icons/icon.ico
    fs.writeFileSync('src-tauri/icons/icon.ico', icoBuffer);
    
    // Also overwrite icon.png in icons folder just in case
    await sharp(buffer256).toFile('src-tauri/icons/icon.png');
    await sharp(buffer256).toFile('src-tauri/icons/128x128.png');
    await sharp(buffer256).toFile('src-tauri/icons/128x128@2x.png');
    await sharp(buffer256).toFile('src-tauri/icons/32x32.png');
    
    console.log("Successfully generated large icons!");
  } catch (err) {
    console.error("Error generating icon:", err);
  }
}

run();
