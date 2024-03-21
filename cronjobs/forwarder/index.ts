import prisma from "@prismalocal/client";
import { LightningAddressPaymentRequest } from "@library/zbd/requestInterfaces";
import { payToLightningAddress } from "@library/zbd/zbdClient";
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);

const MIN_FORWARD_AMOUNT = 1000;
const CURRENT_DATE = new Date();

interface groupedForwards {
  [key: string]: {
    msatAmount: number;
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
    },
  });

  log.debug("Forwards outstanding:", forwardsOutstanding);
  // If there are any, group the payments by lightning_address and sum msat_amount
  const groupedForwards = forwardsOutstanding.reduce((acc, curr) => {
    if (!acc[curr.lightningAddress]) {
      acc[curr.lightningAddress] = {
        msatAmount: 0,
        ids: [],
      };
    }
    acc[curr.lightningAddress].msatAmount += curr.msatAmount;
    acc[curr.lightningAddress].ids.push(curr.id);
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
  for (const [lightningAddress, { msatAmount, ids }] of Object.entries(
    groupedForwards
  )) {
    const internalId = `forward-${ids[0]}`;
    // Add sleep to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
    log.debug(
      `Processing payment for lightning address: ${lightningAddress} with msat amount: ${msatAmount}`
    );
    if ((msatAmount as number) >= MIN_FORWARD_AMOUNT) {
      // Send payment request to ZBD
      const request: LightningAddressPaymentRequest = {
        lnAddress: lightningAddress,
        amount: msatAmount.toString(),
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
