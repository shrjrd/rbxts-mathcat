//!native

export const isFinite = (value: number): boolean => {
    // biome-ignore lint/suspicious/noSelfCompare: in lua (NaN !== NaN) === true
    return typeOf(value) === 'number' && value === value && value !== math.huge && value !== -math.huge;
};
