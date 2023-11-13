import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import { formatError } from "../library/errors";

const get_connections = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];

  const connections = await prisma.walletConnection.findMany({
    where: { userId },
  });

  try {
    res.send({
      success: true,
      data: connections,
    });
  } catch (err) {
    next(err);
  }
});

const create_connection = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const { pubkey, name, requestMethods } = req.body;

  if (!pubkey || !name || !requestMethods) {
    const error = formatError(400, "pubkey, name, and requestMethods required");
    next(error);
  }

  const newConnection = await prisma.walletConnection.create({
    data: {
      pubkey,
      userId,
      name,
      pay_invoice: requestMethods.includes("pay_invoice"),
      get_balance: requestMethods.includes("get_balance"),
    },
  });

  try {
    res.send({
      success: true,
      data: {
        connection: newConnection,
      },
    });
  } catch (err) {
    next(err);
  }
});

const delete_connection = asyncHandler(async (req, res, next) => {
  try {
    const userId = req["uid"];
    const { pubkey } = req.params;

    if (!pubkey) {
      const error = formatError(400, "pubkey param is required");
      next(error);
    }

    if (!userId) {
      const error = formatError(400, "userId is required");
      next(error);
    }
    const connection = await prisma.walletConnection.findFirst({
      where: { AND: [{ userId }, { pubkey }] },
    });

    if (!connection) {
      const error = formatError(404, "Connection not found");
      next(error);
    }

    await prisma.walletConnection.delete({
      where: { pubkey: connection.pubkey },
    });

    res.send({
      success: true,
    });
  } catch (err) {
    next(err);
  }
});

export default { get_connections, create_connection, delete_connection };
