const AWS = require("aws-sdk");
const log = require("loglevel");

const awsCdn = new AWS.CloudFront({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  apiVersion: "2020-05-31",
});

const distributionId = `${process.env.AWS_CDN_ID}`;

async function invalidateCdn(sourcePath) {
  log.info(`Invalidating content ${sourcePath}`);
  // console.log(sourcePath)
  const params = {
    DistributionId: distributionId /* required */,
    InvalidationBatch: {
      /* required */
      CallerReference: `${Math.floor(
        new Date().getTime() / 1000
      )}` /* required */,
      Paths: {
        /* required */ Quantity: 1 /* required */,
        Items: [
          `/${sourcePath}`,
          /* more items */
        ],
      },
    },
  };

  return awsCdn
    .createInvalidation(params, (err, data) => {
      if (err) {
        log.error(`Error invalidating cache for ${sourcePath}: ${err}`);
      }
    })
    .promise();
}

module.exports = {
  awsCdn,
  invalidateCdn,
};
