"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const User = require("../src/modules/user/user.model");
const { API, createUserAndLogin, uniqueEmail } = require("./helpers");
const { ROLES, USER_STATUS } = require("../src/shared/constants");

const app = createApp();

describe("DELETE /users/:id - soft delete", () => {
  it("flags the account DELETED but keeps the row", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .delete(`${API}/users/${target.id}`)
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.user.status).toBe(USER_STATUS.DELETED);

    // The row survives, because orders and audit trails reference it.
    const stored = await User.findById(target.id);
    expect(stored).not.toBeNull();
    expect(stored.deletedAt).toEqual(expect.any(Date));
  });

  it("signs the user out immediately", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    await request(app).delete(`${API}/users/${target.id}`).set("Authorization", authHeader);

    const stale = await request(app)
      .get(`${API}/auth/me`)
      .set("Authorization", target.authHeader);

    // 403, not 401: the token is well-formed, but the account is gone, so
    // telling the client to re-authenticate would be misleading. Same
    // treatment a suspended account gets.
    expect(stale.status).toBe(403);
    expect(stale.body.code).toBe("ACCOUNT_DISABLED");
    expect(stale.body.message).toMatch(/no longer exists/i);
  });

  it("stops the account signing back in", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    await request(app).delete(`${API}/users/${target.id}`).set("Authorization", authHeader);

    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: target.email, password: target.password });

    expect(login.status).toBe(403);
    expect(login.body.code).toBe("ACCOUNT_DISABLED");
  });

  it("keeps the email claimed so nobody inherits the address", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    await request(app).delete(`${API}/users/${target.id}`).set("Authorization", authHeader);

    const owner = await createUserAndLogin(app, { role: ROLES.OWNER });
    const recreate = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", owner.authHeader)
      .send({
        fullName: "Someone Else",
        email: target.email,
        password: "Str0ngPass",
      });

    expect(recreate.status).toBe(409);
  });

  it("is reversible by setting the status back to ACTIVE", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    await request(app).delete(`${API}/users/${target.id}`).set("Authorization", authHeader);

    const restored = await request(app)
      .patch(`${API}/users/${target.id}/status`)
      .set("Authorization", authHeader)
      .send({ status: USER_STATUS.ACTIVE });

    expect(restored.status).toBe(200);
    expect(restored.body.data.user.status).toBe(USER_STATUS.ACTIVE);
    // The deletion stamp is cleared, so the record does not keep claiming it
    // was removed.
    expect(restored.body.data.user.deletedAt).toBeNull();

    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: target.email, password: target.password });
    expect(login.status).toBe(200);
  });

  it("refuses to delete twice", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    await request(app).delete(`${API}/users/${target.id}`).set("Authorization", authHeader);
    const again = await request(app)
      .delete(`${API}/users/${target.id}`)
      .set("Authorization", authHeader);

    expect(again.status).toBe(409);
  });

  it.each([
    [ROLES.OWNER, 200],
    [ROLES.ADMIN, 200],
    [ROLES.MODERATOR, 403],
    [ROLES.CUSTOMER, 403],
  ])("%s -> %i", async (role, expected) => {
    const { authHeader } = await createUserAndLogin(app, { role });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .delete(`${API}/users/${target.id}`)
      .set("Authorization", authHeader);

    expect(response.status).toBe(expected);
  });

  it("refuses to delete yourself", async () => {
    const actor = await createUserAndLogin(app, { role: ROLES.ADMIN });

    const response = await request(app)
      .delete(`${API}/users/${actor.id}`)
      .set("Authorization", actor.authHeader);

    expect(response.status).toBe(400);
  });

  it("refuses to delete a peer", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const peer = await createUserAndLogin(app, { role: ROLES.ADMIN });

    const response = await request(app)
      .delete(`${API}/users/${peer.id}`)
      .set("Authorization", authHeader);

    expect(response.status).toBe(403);
  });
});

describe("DELETE /users/:id/permanent - hard delete", () => {
  it("removes the document outright", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.OWNER });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .delete(`${API}/users/${target.id}/permanent`)
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.deleted).toMatchObject({ id: target.id, email: target.email });

    expect(await User.findById(target.id)).toBeNull();
  });

  it("frees the email address for reuse", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.OWNER });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    await request(app)
      .delete(`${API}/users/${target.id}/permanent`)
      .set("Authorization", authHeader);

    // Unlike the soft delete, nothing holds the unique index any more.
    const recreate = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", authHeader)
      .send({
        fullName: "Brand New",
        email: target.email,
        password: "Str0ngPass",
      });

    expect(recreate.status).toBe(201);
  });

  it.each([
    [ROLES.OWNER, 200],
    [ROLES.ADMIN, 403],
    [ROLES.MODERATOR, 403],
    [ROLES.CUSTOMER, 403],
  ])("%s -> %i (owner only, unlike the soft delete)", async (role, expected) => {
    const { authHeader } = await createUserAndLogin(app, { role });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .delete(`${API}/users/${target.id}/permanent`)
      .set("Authorization", authHeader);

    expect(response.status).toBe(expected);
  });

  it("refuses to delete yourself", async () => {
    const actor = await createUserAndLogin(app, { role: ROLES.OWNER });

    const response = await request(app)
      .delete(`${API}/users/${actor.id}/permanent`)
      .set("Authorization", actor.authHeader);

    expect(response.status).toBe(400);
  });

  it("404s for an id that does not exist", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.OWNER });

    const response = await request(app)
      .delete(`${API}/users/999999/permanent`)
      .set("Authorization", authHeader);

    expect(response.status).toBe(404);
  });
});

describe("PATCH /users/me - image field", () => {
  it("accepts `image` and rejects the old `avatarUrl`", async () => {
    const { authHeader } = await createUserAndLogin(app);

    const ok = await request(app)
      .patch(`${API}/users/me`)
      .set("Authorization", authHeader)
      .send({ image: "https://cdn.gadgetsimp.dev/me.jpg" });

    expect(ok.status).toBe(200);
    expect(ok.body.data.user.image).toBe("https://cdn.gadgetsimp.dev/me.jpg");
    expect(ok.body.data.user).not.toHaveProperty("avatarUrl");

    // `.strict()` rejects the retired name rather than silently dropping it.
    const stale = await request(app)
      .patch(`${API}/users/me`)
      .set("Authorization", authHeader)
      .send({ avatarUrl: "https://cdn.gadgetsimp.dev/old.jpg" });

    expect(stale.status).toBe(422);
  });

  it("rejects a non-URL image", async () => {
    const { authHeader } = await createUserAndLogin(app);

    const response = await request(app)
      .patch(`${API}/users/me`)
      .set("Authorization", authHeader)
      .send({ image: "not-a-url" });

    expect(response.status).toBe(422);
  });

  it("still refuses privileged fields", async () => {
    const { authHeader } = await createUserAndLogin(app);

    for (const body of [{ role: ROLES.ADMIN }, { status: USER_STATUS.ACTIVE }, { email: "x@y.dev" }]) {
      const response = await request(app)
        .patch(`${API}/users/me`)
        .set("Authorization", authHeader)
        .send(body);

      expect(response.status).toBe(422);
    }
  });
});
