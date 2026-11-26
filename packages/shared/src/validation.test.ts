import { describe, expect, it } from "vitest";
import {
  chatTextSchema,
  clientRoomMessageSchema,
  createRoomSchema,
  isReservedUsername,
  safeInternalPath,
  sanitizeText,
  usernameSchema,
} from "./index";

describe("username validation", () => {
  it("accepts latin and Georgian usernames", () => {
    expect(usernameSchema.parse("Giorgi_92")).toBe("Giorgi_92");
    expect(usernameSchema.parse("გიორგი")).toBe("გიორგი");
  });

  it.each(["ab", "a".repeat(21), "has space", "<script>", "x'; DROP TABLE users;--", "ab\u202Ecd", "აბ჻გ"])(
    "rejects %s",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(["Admin", "adm1n", "a_d_m_i_n", "SuperAdmin7", "Moderator", "system", "croco_official", "ადმინი", "bot_1", "Bot"])(
    "treats %s as reserved (impersonation protection)",
    (value) => {
      expect(isReservedUsername(value)).toBe(true);
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );

  it("does not over-block ordinary names", () => {
    expect(isReservedUsername("abbott_x")).toBe(false);
    expect(isReservedUsername("Nino")).toBe(false);
  });
});

describe("text sanitization", () => {
  it("removes control and bidi characters and collapses whitespace", () => {
    expect(sanitizeText("  hi\u0000\u202E there \n\n ok ")).toBe("hi there ok");
  });

  it("keeps emoji sequences joined with U+200D but removes a joiner anywhere else", () => {
    for (const emoji of ["🤷‍♂️", "❤️‍🔥", "👩‍💻", "🐻‍❄️", "🏳️‍🌈", "🙋🏽‍♀️"]) expect(sanitizeText(`gg ${emoji}`)).toBe(`gg ${emoji}`);
    expect(sanitizeText("ad\u200Dmin")).toBe("admin");
    expect(sanitizeText("😀\u200D")).toBe("😀");
    expect(sanitizeText("\u200D😀")).toBe("😀");
    expect(sanitizeText("a\u200B\u200Cb")).toBe("ab");
    expect(chatTextSchema.parse("🇬🇪 🃏 ♠️♥️♦️♣️")).toBe("🇬🇪 🃏 ♠️♥️♦️♣️");
  });

  it("keeps HTML as literal text (rendering is escaped by React)", () => {
    expect(chatTextSchema.parse("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
  });

  it("rejects empty and oversized chat messages", () => {
    expect(chatTextSchema.safeParse("   ").success).toBe(false);
    expect(chatTextSchema.safeParse("x".repeat(301)).success).toBe(false);
  });
});

describe("strict schemas (mass-assignment protection)", () => {
  it("rejects unexpected fields such as host or role on room creation", () => {
    const base = {
      gameType: "bura3",
      name: "Room",
      visibility: "public",
      maxPlayers: 2,
      allowSpectators: true,
      bots: 0,
      botDifficulty: "easy",
      turnSeconds: 30,
      autoStart: false,
      chatEnabled: true,
      allowInvites: true,
      gameConfig: {},
    };
    expect(createRoomSchema.safeParse(base).success).toBe(true);
    expect(createRoomSchema.safeParse({ ...base, hostId: "u_aaaaaaaaaaaaaaaa" }).success).toBe(false);
    expect(createRoomSchema.safeParse({ ...base, role: "admin" }).success).toBe(false);
  });

  it("rejects unknown WebSocket message types and extra fields", () => {
    expect(clientRoomMessageSchema.safeParse({ type: "ping", id: "abcdefgh" }).success).toBe(true);
    expect(clientRoomMessageSchema.safeParse({ type: "admin.grant", id: "abcdefgh" }).success).toBe(false);
    expect(clientRoomMessageSchema.safeParse({ type: "ping", id: "abcdefgh", seat: 2 }).success).toBe(false);
    expect(
      clientRoomMessageSchema.safeParse({ type: "game.action", id: "abcdefgh", rev: 1, action: {}, userId: "u_x" }).success,
    ).toBe(false);
  });
});

describe("safeInternalPath (open redirect protection)", () => {
  it.each([
    ["/rooms/bura3", "/rooms/bura3"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil", "/"],
    // eslint-disable-next-line no-script-url -- test payload
    ["javascript:alert(1)", "/"],
    [undefined, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeInternalPath(input)).toBe(expected);
  });
});

describe("client-side username pre-check", () => {
  it("agrees with the server schema", async () => {
    const { checkUsername } = await import("./username");
    const { usernameSchema } = await import("./validation");
    for (const name of ["gio_main", "ab", "x".repeat(21), "ადმინი", "Adm1n", "giorgi", "bad name", "botmaster", "abbott", "გიორგი_99", "a\u202Eb"]) {
      expect(checkUsername(name).ok, name).toBe(usernameSchema.safeParse(name).success);
    }
  });
});
