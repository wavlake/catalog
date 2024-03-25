import Jimp from "jimp";
import fs from "fs";
import { AWS_S3_IMAGE_PREFIX } from "../library/constants";
import s3Client from "../library/s3Client";
import log from "loglevel";

const localConvertPath = process.env.LOCAL_CONVERT_PATH;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;

const upload_image = async (artworkFile, contentId) => {
  try {
    let uploadPath = artworkFile
      ? artworkFile.path
      : // default image
        "./graphics/wavlake-icon-750.png";
    const convertPath = `${localConvertPath}/${contentId}.jpg`;
    const s3Key = `${AWS_S3_IMAGE_PREFIX}/${contentId}.jpg`;

    // Resize and save the image
    await Jimp.read(uploadPath).then((img) => {
      return img
        .resize(500, 500) // Resize
        .quality(60) // Set JPEG quality
        .writeAsync(convertPath); // Save
    });

    // Upload to S3, this returns the URL but we dont use it
    const s3UploadResult = await s3Client.uploadS3(
      convertPath,
      s3Key,
      "artwork"
    );

    log.debug(
      `Artwork for ${contentId} uploaded to S3 ${s3UploadResult.Location}`
    );

    // Deleting local files
    fs.unlinkSync(convertPath);
    fs.unlinkSync(uploadPath);

    // Clean up with async calls to avoid blocking response
    log.debug(`Deleting local files: ${convertPath} & ${uploadPath}`);
    fs.unlink(`${convertPath}`, (err) => {
      if (err) log.debug(`Error deleting local file: ${err}`);
    });
    if (artworkFile) {
      // only delete the new image if it was uploaded
      // skip if we used the default image
      fs.unlink(`${uploadPath}`, (err) => {
        if (err) log.debug(`Error deleting local file: ${err}`);
      });
    }

    const liveUrl = `${cdnDomain}/${s3Key}`;
    // return the CDN url instead of the S3 url
    // this is saved in the database
    return liveUrl;
  } catch (err) {
    log.debug(`Error uploading image: ${err}`);
    throw err;
  }
};

export { upload_image };
