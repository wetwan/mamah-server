import { redis } from "../config/redis.js";

const ONLINE_TTL = 40; // seconds, matches heartbeat

export const markUserOnline = async (userId) => {
  await redis.set(`presence:${userId}`, "online", { EX: ONLINE_TTL });
};

export const refreshUserPresence = async (userId) => {
  await redis.expire(`presence:${userId}`, ONLINE_TTL);
};

export const markUserOffline = async (userId) => {
  await redis.del(`presence:${userId}`);
};

export const isUserOnline = async (userId) => {
  return (await redis.exists(`presence:${userId}`)) === 1;
};
