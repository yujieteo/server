export class Each<T> {
  private readonly list: T[];
  private at = 0;

  constructor(list: T[]) {
    this.list = list;
  }

  [Symbol.asyncIterator](): this {
    return this;
  }

  next(): Promise<IteratorResult<T, undefined>> {
    const value = this.list[this.at];
    if (this.at >= this.list.length || value === undefined) return Promise.resolve({ done: true, value: undefined });
    this.at++;
    return Promise.resolve({ done: false, value });
  }
}
