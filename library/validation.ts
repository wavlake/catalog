export const isValidDateString = (dateString: string) => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return false;
  }
  return true;
};
