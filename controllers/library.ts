import asyncHandler from "express-async-handler";

const get_user_library = asyncHandler(async (req, res, next) => {
  const { id: userId } = req.params;

  res.json({ success: true, data: [] });
});

export default {
  get_user_library,
};
