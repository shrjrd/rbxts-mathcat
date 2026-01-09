export const exp = (t: number) => 1 / (1 + t + 0.48 * t * t + 0.235 * t * t * t);

export const linear = (t: number) => t;

export const sineIn = (x: number) => 1 - math.cos((x * math.pi) / 2);
export const sineOut = (x: number) => math.sin((x * math.pi) / 2);
export const sineInOut = (x: number) => -(math.cos(math.pi * x) - 1) / 2;

export const cubicIn = (x: number) => x * x * x;
export const cubicOut = (x: number) => 1 - (1 - x) ** 3;
export const cubicInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

export const quintIn = (x: number) => x ** 5;
export const quintOut = (x: number) => 1 - (1 - x) ** 5;
export const quintInOut = (x: number) => (x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2);

export const circIn = (x: number) => 1 - math.sqrt(1 - x * x);
export const circOut = (x: number) => math.sqrt(1 - (x - 1) * (x - 1));
export const circInOut = (x: number) =>
	x < 0.5 ? (1 - math.sqrt(1 - 2 * x * (2 * x))) / 2 : (math.sqrt(1 - (-2 * x + 2) * (-2 * x + 2)) + 1) / 2;

export const quartIn = (t: number) => t * t * t * t;
export const quartOut = (t: number) => 1 - --t * t * t * t;
export const quartInOut = (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t);

export const expoIn = (x: number) => (x === 0 ? 0 : 2 ** (10 * x - 10));
export const expoOut = (x: number) => (x === 1 ? 1 : 1 - 2 ** (-10 * x));
export const expoInOut = (x: number) =>
	x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2;

export const rsqw = (t: number, delta = 0.01, a = 1, f = 1 / (2 * math.pi)) =>
	(a / math.atan(1 / delta)) * math.atan(math.sin(2 * math.pi * t * f) / delta);
