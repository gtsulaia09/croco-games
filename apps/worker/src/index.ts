import { createApp } from "./http/app";
import { adminRoutes } from "./routes/admin";
import { chatRoutes } from "./routes/chat";
import { leaderboardRoutes } from "./routes/leaderboards";
import { meRoutes } from "./routes/me";
import { publicRoutes } from "./routes/public";
import { roomRoutes } from "./routes/rooms";
import { socialRoutes } from "./routes/social";

export { RoomDO } from "./room/RoomDO";
export { LobbyDO } from "./lobby/LobbyDO";
export { GameChatDO } from "./chat/GameChatDO";

const app = createApp();
app.route("/api", publicRoutes);
// Social routes first: "/users/search" must win over "/users/:id".
app.route("/api", socialRoutes);
app.route("/api", meRoutes);
app.route("/api", roomRoutes);
app.route("/api", chatRoutes);
app.route("/api", leaderboardRoutes);
app.route("/api", adminRoutes);

export default app;
