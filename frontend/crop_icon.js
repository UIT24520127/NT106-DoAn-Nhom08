const sharp = require('sharp');
const fs = require('fs');

async function run() {
  try {
    const inputPath = 'public/icon_square.png';
    const metadata = await sharp(inputPath).metadata();
    
    // We want to crop the image to remove more transparent or semi-transparent space.
    // Let's crop 15% from each side.
    const cropWidth = Math.floor(metadata.width * 0.7);
    const cropHeight = Math.floor(metadata.height * 0.7);
    const left = Math.floor((metadata.width - cropWidth) / 2);
    const top = Math.floor((metadata.height - cropHeight) / 2) + 20; // Shift down a bit if needed, or center. Let's just center:
    
    const topFix = Math.floor((metadata.height - cropHeight) / 2);

    await sharp(inputPath)
      .extract({ left: left, top: topFix, width: cropWidth, height: cropHeight })
      .resize(512, 512)
      .toFile('public/icon_zoomed.png');
    
    console.log("Successfully generated icon_zoomed.png!");
  } catch (err) {
    console.error("Error generating icon:", err);
  }
}

run();
