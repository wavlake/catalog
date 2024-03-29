export const testerOneId = "88dc2bed-0f94-405e-a979-f1589abf48f8";
export const testerTwoId = "a530e849-8c88-4280-a2bf-2098f6706f32";
export const testerThreeId = "fce0d4e6-cf73-4ac0-91db-baa93416321a";
export const testerOneArtistId = "c89be81f-886c-4d08-9aed-6dd7275d875a";
export const testerOneAlbumId = "670677a8-88b2-47d8-a533-67f5c69d4d7f";
export const testerOneTrackId = "7e2cc8d6-2bb4-4123-b463-0c6e6e3541a0";

export const testerOneMsatBalance = 10000;
export const testerTwoMsatBalance = 11000;
export const testerThreeMsatBalance = 10000;
// 4a3b269c-10e7-4041-9699-49350e5456d6
// 4c11c575-638b-4574-896c-2d47222c0576
// 7e8640aa-c5a4-4ea3-9a7f-1c75516b65cd
// cfe0ac16-10d4-4a51-aabe-b142811a9743

export const testerOneRecord = {
  id: testerOneId,
  name: "testerOne",
  msat_balance: testerOneMsatBalance,
};

export const testerTwoRecord = {
  id: testerTwoId,
  name: "testerTwo",
  msat_balance: testerTwoMsatBalance,
};

export const testerThreeRecord = {
  id: testerThreeId,
  name: "testerThree",
  msat_balance: testerThreeMsatBalance,
};

export const testerOneArtistRecord = {
  id: testerOneArtistId,
  user_id: testerOneId,
  name: "testerOneArtist",
  artist_url: "testeroneartist",
};

export const testerOneAlbumRecord = {
  id: testerOneAlbumId,
  artist_id: testerOneArtistId,
  title: "testerOneAlbum",
};

export const testerOneTrackRecord = {
  id: testerOneTrackId,
  artist_id: testerOneArtistId,
  album_id: testerOneAlbumId,
  title: "testerOneTrack",
  order: 1,
  live_url: "mock url",
  msat_total: 0,
};

export const splitRecord = {
  content_id: testerOneTrackId,
  content_type: "track",
};
