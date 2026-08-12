"use strict";

const service = require("./product.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");
const actor = (req) => ({ id: req.user.id, role: req.user.role });

async function create(req, res) {
  const product = await service.create(req.validated.body, actor(req));
  return sendResponse(res, { statusCode: 201, message: "Product created", data: { product } });
}

async function update(req, res) {
  const product = await service.update(req.validated.params.id, req.validated.body, actor(req));
  return sendResponse(res, { message: "Product updated", data: { product } });
}

async function getById(req, res) {
  const product = await service.getById(req.validated.params.id, { publicOnly: false });
  return sendResponse(res, { message: "Product retrieved", data: { product } });
}

async function list(req, res) {
  const result = await service.list(req.validated.body);
  return sendResponse(res, {
    message: "Products retrieved",
    data: { products: result.items },
    meta: paginationMeta(result),
  });
}

async function remove(req, res) {
  const deleted = await service.remove(req.validated.params.id, actor(req));
  return sendResponse(res, { message: "Product archived", data: { deleted } });
}

/**
 * One handler per editable panel of the admin product form.
 *
 * Built from a factory rather than written seven times: the only thing that
 * varies is the section name and the message, so seven hand-written copies
 * would be seven places for a divergence to hide.
 */
function patchSection(section, message) {
  return async function handler(req, res) {
    const product = await service.patchSection(
      req.validated.params.id,
      section,
      req.validated.body,
      actor(req)
    );

    return sendResponse(res, { message, data: { product } });
  };
}

const patchGeneral = patchSection("general", "General details updated");
const patchDescription = patchSection("description", "Description updated");
const patchPricing = patchSection("pricing", "Pricing updated");
const patchStock = patchSection("stock", "Stock updated");
const patchAttributes = patchSection("attributes", "Attributes and tags updated");
const patchMedia = patchSection("media", "Media updated");
const patchSeo = patchSection("seo", "SEO updated");
const patchFeatured = patchSection("featured", "Featured flag updated");
const patchStatus = patchSection("status", "Status updated");

module.exports = {
  create,
  update,
  getById,
  list,
  remove,
  patchGeneral,
  patchDescription,
  patchPricing,
  patchStock,
  patchAttributes,
  patchMedia,
  patchSeo,
  patchFeatured,
  patchStatus,
};
