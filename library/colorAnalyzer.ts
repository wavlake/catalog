import Vibrant from "node-vibrant";
import axios from "axios";
import prisma from "../prisma/client";

async function get_color_palette(imageUrl) {
  try {
    // Download the image
    const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data, "binary");

    // Extract the color palette
    const palette = await Vibrant.from(buffer).getPalette();

    return {
      vibrant: palette.Vibrant.hex,
      darkVibrant: palette.DarkVibrant.hex,
      lightVibrant: palette.LightVibrant.hex,
      muted: palette.Muted.hex,
      darkMuted: palette.DarkMuted.hex,
      lightMuted: palette.LightMuted.hex,
    };
  } catch (error) {
    console.error("Error extracting color palette:", error);
  }
}

// script that goes through all tracks with undefined colorInfo columns and updates them with the color palette
async function get_artwork_colors() {
  // get tracks with undefined colorInfo columns
  const albums = await prisma.album.findMany({
    where: {
      colorInfo: null,
    },
    take: 10,
  });

  // go through each track, extract the color palette, and update the colorInfo column in the database
  for (const album of albums) {
    const palette = await get_color_palette(album.artworkUrl);
    await prisma.album.update({
      where: {
        id: album.id,
      },
      data: {
        colorInfo: palette,
      },
    });
  }
}

export { get_color_palette, get_artwork_colors };
