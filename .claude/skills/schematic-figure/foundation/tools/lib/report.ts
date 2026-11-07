export interface Report {
  fail: string[];
  warn: string[];
  info: string[];
}

export function newReport(): Report {
  return { fail: [], warn: [], info: [] };
}

export function addFail(r: Report, m: string): void {
  r.fail.push(m);
}

export function addWarn(r: Report, m: string): void {
  r.warn.push(m);
}

export function addInfo(r: Report, m: string): void {
  r.info.push(m);
}

export function addSoft(r: Report, rep: boolean, m: string): void {
  if (rep) r.info.push(m);
  else r.warn.push(m);
}
