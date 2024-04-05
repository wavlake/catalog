export const urlFriendly = (name: string) => {
  const reg = /[\W ]{1,}/g;
  return name.replaceAll(reg, "-").toLowerCase();
};
