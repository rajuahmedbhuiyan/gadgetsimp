"use strict";

const service = require("./dashboard.service");
const { sendResponse } = require("../../shared/sendResponse");

async function overview(req, res) {
  const dashboard = await service.getDashboard(req.validated.query);

  return sendResponse(res, {
    message: "Dashboard retrieved",
    data: { dashboard },
  });
}

module.exports = { overview };
