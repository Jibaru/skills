import Redis from "ioredis";

const redis = new Redis({
  host: process.env.CACHE_ENDPOINT,
  port: 6379,
  connectTimeout: 1000,
  commandTimeout: 500,
  maxRetriesPerRequest: 2,
});

export interface Profile {
  userId: string;
  displayName: string;
  avatarUrl: string;
}

async function loadProfile(userId: string): Promise<Profile> {
  const res = await fetch(`${process.env.PROFILE_API_URL}/users/${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`profile api returned ${res.status}`);
  return (await res.json()) as Profile;
}

export async function getProfile(userId: string): Promise<Profile> {
  const key = `profile:${userId}`;
  const cached = await redis.get(key).catch(() => null);
  if (cached) return JSON.parse(cached) as Profile;

  const profile = await loadProfile(userId);
  await redis.set(key, JSON.stringify(profile));
  return profile;
}
