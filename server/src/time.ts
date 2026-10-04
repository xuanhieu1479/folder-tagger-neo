const pad = (n: number) => String(n).padStart(2, '0');

/** Local date as YYYY-MM-DD. */
export const dateStamp = (d = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local date and time as YYYY-MM-DD HH-mm-ss, safe for file names. */
export const fileStamp = (d = new Date()): string =>
  `${dateStamp(d)} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
