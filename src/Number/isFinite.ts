export const isFinite = (value: number): boolean => {
	return typeOf(value) === "number" && value === value && value !== math.huge && value !== -math.huge;
};
