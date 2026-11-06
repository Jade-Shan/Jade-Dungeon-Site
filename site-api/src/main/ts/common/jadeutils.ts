export const uuid = (): string => {
	// 长度为36的数组
	const s: string[] = [ ];
	const hexDigs = "0123456789abcdef";
	for(let i = 0; i < 36; i++) {
		s[i] = hexDigs.substr(Math.floor(Math.random() * 0x10), 1);
	}
	s[8] = s[13] = s[18] = s[23] = "-";
	//
	s[14] = "4";
	s[19] = hexDigs[(parseInt(s[19], 16) & 0x3) | 0x8];
	return s.join("");
};
