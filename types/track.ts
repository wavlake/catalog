import { Prisma } from "@prisma/client";

// https://www.prisma.io/blog/satisfies-operator-ur8ys8ccq7zb

// Types
export const trackInfo = {
  id: true,
  title: true,
  order: true,
  msat_total: true,
  duration: true,
  created_at: true,
  updated_at: true,
  artist: { select: { name: true, artwork_url: true, artist_url: true } },
  album: { select: { title: true, artwork_url: true, description: true } },
} satisfies Prisma.TrackSelect;

type TrackInfo = Prisma.TrackGetPayload<{ select: typeof trackInfo }>;

// Filters
export const { isPublic } = {
  isPublic: () => ({
    deleted: false,
  }),
} satisfies Record<string, (...args: any) => Prisma.TrackWhereInput>;
