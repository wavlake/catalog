import prisma from "@prismalocal/client";
import { LightningAddressPaymentRequest } from "@library/zbd/requestInterfaces";
import { payToLightningAddress } from "@library/zbd/zbdClient";
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);

const MIN_BATCH_FORWARD_AMOUNT = 10000; // min amount in msat to batch forward
const MIN_FORWARD_AMOUNT = 1000; // min amount in msat to forward
const MAX_ATTEMPT_COUNT = 3;
const CURRENT_DATE = new Date();

interface groupedForwards {
  [key: string]: {
    lightningAddress: string;
    msatAmount: number;
    createdAt: Date;
    ids: [number];
  };
}

const run = async () => {
  // Check the forward table for any records with a status of in_flight = false and is_settled = false
  const forwardsOutstanding = await prisma.forward.findMany({
    where: {
      inFlight: false,
      isSettled: false,
      createdAt: {
        lte: CURRENT_DATE,
      },
      attemptCount: {
        lte: MAX_ATTEMPT_COUNT,
      },
    },
  });

  log.debug("Forwards outstanding:", forwardsOutstanding);
  // If there are any, group the payments by lightning_address and sum msat_amount
  const groupedForwards = forwardsOutstanding.reduce((acc, curr) => {
    if (!acc[curr.userId]) {
      acc[curr.userId] = {
        lightningAddress: curr.lightningAddress,
        msatAmount: 0,
        ids: [],
      };
    }
    acc[curr.userId].msatAmount += curr.msatAmount;
    // Use the oldest created_at date
    if (!acc[curr.userId].createdAt) {
      acc[curr.userId].createdAt = curr.createdAt;
    } else if (curr.createdAt < acc[curr.userId].createdAt) {
      acc[curr.userId].createdAt = curr.createdAt;
    }
    acc[curr.userId].ids.push(curr.id);
    return acc;
  }, {});

  log.debug("Grouped forwards:", groupedForwards);
  // For each group where the sum is greater than or equal to the minimum_forward_amount, initiate a payment
  await handlePayments(groupedForwards);

  // DONE
};

run();

const handlePayments = async (groupedForwards: groupedForwards) => {
  // Iterate over each group
  for (const [
    userId,
    { lightningAddress, msatAmount, createdAt, ids },
  ] of Object.entries(groupedForwards)) {
    const remainderMsats = msatAmount % 1000;
    const amountToSend = msatAmount - remainderMsats;
    const internalId = `forward-${ids[0]}`;
    const isDayOldAndEnough =
      new Date(createdAt) < new Date(Date.now() - 24 * 60 * 60 * 1000) &&
      msatAmount >= MIN_FORWARD_AMOUNT;
    // Add sleep to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (
      (msatAmount as number) >= MIN_BATCH_FORWARD_AMOUNT ||
      isDayOldAndEnough
    ) {
      log.debug(
        `Processing payment for lightning address: ${lightningAddress} with msat amount: ${amountToSend}`
      );
      // Send payment request to ZBD
      const request: LightningAddressPaymentRequest = {
        lnAddress: lightningAddress,
        amount: amountToSend.toString(),
        internalId: internalId,
        comment: `Wavlake forwarding service ${internalId}`,
      };
      const response = await payToLightningAddress(request);
      // If successful, update the forward record with the external transaction id
      if (response.success) {
        // Update the forward record with the external transaction id
        await prisma.forward.updateMany({
          where: {
            id: { in: ids },
          },
          data: {
            inFlight: true,
            externalPaymentId: response.data.id,
          },
        });
        log.debug(`Creating remainder forward record for ${remainderMsats}`);
        await prisma.forward.create({
          data: {
            userId: userId,
            msatAmount: remainderMsats,
            lightningAddress: lightningAddress,
            attemptCount: 0,
          },
        });
      } else {
        // If the payment fails, update the record with the error message
        await prisma.forward.updateMany({
          where: {
            id: { in: ids },
          },
          data: {
            error: response.message,
          },
        });
      }
      // DONE
    }
  }
};
