import AWS from "aws-sdk";
import log from "loglevel";

const awsCdn = new AWS.CloudFront({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  apiVersion: "2020-05-31",
});

const distributionId = `${process.env.AWS_CDN_ID}`;

async function invalidateCdn(sourcePath) {
  log.info(`Invalidating content ${sourcePath}`);
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

async function batchInvalidateCdn(sourcePaths) {
  if (!sourcePaths || sourcePaths.length === 0) {
    return Promise.resolve();
  }

  // CloudFront requires paths to start with /
  const formattedPaths = sourcePaths.map((path) => `/${path}`);

  log.info(`Batch invalidating ${formattedPaths.length} paths in CloudFront`);

  const params = {
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `batch-${Math.floor(new Date().getTime() / 1000)}`,
      Paths: {
        Quantity: formattedPaths.length,
        Items: formattedPaths,
      },
    },
  };

  try {
    const result = await awsCdn.createInvalidation(params).promise();
    log.info(
      `Successfully created batch invalidation: ${result.Invalidation.Id}`
    );
    return result;
  } catch (err) {
    log.error(`Batch invalidation error: ${err}`);
    throw err;
  }
}

export default {
  awsCdn,
  invalidateCdn,
  batchInvalidateCdn,
};
