import AWS from "aws-sdk";
import fs from "fs";
import log from "loglevel";

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  apiVersion: "2006-03-01",
  region: "us-east-2",
});

const s3BucketName = `${process.env.AWS_S3_BUCKET_NAME}`;

async function deleteFromS3(key) {
  var params = {
    Bucket: s3BucketName,
    Key: key,
  };

  return s3
    .deleteObject(params, function (err, data) {
      if (err) {
        log.error(`Error deleting ${key} from S3: ${err}`);
      }
      log.info(`Deleted ${key} from S3`);
    })
    .promise();
}

async function batchDeleteFromS3(keys) {
  if (!keys || keys.length === 0) {
    return Promise.resolve({ Deleted: [] });
  }

  // S3 batch delete requires Objects array with { Key: 'keyname' }
  const objects = keys.map((key) => ({ Key: key }));

  const params = {
    Bucket: s3BucketName,
    Delete: {
      Objects: objects,
      Quiet: false, // Set to true to return only errors
    },
  };

  try {
    const result = await s3.deleteObjects(params).promise();
    log.info(
      `Successfully batch deleted ${result.Deleted.length} objects from S3`
    );

    // Log any errors that occurred during batch deletion
    if (result.Errors && result.Errors.length > 0) {
      result.Errors.forEach((error) => {
        log.error(
          `Error deleting ${error.Key} from S3: ${error.Code} - ${error.Message}`
        );
      });
    }

    return result;
  } catch (err) {
    log.error(`Batch deletion error: ${err}`);
    throw err;
  }
}

async function uploadS3(sourcePath, key, type) {
  const object = {
    Bucket: s3BucketName,
    Key: key,
    Body: fs.readFileSync(sourcePath),
    ContentType: "image/jpeg",
  };

  return s3
    .upload(object, (err, data) => {
      if (err) {
        log.error(`Error uploading ${type}:${key} to S3: ${err}`);
      }
    })
    .promise();
}

async function generatePresignedUrl({ key, extension }) {
  const params = {
    Bucket: s3BucketName,
    Key: `${key}.${extension}`,
    Expires: 3600,
  };

  return new Promise((resolve, reject) => {
    s3.getSignedUrl("putObject", params, (err, data) => {
      if (err) {
        log.error(`Error generating presigned url for ${key}: ${err}`);
        reject(err);
      } else resolve(data);
    });
  });
}

export default {
  s3,
  deleteFromS3,
  batchDeleteFromS3,
  generatePresignedUrl,
  uploadS3,
};
