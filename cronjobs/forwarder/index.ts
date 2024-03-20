const run = async () => {
  console.log("Hello, World");
  // Check the forward table for any records with a status of in_flight = false and is_settled = false
  // If there are any, group the payments by lightning_address and sum msat_amount
  // For each group where the sum is greater than or equal to the minimum_forward_amount, initiate a payment
  // Update every record in each group with the external transaction id returned from the payment request
  // If the payment fails, update the record with the error message
  // DONE
};

run();
