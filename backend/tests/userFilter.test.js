"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const User = require("../src/modules/user/user.model");
const { API, createUserAndLogin, uniqueEmail } = require("./helpers");
const { ROLES, USER_STATUS } = require("../src/shared/constants");

const app = createApp();

async function seedUsers() {
  await User.create([
    {
      fullName: "Aisha Rahman",
      email: "aisha@filter.dev",
      password: "Passw0rd!",
      role: ROLES.CUSTOMER,
      status: USER_STATUS.ACTIVE,
      emailVerifiedAt: new Date(),
      createdAt: new Date("2026-01-10"),
    },
    {
      fullName: "Bilal Ahmed",
      email: "bilal@filter.dev",
      password: "Passw0rd!",
      role: ROLES.MODERATOR,
      status: USER_STATUS.SUSPENDED,
      createdAt: new Date("2026-03-15"),
    },
    {
      fullName: "Chowdhury Karim",
      email: "chow@filter.dev",
      password: "Passw0rd!",
      role: ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
      emailVerifiedAt: new Date(),
      createdAt: new Date("2026-06-01"),
    },
    {
      fullName: "Dina Sultana",
      email: "dina@filter.dev",
      password: "Passw0rd!",
      role: ROLES.CUSTOMER,
      status: USER_STATUS.DELETED,
      deletedAt: new Date(),
      createdAt: new Date("2026-07-20"),
    },
  ]);
}

async function filter(body, authHeader) {
  return request(app).post(`${API}/users/filter`).set("Authorization", authHeader).send(body);
}

describe("POST /users - access", () => {
  it.each([
    [ROLES.OWNER, 200],
    [ROLES.ADMIN, 200],
    [ROLES.MODERATOR, 403],
    [ROLES.CUSTOMER, 403],
  ])("%s -> %i", async (role, expected) => {
    const { authHeader } = await createUserAndLogin(app, { role });

    expect((await filter({}, authHeader)).status).toBe(expected);
  });
});

describe("POST /users - filtering", () => {
  let authHeader;

  beforeEach(async () => {
    ({ authHeader } = await createUserAndLogin(app, {
      role: ROLES.OWNER,
      email: uniqueEmail("filter-owner"),
    }));
    await seedUsers();
  });

  it("returns full user records, not a trimmed projection", async () => {
    const response = await filter({ search: "aisha" }, authHeader);

    const [user] = response.body.data.users;
    expect(user).toMatchObject({
      fullName: "Aisha Rahman",
      email: "aisha@filter.dev",
      role: ROLES.CUSTOMER,
      status: USER_STATUS.ACTIVE,
      fullName: "Aisha Rahman",
    });
    expect(typeof user.id).toBe("number");
    expect(user.createdAt).toEqual(expect.any(String));

    // ...but never the secrets.
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("sessions");
    expect(user).not.toHaveProperty("socialAccounts");
    expect(user).not.toHaveProperty("passwordResetTokenHash");
  });

  it("hides soft-deleted users by default", async () => {
    const response = await filter({}, authHeader);

    const emails = response.body.data.users.map((u) => u.email);
    expect(emails).not.toContain("dina@filter.dev");
  });

  it("includes them when asked", async () => {
    const response = await filter({ includeDeleted: true }, authHeader);

    expect(response.body.data.users.map((u) => u.email)).toContain("dina@filter.dev");
  });

  it("filters by a single role", async () => {
    const response = await filter({ role: ROLES.ADMIN }, authHeader);

    expect(response.body.data.users.map((u) => u.email)).toEqual(["chow@filter.dev"]);
  });

  it("filters by several roles at once", async () => {
    const response = await filter(
      { role: [ROLES.MODERATOR, ROLES.ADMIN], status: [USER_STATUS.ACTIVE, USER_STATUS.SUSPENDED] },
      authHeader
    );

    expect(response.body.data.users.map((u) => u.email).sort()).toEqual([
      "bilal@filter.dev",
      "chow@filter.dev",
    ]);
  });

  it("filters by status", async () => {
    const response = await filter({ status: USER_STATUS.SUSPENDED }, authHeader);

    expect(response.body.data.users.map((u) => u.email)).toEqual(["bilal@filter.dev"]);
  });

  it("filters by verified state", async () => {
    const response = await filter({ emailVerified: false }, authHeader);

    expect(response.body.data.users.map((u) => u.email)).toContain("bilal@filter.dev");
    expect(response.body.data.users.map((u) => u.email)).not.toContain("aisha@filter.dev");
  });

  it("searches across first name, last name and email", async () => {
    expect((await filter({ search: "Bilal" }, authHeader)).body.data.users).toHaveLength(1);
    expect((await filter({ search: "Sultana" }, authHeader)).body.data.users).toHaveLength(0); // deleted, hidden
    expect(
      (await filter({ search: "chow@filter" }, authHeader)).body.data.users
    ).toHaveLength(1);
  });

  it("treats regex metacharacters in search as literal text", async () => {
    // An unescaped user-supplied pattern is a ReDoS and a data-leak vector.
    const response = await filter({ search: ".*" }, authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.users).toHaveLength(0);
  });

  it("filters by creation date range", async () => {
    const response = await filter(
      { createdFrom: "2026-02-01", createdTo: "2026-06-30" },
      authHeader
    );

    expect(response.body.data.users.map((u) => u.email).sort()).toEqual([
      "bilal@filter.dev",
      "chow@filter.dev",
    ]);
  });

  it("rejects an inverted date range", async () => {
    const response = await filter(
      { createdFrom: "2026-06-01", createdTo: "2026-01-01" },
      authHeader
    );

    expect(response.status).toBe(422);
  });
});

describe("POST /users - pagination and sorting", () => {
  let authHeader;

  beforeEach(async () => {
    ({ authHeader } = await createUserAndLogin(app, {
      role: ROLES.OWNER,
      email: uniqueEmail("page-owner"),
    }));
    await seedUsers();
  });

  it("paginates with metadata, first page is 0", async () => {
    const response = await filter({ limit: 2, page: 0, includeDeleted: true }, authHeader);

    expect(response.body.data.users).toHaveLength(2);
    expect(response.body.meta).toMatchObject({
      page: 0,
      limit: 2,
      total: 5, // 4 seeded + the owner running the query
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: false,
    });
  });

  it("defaults to page 0 when none is given", async () => {
    const response = await filter({ limit: 2, includeDeleted: true }, authHeader);

    expect(response.body.meta.page).toBe(0);
    expect(response.body.meta.hasPrevPage).toBe(false);
  });

  it("reports no next page on the last one", async () => {
    // 5 rows at 2 per page -> pages 0, 1, 2. Page 2 is the last.
    const last = await filter({ limit: 2, page: 2, includeDeleted: true }, authHeader);

    expect(last.body.data.users).toHaveLength(1);
    expect(last.body.meta).toMatchObject({ hasNextPage: false, hasPrevPage: true });
  });

  it("rejects a negative page", async () => {
    expect((await filter({ page: -1 }, authHeader)).status).toBe(422);
  });

  it("returns the next page", async () => {
    const first = await filter({ limit: 2, page: 0, includeDeleted: true }, authHeader);
    const second = await filter({ limit: 2, page: 1, includeDeleted: true }, authHeader);

    const firstIds = first.body.data.users.map((u) => u.id);
    const secondIds = second.body.data.users.map((u) => u.id);

    expect(secondIds).toHaveLength(2);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
    expect(second.body.meta.hasPrevPage).toBe(true);
  });

  it("sorts ascending by a chosen field", async () => {
    const response = await filter(
      { sortBy: "fullName", sortOrder: "asc", limit: 100 },
      authHeader
    );

    const names = response.body.data.users.map((u) => u.fullName);
    expect(names).toEqual([...names].sort());
  });

  it("rejects sorting by a field not on the allow-list", async () => {
    const response = await filter({ sortBy: "password" }, authHeader);

    expect(response.status).toBe(422);
  });

  it("clamps an oversized limit", async () => {
    const response = await filter({ limit: 5000 }, authHeader);

    expect(response.status).toBe(422);
  });

  it("rejects unknown filter keys rather than ignoring them", async () => {
    const response = await filter({ isAdmin: true }, authHeader);

    expect(response.status).toBe(422);
  });
});
