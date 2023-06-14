function urlFriendly(name) {
  const reg = /[\W ]{1,}/g;
  return name.replaceAll(reg, "-").toLowerCase();
}

module.exports = {
  urlFriendly,
};
