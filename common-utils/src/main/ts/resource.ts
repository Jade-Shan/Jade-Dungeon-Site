/**
 * 内置的窗口 UI 资源：3 组 ×5 尺寸图标 + 1 张桌面背景
 *
 * **这个文件约 310 行是 base64 数据，是整个包体积的大头（27 KB）。**
 * 所以它是 opt-in 的：`UIWindow.ts` 不再 import 本文件，而是通过
 * [ui/uiResource.ts](ui/uiResource.ts) 的注册表取资源。想用这套内置图标就显式注册：
 *
 * ```typescript
 * import { registerDefaultUIResource } from '@jade-dungeon/jade-utils/resource';
 * registerDefaultUIResource();   // 不调用的话窗口就没图标、桌面就没背景图
 * ```
 *
 * 不 import 本文件的使用方不会下载这 27 KB。
 * 拆包之后本文件会成为独立的可选包 `@jade-dungeon/window-ui-icons`。
 */
import { SimpleMap } from "./dataStructure.js";
import { IconSize, IBase64Img, Base64ImgType } from "./web.js";
import {
	IconGroup, IUIResourceProvider, pickIconSize, registerUIResourceProvider,
} from "./ui/uiResource.js";

/** 默认图标组枚举 */
export enum DefaultIconGroup { ELEC_FACE, ELEC_BUG, CAMERA };

// `IconGroup` 的定义已挪到 ui/uiResource.ts（库层的资源契约）。
// 这里再导出一次，保持 `import { IconGroup } from '.../resource'` 继续可用
export type { IconGroup };

/** 默认图标组：ELEC_FACE（电子脸） */
const iconDefault01: IconGroup = {
	x12: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAA+ElEQVR4AYXBTWoacRwA0PfXCVgr" +
			"uAlEm4CLGqg3aFaC21ygyxRym1yh0Fwi24LQM7RZuJiAqItCG79SIuVXOxCwk5C8lxC9j0m771mT" +
			"IdefQ8VWu+9Fb/oKmR1fzsJegz+/Fao1NksGl8mDipJ6i2qNao16yyOZknorORwo/PzG7SjsypRM" +
			"v4ZFnvyzHIeyzI7BZfK/pKxiazpEIBAIBAKBYDpUyJpdImge8/2TJ/XOmQxpdknvzlLcjni1z3rG" +
			"eqZQrXHwXuH+F3c/aHap2FqNefuB10fM8zDPwyIPi5xFzjxnNVbIbJ1csFnSOaVzmjxlr8HNFX8B" +
			"lm9P9V1lg8gAAAAASUVORK5CYII="
	},
	x16: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABP0lEQVR4AaXBsUsCYRjA4d8bn4tg" +
			"GDiIkBgE51JYtDUoQuRWY025tmRbDQ0FDbXZX2BCQ6tLEEXcUFNSYtNFgxE6GUhON33dOdhFnCf0" +
			"PALoSAqWDoTJWcby9Qb1Y02/BQpHuii8XkAix1g6JqSLwuOhRuExsw4Pu4y0XIaOyZDCw+5B29S4" +
			"Yhmh29C4Yhmh29C47J7gNYGPZIGhZAFfE/yTwsf7FayZgut+B18KH59NTS1HIIVH1IB8RRglavCL" +
			"wmH3IBSB200CWVUIRcDuMaBwNMuaxX1hrgQf14w0vQovZ/B0onGpqbSwsMcPTaCoAfmK8HwKKhwH" +
			"BKxzsKoEsqoMGEUIx0Hh6LegbWq2tWBV4a6o8Vq5FMJxhmo5TSInuBQe9SPoNvjjZkPjR+EwtiCR" +
			"FVyJLMyXhCCRFHRM+Ab+u1hNoKslIAAAAABJRU5ErkJggg=="
	},
	x24: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAB50lEQVR4Aa3BMWsTYRzA4d8/vDX0" +
			"mmLEIVdSpIhwcRG7lXpDLMRVBAeHQg/8Ag5CHQUXhQ76AcR0slvqLBwRijioDS4mW4WmXqAhgvHQ" +
			"FvpqwyXENMp7SZ9HAE1kqSg4K4yltg6+p+lSRAobQt2H9w8Zy+wNKGwIr+9ojikilg1HB5DOwfwq" +
			"I9l+AkcHYNn0KAZYNlgzsP2YWOYfgGVzgmKIMIBqUROH4wnDJDCQWRCSaXqSacgsCCYSGFhcg3RO" +
			"6ErnhMU1jCgMlFxNv8Y7TcnFSAIDyztCNi90ZfPC8o5gQmFg04Vrz+D6C+HY/kfYdDGiMNDe1Xx4" +
			"JCTTdPz6Bu1djQmFof2KZhSKIawM5DwhDivDUIoBYQBhAxyPWMIGhAFYNn9RRMIAEmegVQXfY2Sp" +
			"CxAG9AigiSwVBWeFsdTWwfc0XYo+vqfZKwuOB6/ymjhuloVaEapFTT8B9K0tYSpLx0QKJlIQBsRi" +
			"2XDYhsM2HT/qUHI1ij+mZuHTU2hWOBXnr8KVe3QoIs0K1MuaGVe4fBd+NuHtfc0w53LC/ConfH4O" +
			"X7c0IHQlGHD2EjgeXLzN/wkggAACCEMpBoQB7L2BMOCfWlWN72FEEZm0YXpOaFXB9+iYnhNGMWnT" +
			"o4gUXnKqvn+h4zeotIf8bZW5ygAAAABJRU5ErkJggg=="
	},
	x32: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACLElEQVR4AcXBz0uTcRzA8fdnfSqR" +
			"Rh4ERdMtCrKbgkJS0CYEgw516OAhaIP+hA7eXLcO/gnBFhh0rNtAcApKgUEeBCd0mMNfgYo1q1XT" +
			"bzaaPNM9D3zdnK+XAAaHnqgQTnAq0jHIJA1OAhj+G4gLjTAXN5QpDv2jsPQKJqOG0zCUFG48gbk4" +
			"hxQXj7OCP0Bd5JdhPGioRvHw9TNszFKT9tvgO48rxcPGLExGDbUYSgodIVz5OGM+LF17JHRHhKO6" +
			"I0J3RLClWBocg3wWcikq9I1QkkthRbH09g7sFzlmYpgT8WGp7Ra09nJMay+09mJNsTQ4Bvks5FJU" +
			"6BuhJJfCimJpYhguX4cHacFp8SVsL2BNsfTlg2GvICBU2F6AzXmDLeUENucN70LUhY8zpnhoboPO" +
			"kFCL5jY8KR66ItAVoWb5ZVwpLiaGQZuoi2IBV4rD2jQUtqAzJNSTNkFnSChswdo0FQQwOPREhXCC" +
			"U5GOQSZpcFKOWJ8xpGPC4BjsZGDxJTW5+RRaeuD9M1ifMRylHLjYAhdahH/2i7A6BXs/4cc6rE5R" +
			"k8B98AdgdYoDgj9Iye8dw68dEMAMxIX+URrq43OYixsUh3SMhggnOKQ4ZJKGsktXBFFKvq8Y9ot4" +
			"am4XzjVRlSnC7oqhLJwQyhQXD2fAH6Dk9VXhW9bg5d4b6LhLVfllGA9SlVInn17AUpKq/uziSqmT" +
			"XMpwEoqL8aChERSHgbjQaIpD/ygN9xfxbZ730SvjHwAAAABJRU5ErkJggg=="
	},
	x48: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAACzUlEQVR4AdXBz0uTYQDA8e/z9oyG" +
			"bDlUUGfLScHWIfpBh0zB2Wk3O3QrcEF/gAehbnU0MugPCJxgNwns5MkfMLFDmZ3awOUPUhe4mE6m" +
			"YvaUEZLzrb2DZ+N9Px8BKEycCQruLmILr9pga0lhxsDhJEXORQVXH8LeN3jTjS20Pwd3neDDU1gZ" +
			"V/xNUqSmCfwRyC/D6pTCDrrjAm8rpIY5QWLB+TsCl4eq2t+G9KiiFIkF7YPgbaWq8suQHqUkSRl2" +
			"s7C/TUW5POCuxzJJGWb7IRlXVFI4JugewjIDhzNwOAOHk2hy7ZHAF4L1Gfj0UmHm4gNBcwfkUjA3" +
			"oNDBQJNAFEIxaO7kn5o7IRSDQBRtJJpk5/ktl+SfcklYm4bsPNpINEn0KUqZG1DMDaCVgcNJNOmZ" +
			"Evi7IDUMEzGFmVtxQagX1qZhLKLQwcDhJJrM9MFpH9Rdgp5JgZnPryEVh70c2kg02ZhXHPIGBf4I" +
			"plLDsDql0Emi2eYCpIYxtbmAdhLN1hOK9QRVY+BwBg5n4HCSMrQ/g+uPBZXk8lAWSRncDeBuwFYk" +
			"Fsz2g8tDVe1vY4nEgvSowq4kRQoZWJuGvSy0RAR2sPEe8ktQyHCCpMjKuGJlHM4EBXcXsYVXbbC1" +
			"pDBj4HACUJRwb0ngbYXJ+5CMKyopHBN0D0F+GUaCilIMHE4Ail86XwjqL2Oq8QacckMuCYUMFVXT" +
			"BL4wHOzC17eYyn6ERJ/ikOSP+ivg7+K/fGHwhamKU27wRzAnOCIpsrkAmRlsqakDai9wjKRIZgYm" +
			"Ygo7uhUX1F7gGIkFnrMCITlysAuFjKJc7gaBy4Ml6jtsf1GUIrHgdgK8rRxZm4axCGW7OQihXizJ" +
			"L8NIkJIMHE5SRbP98O4Jlvz4jiWSKtrZUOxsoJXEgtl+cHk4UshgGxIL0qMKu5IUqWmElojAjmoa" +
			"OUFSJBCFQBTHMHC4nylFx/LNPXJ1AAAAAElFTkSuQmCC"
	}
};
/** 默认图标组：ELEC_BUG（电子虫） */
const iconDefault02: IconGroup = {
	x12: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAA1klEQVR4AYXBQUoCUQAA0Df6RUGC" +
			"ilm0mQiS6AhGV/AQs2gZreo8zgE6hpBHaKEgFLkZWikkTE44oExF+V6E0rin0p/YJ3jqMVqqZIk/" +
			"xU0GM0FU2isvbAX9KVmikr4wTHiYkxd2ssRWQ12WkB7yeOovQd39nLMWt28ql21OWnQiPkobDXV5" +
			"QfpK/slFm6uun4K6m2OKkoMmizXDd5X0yFawFTd5XjFaqtzF9NpMVuoilLKEvCAOdgI6DRZr8kLl" +
			"uivYiJt+KbBY+yYqBRuDmX+Nz1X6U19vtjrO4KkkgAAAAABJRU5ErkJggg=="
	},
	x16: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABT0lEQVR4AZXBsUobYQAA4C/xB9Ne" +
			"sIaSXoTQoZObmUta7xEUutusnRxKxjbQB/AFhLxAoLh2Ooo4ax8ggwSCi2jIGVuQlhwUYqyafl8B" +
			"v3Vitla4uCHp+x9BJ2YzYndIt04ntpB0TJoJtlbYHXI8oTWwkEaJpEyaCS5u6NZpDfj6kpNrD9oo" +
			"sX1KEpkKkj6dWO7kmqRPM6IW6F26I31lVjCvGdGtUwusLrF/7iFF82qBWqBUZH3ZY4J5vUtWl1hf" +
			"5uNQrlzk3TO5OJgV/Mv+uVvaVfq/5ApuCeaVi7SrvI34nsn1RvyYyL2vmBXMigMfnvNtzKczmhGv" +
			"n9L/6T5Fswo4uuIwkzvMOLqiXXWfYFYc+BK7o/GEN5HcRklup8JmJPirUWL71EKOJ7QG7K0JptIx" +
			"SZkk8qidCq0Bn19wMBJMpRlpZiFJxN4aByM6Z/4AnotWmTPQ44sAAAAASUVORK5CYII="
	},
	x24: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAABuElEQVR4AbXBT0uTcQAA4Gfr53ph" +
			"GgUeFAzqTbBLzA8gtKRjdPZo38Ad+gpdJPwKStc+gLe9wi7dGl66pGDhRgQS/uk9SIY/2IvZhs7W" +
			"85Rw5lyW8rQq2jqmvmMUgoted0UvJoxK0ExFtYT1A1EtoZm6sXbOyr5zQb3K6y4bB7RORI2OG1uo" +
			"Mp/oCUapdSKaregJto55MUEtodERrU3Tzg2lltDouCyo74iyVKGdU98RPaiIuqfkvwyUpfoJrrI7" +
			"J3q2S3ZkWGWDPKhw9kSh+ZDle4ZV9p+VDdI95dmuQqPD5qFhBYPkv8iOePVVtHlI91RhMrA6rTB3" +
			"Wz/BVdYP/GUq8PIOJVcKrlIfV/iUi55PsDjO0p5CluonGCSUmBljfUbhzTeUWKyytOc6gkFmxtid" +
			"o7StsH5ftLTnusr6eVolSylt+8PyF7IjstR1lfXz4ScLn/X1/gdvv9N65DqCfuYqvLtvoLu3eHyb" +
			"ZqpQSxRqCc3UueCy1gmNjqFtoHUianSYDKxOCS5aqBq1oOdjznzCbMWN1BIaHdHaNO2crWNBz8q+" +
			"f5KlTAZRO6e+41wwSqtToq1jPb8B87dz196ROt0AAAAASUVORK5CYII="
	},
	x32: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACgElEQVR4AcXBTUvbdwAA4CfpLyZN" +
			"KMbNtcrMkM1SDy31OIiH5NYP0ENvEbb7GBN2rLuMwgbtByjE3nqYh11Gjz1Y6NhFsYde6mh1pC97" +
			"iTrTlNRl+AfFqJHYZO55Ymja0bykxZ0qUyv+S3H7LdT55iXVLSchbr/FOjMvWPvHSQial7RVylLK" +
			"6rnYkh3BtoU6i3WR+U2RH9YYDHoqn2asz17Bth/XmXmhxXRFz83mGOuzV7Dti/cpDYjMrTFdYf4T" +
			"Pkzoid8aTD5xmOBO1a5SlsEgMpKg0eRBTVfyaUYS2gmmVuwqZbV4UGNqRVdmcxQy2gk6dbWf74ZF" +
			"fq5x7ZleiOvE1X6unGE0wWiCyymmBhgKuhXXie+H+WzArvEk5RHGU7oV9z8LOvGwRj3FhaRIdYvF" +
			"OtUt3YrrxLVn3Hhl12KdwjILr3Ur6NS9DYq/ilS3HGriNDeHtRhP8qapnaBTz9/y/G9tTZzmYoqY" +
			"Ywl65dawSGFZi9kchYx2gk5dOcPXH2jxZUXk5jC3/+JR3XEFnfg0zfkkMa0upkRieFRn4bXjCjpx" +
			"9yPub1JY1uL+xyKFZe8q7ij5NOUc377k9p8OuPGKuXXKOcaT3kXcUYYCxQw/bTC/6YB7G/xSo5jh" +
			"fJKhhOOKO8rcOqOPWW1o62GN0cd8NcjdnOMKjpJPU87pyIWkSDmnRT7tgHLOjqCd1QYjCYoZHXnT" +
			"FClmHLDaEPn9LU8bFDP0x8meErQz+UTPTVeYrojMnOP6WcF++TTlnJ764y3TFT5/j3xGZCJlW7Df" +
			"WB9jfXrqaYPpCpMZSll7BXvFlvTcbI5CRovYkh1xJ6E/zsw5LqfsF5yE7Cmun3WYfwEzYqJZhV44" +
			"ygAAAABJRU5ErkJggg=="
	},
	x48: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAC9ElEQVR4AdXBwW7adhzA8a+9n5u0" +
			"MAVrlZIqRMByWI499uADL7DTesgtIL/ADn2Jan2FCnraHmE3UolKu2zSFKmiEqhkOGuqpSKHQAFT" +
			"MdUSFGd/FgzExp+PBoyYVjChlEap6EC5zTrRiTlhlvdDOGzh+WUPtoV1JMzSG8HxFZ7eiHUlFEx8" +
			"rAQzWQkiVe1Cvc80oZRmbrYJtklkig7U+0wTxt4PoTdiwnGZcFwitWuAoCSMHbbg+Aolq0GkmgeQ" +
			"MVDRiTlh7Oc96I2YOHPBauCp7sOuQajOXLAa3EQY2xF8NL5IG5AxCJXGXISig4+VANtE6Xkbqh1u" +
			"lZUA22ReQrnNf9gmStUOlNvcOttkXsKy8kl8zl2o9QmLsKxKDp8Xl1BoERadmBMWkU9CJYfSUQqO" +
			"UnDqQrbGbdOJOZ2Y04k5YRHnLry4xHOUwqc+gFdduBgSBmERtT4UWniOUvi86kKhRViEZZ26+FwM" +
			"udGmDjuC0n0hCGFZ2RqBPboHlRyroBNzQpiePYAftuCPj5B7g9LjLfhph3kJYbovkDXgdADNAUoX" +
			"Q4IQllXaQ+nDEJ68w/PsAXwj8LoHRQfOh6yKsKxCCqVTF568w/N4CzIGFB0ot1klYRGpr+DhXTwv" +
			"Oyh9+AT5JJ7fP0JzAOdDVk1YxMO7UMnh0U5Qyt6Bt9/hyb2B5oDboBNzQhClNJTS8LID2gn/qzkA" +
			"7QRP8wAyBhQdKLdZJZ2YE4J4+g/8egWXnwjk8C/Y1OH7r6HyLfzZgx//ZhWEIGp9OL4isN+6eAom" +
			"5BOgsTJCEFaCpezfwbMtUDBRshLMZCW4TgjCNsE2WdrBBpTSBGabYJtME+bhuITOcZlwXHw2NdgW" +
			"PhPmYTWIlNXAJ5+ESo7PdGJOmGXXgLcHRObMBauBp7oPuwYTmxpjwiwCZA0io/FF2oCMgYpwXbUL" +
			"RYfIWAmwTZSet6HaYZpwXb0P9T6Rsk2Uqh0ot5kmrKsNDfJJPBsaswjrakegkuMmOjH3L6L9xwH4" +
			"jAeOAAAAAElFTkSuQmCC"
	}
};
/** 默认图标组：CAMERA（相机） */
const iconDefault03: IconGroup = {
	x12: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAABQUlEQVR4AX3BsWoTYQAA4O+Sn1MS" +
			"C71KNG6BOjg6imRwzkMUpcUnaCczZhBapK6agPQRBH2CIOITOEjJ0CESmxNtgh5JT+6HrH5fgtJG" +
			"t8njBs93RG/mfFoyXtioqWzXGbTZqbNGb0Jvwho7dQZttusqNZXDFiFhL2M3pSgpSnZT9jJCwmFL" +
			"Jeg2+bKkkzKci540Ra9+iHpbTAq6TcHTjP1M9Pqe/xrlgv2MoykHGcOcRw0e3BB9/cvnJQcZw5zj" +
			"tqDyp+T0UlRivBDdDlxdc3pJSFSCUc6LFlfXovsp46Wo2+DhTdGtGqNc8C7n/S86KR9/i7oN0bML" +
			"UW+LScF8LRgvGLQJCS/bfF9xPBMdtbgb+FZwJ9CfqqmczFiVnOWcF6QJacJ5wVnOquRkphJUfq7p" +
			"T+k2qeNDR/R2znxNf2rjHz/3ZoKr0MwfAAAAAElFTkSuQmCC"
	},
	x16: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACGElEQVR4AVXBMWhcBQAA0Pf//dR/" +
			"yTXYy9W7VKTgFLfQSTBDxmwKHV1ELIJLupTq0n63QsXGQRBUFKeMGTvpLQcOUgoirRCKILH/28S0" +
			"ae7u5/K9L/1ycPdegNK0TsRKzLUWl+oq94bc3udhTlqYFqA0kbTNuD9UWa2bkWQmQhNbF+j22X5K" +
			"XtIbsHPEzhG9AXnJ9lO6fbYumIi8kLTZOWJrmXbE7yf8lrPeUIkDNhpsLpEVXH1M0ibJRDqRSnrK" +
			"t4cMx3zzD58t04pU9gvWH/FBk3pIeqrSiURWYt5e5OIZNhrcPeatBZXS/5YivntNZaPBpTqrMd2+" +
			"wOM3SnFAHBIHHI9V+mPakUpWsBCqNELyknxMXop0Ij79m/UF8pK0UPn+kK9fVbmyx3vnVDoRcUC3" +
			"z81XhKbdemJGb0BvYMatJ6aFsoLNJbafcf08uyMuL3Jnmd0RuyPuLHN5kd0R18+z/YzNJbJCzS95" +
			"4s155gLW5jn8lwcnZAXNGs0aWcGDE5o11uY5KYlDruypyceJszW+OuCvgkcjbmSsLVAPVQ4KPtqj" +
			"FfHzkB8OmQu4+1wkLVQ6c7x/jk7Euy/z+T7PxypnQ356nZWXSAt+zVXSQg2Jbp+rLb444MsD5kL+" +
			"POXHY/4YcfEMg5JPUnoD3lnk49QLAUoTSduM+0OV1boZSWYiMi3J6ESsxFxr8WFT5d6Q2/s8zEkL" +
			"0/4Dsj7FA/TH/Y8AAAAASUVORK5CYII="
	},
	x24: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAADiUlEQVR4Aa3BX2jUBQAA4O/ufrep" +
			"u+k2G04789yK9iIZPSQ5aUKID74lkj3dKvAlCp9mD5H45ECQRU9BeD6EID7XKdEmXWAvMp8ycG7T" +
			"K6dz3uxuf9zvtsV+csOJIYLfF8OS5xntZFvSKmMhmeueJ/B/0kl+6xA5dItvt3DhocjBDXzxDyOd" +
			"InuGKYaeJfC0/Y30tvJggZ6iSG8r303yS1lkvEpvKz1Fkf4ttCTomyBf9qQEjqv5rIW31vJrhauz" +
			"/FTmm00MTvPzv4xXqSxyr0oQ48B6+u+ziD8f8fZa2uu4OqsmrmZ/I+11xDyWipNtJtvEpTLjVSvG" +
			"q1yqkG0i20wqLhJDex37G9UEao61kisxXuVkG2/W88cMl6fZsYZMnVUa41yeJtvMu+v46xHHxmkL" +
			"ONZKvmxZYFk6yeQClUUK03x9l95Wum+KFDpIJ61SDOkaFil00DdBYZr9jUwukE5SDMWwZLSTbJHB" +
			"Ctlmss103/RCBtvJlciV6E6RS5O5LlAzsN0qSzu8sPcbOJMWGQstSxjpPC6dJO7lSiX4pEVcJkmA" +
			"o3e4WLHibpW9IyKHb3Ntzoprcxy+LbJ3hLtVKy5WOHqHAJmkQM3QHDvX8vsMhWk+amKwInJlhqkF" +
			"fiiJvF7HlRmRwQpzS/RN0NXAeJWhOTVxT7sxT77imQrTFKY9U77CjXlPC9TsXMPUgkgmydAs3SmR" +
			"XesYDWlKiIyG7Fon0p1iaJZMkqkFkZ1r1MSNhVRxejPFkGLIkRZO3Wdgu8i5reTL7G5gdwP5Mue2" +
			"igxs59R9jrRQDCmGnN5MFWOhGJaMdrIt6aUaC8lcF6jZO8JghWwz2Wa6b3ohg+3kSuRKdKfIpS0L" +
			"LOsapn8LryS48JDJBQoddA2LFDp4NWmVv0O6hkUKHfRNMFDh4AYON9E1bFlgWTFkY4JUnK4GTmyi" +
			"s56BdpG+CcqLVmmMM9Au8s5aTmziqyVScTYmKIaWBWpOTrCngTfq6b9vxZk0PUVG562SqaO7gZ4i" +
			"Z0siexpETk6oiavJlxmZJ+axyiK5Emen2NdIW2BFW8C+FGenyJWoLIrEMDJPvqwmgeNqrs6SjPH5" +
			"RjrqubfA0BwfNzGPe1VScT5o5MB6vn9Apo5PW3hvHT9Ocf6hJwWeli+TL5NOUugQOXSL/s20BSIf" +
			"rufLO5x/TaRrmGLoWWJY8jyjnWxLWmUsJHPd8/wH8MFA51Vj3wEAAAAASUVORK5CYII="
	},
	x32: {
		format: Base64ImgType.BASE64_PNG, data:
			"iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAE0UlEQVR4AcXBX0zU9wEA8M/9+cHt" +
			"jhJOsYjBcLAm8DCnL53LauL5tifTpMnSPolZn7qH0UyTZS/iG419YHtuAibbYzMflr1yJG6z2UOl" +
			"zRpIHBxqd62gMMqdd5xwi98Eco5DMV26zyeGhpdRGORsRkszZfILXkbSQYx205UQFMoUN7mQ5fqq" +
			"4EKW66sU64z1CNa2mFjxIkkHMdpNfyQ4tyi4kGVqTXAhy9SaYHpAsFRnYsWLxNDQSnGY/kgwME9x" +
			"U1AYFOQXPKMwKMgvCHJtLA4Jlurk5rSSwJhmr7VzvpNKgy9qzFb50zccizjfyRY+q3Gz7BlHI/69" +
			"xbGIjQbr2/REzFb5osaRJBsNHm1plsCYZuc7mezjZ3eZWuXGOpVtzncy2cdvvub3q/a4WWYTf+zn" +
			"08f8tcKNdW6s848a04N8+pjbVc2Smi0O8+dvGJjnD8c5FtnVEXdg13q50mPXv+oMzHP5CFd6GJiz" +
			"I6lZLiITp7jJ3yr8OM0baT5eZ2NbcCJFLtLSKwmurwk64rzVyV8q3KpQ3CQTJxdplrSfSyVGsryR" +
			"5lKJ4qagMMjZjJZmyuQXBLk23urko0dMrdpPDA2j3fyym3MLbGyz8oSb32e2yrVl7td50hAcjUjF" +
			"tFRt8FVdkIzRF3H5CCdTnPkn3Uk64kwP8tsVJlYkPdWVIBeRz9g11E4D+Yxv5YcphtoZydqVi+hK" +
			"eCqp2WSfZ5xJcybtf2KyTytJ04Pk2nznLmQ5mxGXz5CLBDNl5mv2+OQx8zXBbJXZqj1mq8xWBfM1" +
			"Pnlsj/kaM2VBLiKfEdcsv8D4sj3evsv4smC0xGjJHqMlRkuC8WXevmuP8WXyC5rF7eede3yw7Lne" +
			"L/F+yXN9sMw79+wnaT+3KqRinut21QvN1bhVsZ+4/7OYxomGHYUys1VurDN6mGKdG+uMHmaoneF2" +
			"bleZrTK1ykhWMLXKSJaTKU6lmKsxX2PiIW92kouYeMibnZxMkc/YkTRTpr+NXEQ+Q7UhOJ2mvSo4" +
			"neZoUnAqZdfJlF0nU5xKCYbb6UrgIUPtnErhIUPt5DOCYp2lTTE0jPVw5VXfqasPGPtaUrOL9+36" +
			"sJe5Gh898q28e4jhdi6V7JrssyPpqbUtluoUymxss/KEdw/xWZVCmft1njQERyNSMS1VG3xVFyRj" +
			"9EX8KC2YWqU7SUecpTprW56KoWFH4wTX1xi5JxjJMtnHwDzFTUFhkLMZLc2UyS8Icm0sDnHxPlOr" +
			"gqnjXOgi9rkdSfv5sJfTacG1Xja2BR+vM7WqpVcSTB4XdMQFPz/ED1JcKmklqdlSnco2uTZ+kuZY" +
			"xFKd179HR5zDCa6vUtjQUr6D3/XycIuNbZbqHI9IpMm1Udlmqa5ZUrPcHCNZFocYmKe4addIlsk+" +
			"B3KpxNSqXbk2Foe4eJ/3vtQshoZmr7VzJs3radJxweUSXQnOpDmRYnmL8Qee8etXOZLg8yo3K6xt" +
			"ca1XUNnm7xVuVrhT0yzpv92pcafGWA/9keDq19ypcadGYVAw/sAzftoh+FVJkGtjpEuwVOcXX2ol" +
			"hoYXKQ7THwnOLQqmBzi3KJge4NyiYHpAsFQnN+dFkg5iYoWuhCCfIRcJRrrsGumiWOfqA8HaloOI" +
			"oeFlFAY5m9HSTJn8gpfxH3cBrKHxf7fOAAAAAElFTkSuQmCC"
	},
	x48: {
		format: Base64ImgType.BASE64_PNG, data:
			"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"
	}
};

/** 默认桌面背景图片 */
const imgDesktopBg: IBase64Img = {
	format: Base64ImgType.BASE64_JPG, data:
		'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' +
		'gCrIxaKJjksy8kn0JH8gP5dMCiiigD//2Q=='
};

/**
 * Jade UI 资源管理
 *
 * 提供默认图标组的注册与查询，支持按尺寸获取 Base64 图片。
 */
export namespace JadeUIResource {

	let iconGroupMap = new SimpleMap<DefaultIconGroup, IconGroup>();
	iconGroupMap.put(DefaultIconGroup.ELEC_FACE, iconDefault01);
	iconGroupMap.put(DefaultIconGroup.ELEC_BUG, iconDefault02);
	iconGroupMap.put(DefaultIconGroup.CAMERA, iconDefault03);

	/**
	 * 按名称获取默认图标组
	 * @param name - 图标组名称
	 * @returns {IconGroup} 图标组，未知名称时回退到 ELEC_FACE
	 */
	export function getDefaultIcon(name: DefaultIconGroup): IconGroup {
		const grp = iconGroupMap.get(name);
		if (!grp) {
			console.warn(`Unknown DefaultIconGroup: ${name}, fallback to ELEC_FACE`);
			return iconDefault01;
		}
		return grp;
	}

	/**
	 * 按名称和尺寸获取默认图标的 Base64 字符串
	 * @param name - 图标组名称
	 * @param size - 图标尺寸
	 * @returns {string} Base64 格式的图片数据 URI，未找到时返回空字符串
	 */
	export function getDefaultIconBase64(name: DefaultIconGroup, size: IconSize): string {
		const img = pickIconSize(getDefaultIcon(name), size);
		return img ? `${img.format},${img.data}` : "";
	}

	/** 默认桌面背景图片 */
	export const defaultDesktopBackground = imgDesktopBg;

	/** 图标名（字符串形式）到内置图标组的映射，给注册表用 */
	const nameMap: Record<string, DefaultIconGroup> = {
		"ELEC_FACE": DefaultIconGroup.ELEC_FACE,
		"ELEC_BUG":  DefaultIconGroup.ELEC_BUG,
		"CAMERA":    DefaultIconGroup.CAMERA,
	};

	/**
	 * 内置资源的 provider 实现
	 *
	 * 注册表按字符串取图标（库层不该知道 `DefaultIconGroup` 有哪些值），
	 * 所以这里做一层枚举名到枚举值的转换。省略 `name` 时给 `ELEC_FACE`。
	 */
	export const defaultProvider: IUIResourceProvider = {
		getIconGroup(name?: string): IconGroup | undefined {
			if (name === undefined) { return getDefaultIcon(DefaultIconGroup.ELEC_FACE); }
			const key = nameMap[name];
			// 这里和 getDefaultIcon() 不同：注册表的契约是「没有就返回
			// undefined」，不兜底、不打 warn，由调用方决定怎么退化
			return key === undefined ? undefined : getDefaultIcon(key);
		},
		getDesktopBackground(): IBase64Img | undefined { return imgDesktopBg; },
	};

}

/**
 * 把内置资源注册给窗口 UI
 *
 * 不调用则窗口没图标、桌面没背景图（外观交给 CSS）。
 * 这是 opt-in 的 —— 见本文件头部的说明。
 *
 * @returns {void}
 */
export function registerDefaultUIResource(): void {
	registerUIResourceProvider(JadeUIResource.defaultProvider);
}

