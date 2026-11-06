import { ICustomHandler, IRequestContext, IRequestData, HTTP_GET } from '@/types';

export const handler: ICustomHandler = {
	urlPtn: '/',
	method: HTTP_GET,
	bindFunc: (context: IRequestContext, _data: IRequestData) => {
	context.response.json({
		message: '欢迎来到 Jade Dungeon API 🐉~ du~dududu~',
		version: '1.0.0',
	});
}
};