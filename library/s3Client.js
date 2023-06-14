const AWS = require("aws-sdk");
const fs = require("fs");
const log = require("loglevel");

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
        log.debug(`Error deleting ${key} from S3: ${err}`);
      }
      log.debug(`Deleted ${key} from S3: ${data}`);
    })
    .promise();
}

async function uploadS3(sourcePath, key, type) {
  const object = {
    Bucket: s3BucketName,
    Key: key,
    Body: fs.readFileSync(sourcePath),
    ContentType: "image/*",
  };

  return s3
    .upload(object, (err, data) => {
      if (err) {
        log.debug(`Error uploading ${type}:${key} to S3: ${err}`);
      }
    })
    .promise();
}

module.exports = {
  s3,
  deleteFromS3,
  uploadS3,
};
