"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const User = require("../src/modules/user/user.model");
const { API, createUserAndLogin } = require("./helpers");
const {
  ROLES,
  roleAtLeast,
  assignableRoles,
  USER_STATUS,
} = require("../src/shared/constants");

const app = createApp();

describe("role hierarchy", () => {
  it("ranks roles so permissions accumulate upwards", () => {
    expect(roleAtLeast(ROLES.OWNER, ROLES.ADMIN)).toBe(true);
    expect(roleAtLeast(ROLES.ADMIN, ROLES.MODERATOR)).toBe(true);
    expect(roleAtLeast(ROLES.MODERATOR, ROLES.CUSTOMER)).toBe(true);

    expect(roleAtLeast(ROLES.CUSTOMER, ROLES.MODERATOR)).toBe(false);
    expect(roleAtLeast(ROLES.MODERATOR, ROLES.ADMIN)).toBe(false);
    expect(roleAtLeast(ROLES.ADMIN, ROLES.OWNER)).toBe(false);
  });

  it("lets an actor assign only roles below their own", () => {
    expect(assignableRoles(ROLES.OWNER)).toEqual([
      ROLES.CUSTOMER,
      ROLES.MODERATOR,
      ROLES.ADMIN,
    ]);
    expect(assignableRoles(ROLES.ADMIN)).toEqual([ROLES.CUSTOMER, ROLES.MODERATOR]);
    expect(assignableRoles(ROLES.MODERATOR)).toEqual([ROLES.CUSTOMER]);
    expect(assignableRoles(ROLES.CUSTOMER)).toEqual([]);
  });
});

describe("authorize() admits seniors", () => {
  // POST /users (the filter endpoint) requires ROLE_ADMIN, so an owner passes
  // it without being named, and a moderator does not.
  it.each([
    [ROLES.ADMIN, 200],
    [ROLES.OWNER, 200],
    [ROLES.MODERATOR, 403],
    [ROLES.CUSTOMER, 403],
  ])("%s -> %i on the user list", async (role, expected) => {
    const { authHeader } = await createUserAndLogin(app, { role });

    const response = await request(app).post(`${API}/users/filter`).set("Authorization", authHeader).send({});

    expect(response.status).toBe(expected);
  });

  it("blocks a moderator from admin-only writes", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.MODERATOR });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .patch(`${API}/users/${target.id}/role`)
      .set("Authorization", authHeader)
      .send({ role: ROLES.MODERATOR });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("INSUFFICIENT_ROLE");
  });
});

describe("PATCH /users/:id/role", () => {
  it("lets an admin promote a customer to moderator", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .patch(`${API}/users/${target.id}/role`)
      .set("Authorization", authHeader)
      .send({ role: ROLES.MODERATOR });

    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe(ROLES.MODERATOR);
  });

  it("refuses to grant a role equal to the actor's own", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    // An admin minting another admin is how a single compromised admin
    // account becomes permanent, unrevokable access.
    const response = await request(app)
      .patch(`${API}/users/${target.id}/role`)
      .set("Authorization", authHeader)
      .send({ role: ROLES.ADMIN });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ROLE_ABOVE_ACTOR");
  });

  it("refuses to grant a role above the actor's own", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .patch(`${API}/users/${target.id}/role`)
      .set("Authorization", authHeader)
      .send({ role: ROLES.OWNER });

    expect(response.status).toBe(403);
  });

  it("lets an owner mint an admin", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.OWNER });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .patch(`${API}/users/${target.id}/role`)
      .set("Authorization", authHeader)
      .send({ role: ROLES.ADMIN });

    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe(ROLES.ADMIN);
  });

  it("refuses to modify a user of equal rank", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const peer = await createUserAndLogin(app, { role: ROLES.ADMIN });

    const response = await request(app)
      .patch(`${API}/users/${peer.id}/role`)
      .set("Authorization", authHeader)
      .send({ role: ROLES.CUSTOMER });

    expect(response.status).toBe(403);
  });

  it("refuses self-promotion", async () => {
    const actor = await createUserAndLogin(app, { role: ROLES.ADMIN });

    const response = await request(app)
      .patch(`${API}/users/${actor.id}/role`)
      .set("Authorization", actor.authHeader)
      .send({ role: ROLES.CUSTOMER });

    expect(response.status).toBe(400);
  });

  it("refuses to demote the last owner", async () => {
    const owner = await createUserAndLogin(app, { role: ROLES.OWNER });
    const secondOwner = await createUserAndLogin(app, { role: ROLES.OWNER });

    // The second owner is the only one who outranks nobody else here, so use
    // them as the actor to demote the first.
    const response = await request(app)
      .patch(`${API}/users/${owner.id}/role`)
      .set("Authorization", secondOwner.authHeader)
      .send({ role: ROLES.ADMIN });

    // Equal rank - blocked before the last-owner rule is even reached.
    expect(response.status).toBe(403);
  });

  it("forces re-authentication after a role change", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    await request(app)
      .patch(`${API}/users/${target.id}/role`)
      .set("Authorization", authHeader)
      .send({ role: ROLES.MODERATOR });

    // The target's existing token must stop working immediately, rather than
    // carrying the stale role until it happens to expire.
    const stale = await request(app)
      .get(`${API}/auth/me`)
      .set("Authorization", target.authHeader);

    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe("TOKEN_REVOKED");
  });
});

describe("PATCH /users/:id/status", () => {
  it("deactivates an account and kills its sessions", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const target = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .patch(`${API}/users/${target.id}/status`)
      .set("Authorization", authHeader)
      .send({ status: USER_STATUS.SUSPENDED });

    expect(response.status).toBe(200);

    const stored = await User.findById(target.id).select("+sessions");
    expect(stored.sessions).toHaveLength(0);
  });

  it("refuses to deactivate a peer", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const peer = await createUserAndLogin(app, { role: ROLES.ADMIN });

    const response = await request(app)
      .patch(`${API}/users/${peer.id}/status`)
      .set("Authorization", authHeader)
      .send({ status: USER_STATUS.SUSPENDED });

    expect(response.status).toBe(403);
  });
});

describe("GET /users/:id ownership", () => {
  it("lets a customer read their own record", async () => {
    const actor = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .get(`${API}/users/${actor.id}`)
      .set("Authorization", actor.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(actor.id);
  });

  it("hides another customer's record behind a 404, not a 403", async () => {
    const actor = await createUserAndLogin(app, { role: ROLES.CUSTOMER });
    const other = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .get(`${API}/users/${other.id}`)
      .set("Authorization", actor.authHeader);

    // Sequential integer ids make enumeration trivial, so the response must
    // not confirm that the neighbouring id exists.
    expect(response.status).toBe(404);
  });

  it("lets a moderator read anyone's record", async () => {
    const staff = await createUserAndLogin(app, { role: ROLES.MODERATOR });
    const other = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .get(`${API}/users/${other.id}`)
      .set("Authorization", staff.authHeader);

    expect(response.status).toBe(200);
  });

  it("rejects a non-numeric id at the edge", async () => {
    const staff = await createUserAndLogin(app, { role: ROLES.ADMIN });

    const response = await request(app)
      .get(`${API}/users/not-a-number`)
      .set("Authorization", staff.authHeader);

    expect(response.status).toBe(422);
  });
});
