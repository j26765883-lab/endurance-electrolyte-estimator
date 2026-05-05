// src/utils.js
export const getParam = (searchString, key, defaultVal) => {
  const val = new URLSearchParams(searchString).get(key);
  return val !== null ? val : defaultVal;
};