import type { Quat, Vec2, Vec3, Vec4 } from "./types";

const imul = (a: number, b: number): number => {
	a = a & 0xffffffff;
	b = b & 0xffffffff;
	const aLow = a & 0xffff;
	const aHigh = a >> 16;
	const bLow = b & 0xffff;
	const bHigh = b >> 16;

	const low = aLow * bLow;
	const mid = (aHigh * bLow + aLow * bHigh) << 16;
	const res = (low + mid) & 0xffffffff;

	return res >= 0x80000000 ? res - 0x100000000 : res;
};

/**
 * Creates a Mulberry32 seeded pseudo-random number generator.
 * Mulberry32 is a simple, fast, and effective PRNG that passes statistical tests
 * and has good distribution properties.
 *
 * @param seed The seed value (32-bit integer)
 * @returns A function that generates random numbers between 0 and 1
 */
export function createMulberry32Generator(seed: number): () => number {
	let a = seed;

	return () => {
		a += 0x6d2b79f5;
		let t = a;
		t = imul(t ^ (t >>> 15), t | 1);
		t ^= t + imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Generates a random seed value.
 * This is a 32-bit unsigned integer, suitable for use with the Mulberry32 PRNG.
 */
export function generateMulberry32Seed(): number {
	return (math.random() * 2 ** 32) >>> 0;
}

/**
 * Generates a random integer between min and max (inclusive).
 * @param min the minimum value (inclusive)
 * @param max the maximum value (inclusive)
 * @param randomFloat01 the random float in the range [0, 1) to use for randomness. Defaults to math.random().
 * @returns A random integer between min and max (inclusive).
 */
export function randomInt(min: number, max: number, randomFloat01: number = math.random()): number {
	return math.floor(randomFloat01 * (max - min + 1)) + min;
}

/**
 * Generates a random float between min and max.
 * @param min the minimum value (inclusive)
 * @param max the maximum value (inclusive)
 * @param randomFloat01 the random float in the range [0, 1) to use for randomness. Defaults to math.random().
 * @returns A random float between min and max.
 */
export function randomFloat(min: number, max: number, randomFloat01: number = math.random()): number {
	return randomFloat01 * (max - min) + min;
}

/**
 * Generates a random boolean with a given chance of being true.
 * @param chance The probability of returning true (between 0 and 1). Defaults to 0.5.
 * @param randomFloat01 the random float in the range [0, 1) to use for randomness. Defaults to math.random().
 * @returns A boolean value based on the chance.
 */
export function randomBool(chance = 0.5, randomFloat01: number = math.random()): boolean {
	return randomFloat01 < chance;
}

/**
 * Generates a random sign, either 1 or -1, based on a given chance.
 * @param plusChance The probability of returning 1 (between 0 and 1). Defaults to 0.5.
 * @param randomFloat01 the random float in the range [0, 1) to use for randomness. Defaults to math.random().
 * @returns A random sign, either 1 or -1.
 */
export function randomSign(plusChance = 0.5, randomFloat01: number = math.random()) {
	const plus = randomBool(plusChance, randomFloat01);

	return plus ? 1 : -1;
}

/**
 * Chooses a random item from an array.
 * @param items The array of items to choose from.
 * @param randomFloat01 the random float in the range [0, 1) to use for randomness. Defaults to math.random().
 * @returns A randomly chosen item from the array.
 * @throws Error if the array is empty.
 */
export function randomChoice<T>(items: T[], randomFloat01: number = math.random()): T {
	if (items.size() === 0) {
		throw "Cannot choose from an empty array";
	}
	const index = math.floor(randomFloat01 * items.size());
	return items[index % items.size()];
}

/**
 * Generates a random Vec2 with a scale of 1
 *
 * @param out the receiving vector
 * @param randomFn Function to generate random numbers, defaults to math.random
 * @returns out
 */
export function randomVec2(out: Vec2 = [0, 0], randomFn: () => number = math.random): Vec2 {
	const r = randomFn() * 2.0 * math.pi;
	out[0] = math.cos(r);
	out[1] = math.sin(r);
	return out;
}

/**
 * Generates a random Vec3 with a scale of 1
 *
 * @param out the receiving vector
 * @param randomFn Function to generate random numbers, defaults to math.random
 * @returns out
 */
export function randomVec3(out: Vec3 = [0, 0, 0], randomFn: () => number = math.random): Vec3 {
	const r = randomFn() * 2.0 * math.pi;
	const z = randomFn() * 2.0 - 1.0;
	const zScale = math.sqrt(1.0 - z * z);

	out[0] = math.cos(r) * zScale;
	out[1] = math.sin(r) * zScale;
	out[2] = z;
	return out;
}

/**
 * Generates a random Vec4 with a scale of 1
 *
 * @param out the receiving vector
 * @param randomFn Function to generate random numbers, defaults to math.random
 * @returns out
 */
export function randomVec4(out: Vec4 = [0, 0, 0, 0], randomFn: () => number = math.random): Vec4 {
	// Marsaglia, George. Choosing a Point from the Surface of a
	// Sphere. Ann. math. Statist. 43 (1972), no. 2, 645--646.
	// http://projecteuclid.org/euclid.aoms/1177692644;
	let rand = randomFn();
	const v1 = rand * 2 - 1;
	const v2 = (4 * randomFn() - 2) * math.sqrt(rand * -rand + rand);
	const s1 = v1 * v1 + v2 * v2;

	rand = randomFn();
	const v3 = rand * 2 - 1;
	const v4 = (4 * randomFn() - 2) * math.sqrt(rand * -rand + rand);
	const s2 = v3 * v3 + v4 * v4;

	const d = math.sqrt((1 - s1) / s2);
	out[0] = v1;
	out[1] = v2;
	out[2] = v3 * d;
	out[3] = v4 * d;
	return out;
}

/**
 * Generates a random unit quaternion
 *
 * @param out the receiving quaternion
 * @returns out
 */
export function randomQuat(out: Quat = [0, 0, 0, 0], randomFn: () => number = math.random): Quat {
	// Implementation of http://planning.cs.uiuc.edu/node198.html
	// TODO: Calling random 3 times is probably not the fastest solution
	const u1 = randomFn();
	const u2 = randomFn();
	const u3 = randomFn();

	const sqrt1MinusU1 = math.sqrt(1 - u1);
	const sqrtU1 = math.sqrt(u1);

	out[0] = sqrt1MinusU1 * math.sin(2.0 * math.pi * u2);
	out[1] = sqrt1MinusU1 * math.cos(2.0 * math.pi * u2);
	out[2] = sqrtU1 * math.sin(2.0 * math.pi * u3);
	out[3] = sqrtU1 * math.cos(2.0 * math.pi * u3);
	return out;
}
