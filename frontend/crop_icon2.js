const sharp = require('sharp');

async function run() {
  try {
    const inputPath = 'public/icon_square.png';
    const metadata = await sharp(inputPath).metadata();
    
    // We will crop heavily. The original is 501x501.
    // Let's crop it down to 220x220 in the center.
    // Wait, let's look at the person. It's usually horizontally centered, 
    // but vertically it might be shifted. Let's assume it's in the center.
    // If we crop too much, we might cut off the head or shoulders.
    // Let's crop a 280x280 box from the center.
    const cropWidth = 280;
    const cropHeight = 280;
    const left = Math.floor((metadata.width - cropWidth) / 2);
    // Shift slightly upwards because characters usually have empty space above the head
    // but their body extends downwards.
    const top = Math.floor((metadata.height - cropHeight) / 2) - 10;

    await sharp(inputPath)
      .extract({ left: left, top: top, width: cropWidth, height: cropHeight })
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile('public/icon_zoomed_max.png');
    
    console.log("Successfully generated icon_zoomed_max.png!");
  } catch (err) {
    console.error("Error generating icon:", err);
  }
}

run();
