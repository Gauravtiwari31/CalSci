declare module 'jstat' {
  interface Continuous {
    pdf(x: number, ...params: number[]): number;
    cdf(x: number, ...params: number[]): number;
    inv(p: number, ...params: number[]): number;
  }
  interface Discrete {
    pdf(k: number, ...params: number[]): number;
    cdf(k: number, ...params: number[]): number;
  }
  export const jStat: {
    normal: Continuous;
    studentt: Continuous;
    chisquare: Continuous;
    binomial: Discrete;
    poisson: Discrete;
    ibeta(x: number, a: number, b: number): number;
  };
}
