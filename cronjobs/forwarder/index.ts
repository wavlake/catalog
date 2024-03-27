import prisma from "@prismalocal/client";
import { LightningAddressPaymentRequest } from "@library/zbd/requestInterfaces";
import { payToLightningAddress } from "@library/zbd/zbdClient";
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);

const TIME_BETWEEN_REQUESTS = 2000; // 2 seconds
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
  // and where attempt_count is less than or equal to MAX_ATTEMPT_COUNT
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

  return;
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

    // For forwards that are less than the MIN_BATCH_FORWARD_AMOUNT but need to be sent because they're 24 hours old
    const isOneDayOld =
      new Date(createdAt) < new Date(Date.now() - 24 * 60 * 60 * 1000);
    const isOldEnoughAndMeetsMinimum =
      isOneDayOld && msatAmount >= MIN_FORWARD_AMOUNT;
    // Add sleep to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, TIME_BETWEEN_REQUESTS));
    if (
      (msatAmount as number) >= MIN_BATCH_FORWARD_AMOUNT ||
      isOldEnoughAndMeetsMinimum
    ) {
      log.debug(
        `Processing payment for lightning address: ${lightningAddress} with msat amount: ${amountToSend}`
      );
      // Send payment request to ZBD
      const request: LightningAddressPaymentRequest = {
        lnAddress: lightningAddress,
        amount: amountToSend.toString(),
        internalId: internalId,
        comment: `Wavlake forwarding service: ${internalId}`,
      };

      // Update forward records to be in flight
      await prisma.forward.updateMany({
        where: {
          id: { in: ids },
        },
        data: {
          inFlight: true,
        },
      });

      const response = await payToLightningAddress(request);
      // If successful, update the forward record with the external transaction id
      if (response.success) {
        // Update the forward record with the external transaction id
        await prisma.forward.updateMany({
          where: {
            id: { in: ids },
          },
          data: {
            externalPaymentId: response.data.id,
          },
        });
        // If there is a remainder, create a new forward record for the remainder
        if (remainderMsats > 0) {
          log.debug(`Creating remainder forward record for ${remainderMsats}`);
          await prisma.forward.create({
            data: {
              userId: userId,
              msatAmount: remainderMsats,
              lightningAddress: lightningAddress,
              attemptCount: 0,
              remainderId: response.data.id,
            },
          });
        }
      } else {
        log.error(
          `Error making payment request for forward: ${response.message}`
        );
        await prisma.forward.updateMany({
          where: {
            id: { in: ids },
          },
          data: {
            attemptCount: {
              increment: 1,
            },
            inFlight: false,
            error: response.message,
          },
        });
      }
      // DONE
    }
  }
};
