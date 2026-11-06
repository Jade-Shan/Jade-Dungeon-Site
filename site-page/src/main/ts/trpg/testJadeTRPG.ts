import { TimeUtil } from '@jade-dungeon/jade-utils/basic';
import { CanvasUtils, ImageClip } from '@jade-dungeon/jade-utils/canvas';
import {
	JadeUIResource, DefaultIconGroup, registerDefaultUIResource,
} from '@jade-dungeon/jade-utils/resource';
import { CircleToken, ICanvasFrame, ImageResource, LineToken, RectangleToken, SandTable, SandTableUtils, SceneDataResp } from "./sandtable.js";
import { JadeWindowUI, UIDesktop, UIObj, UIWindowAdapter, WinParam } from '@jade-dungeon/jade-utils/ui-window';
import { DemoEnvConfig, demoEnv } from "../env.demo.js";

export namespace TestJadeTRPG {

	/**
	 * @param env - 页面从 `envs.js` 注入的环境配置，用到 `apiRoot` 和 `themeRoot`
	 */
	export let testTrpgCompose = async (env?: DemoEnvConfig) => {
		let viewSize = 139;
		let apiRoot   = demoEnv(env, 'apiRoot'  );
		let themeRoot = demoEnv(env, 'themeRoot');
		// load image resource
		let imgProxyUrl = `${apiRoot}/api/sandtable/parseImage?src=`;
		let imgResources: ImageResource[] = [{
			"id": "icons", "type": "Image", //
			"url": `${themeRoot}/trpg/images/icons.jpg`},{
			"id": "map"  , "type": "Image", //
			"url": `${themeRoot}/trpg/images/map.jpg`
		}];
		await SandTableUtils.loadImageResources(imgResources, imgProxyUrl);
		//
		let imgUsr01 = { "imgKey": "icons", "sx": 100, "sy": 100, "width": 50, "height": 50 };
		let imgFnt01 = { "imgKey": "icons", "sx":   0, "sy":   0, "width": 50, "height": 50 };
		let imgEnm01 = { "imgKey": "icons", "sx": 100, "sy":   0, "width": 50, "height": 50 };
		//
		let bgImgClip: ImageClip = { "imgKey": "icons", "sx": 0, "sy": 0, "width": 300, "height": 300, "imageElem": imgResources[1].imgElem };
		let user = CircleToken.fromRecord({
			"type": "Circle", "id": "jade", "x": 153, "y": 152, "visible": true, "blockView": true, "color": "Blue", //
			"img": imgUsr01, "radius": 25 //
		}, imgResources);
		//
		let styleMith = {lineWidth: -3, strokeStyle: "Gray", imgClip: bgImgClip };
		/* ========================== */
		// test 001
		/* ========================== */
		let cvsCtx001 = document.querySelector<HTMLCanvasElement>("#testTrpg001")?.getContext("2d");
		if (null != cvsCtx001) {
			// load token from json
			user.draw(cvsCtx001);
		}
		/* ========================== */
		// test 002
		/* ========================== */
		let cvsCtx002 = document.querySelector<HTMLCanvasElement>("#testTrpg002")?.getContext("2d");
		if (null != cvsCtx002) {
			// load token from json
			let fnt = RectangleToken.fromRecord({ "type": "Rectangle", "id": "furnishing-1696391644699", //
				"x": 156, "y": 190, "width": 50, "height": 50, "visible": true, "blockView": false, "color": "Blue", //
				"img": imgFnt01
			}, imgResources);
			// draw image
			fnt.draw(cvsCtx002);
		}

		/* ========================== */
		// test 003
		/* ========================== */
		let cvsCtx003 = document.querySelector<HTMLCanvasElement>("#testTrpg003")?.getContext("2d");
		if (null != cvsCtx003) {
			// load token from json
			let line = LineToken.fromRecord({ "type": "Line", "id": "wall-1653882430769", 
				"x": 53, "y": 112, "x2": 160, "y2": 214, "color": "#0000FF", "visible": false, "blockView": true
			});
			// draw image
			line.draw(cvsCtx003);
		}
		/* ========================== */
		// test 004
		/* ========================== */
		let cvsCtx004 = document.querySelector<HTMLCanvasElement>("#testTrpg004")?.getContext("2d");
		if (null != cvsCtx004) {
			//
			let enm01 = CircleToken.fromRecord({"type": "Circle", "id": "enm01", "x": 150, "y":  80, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			let enm02 = CircleToken.fromRecord({"type": "Circle", "id": "enm02", "x":  80, "y": 150, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			let enm03 = CircleToken.fromRecord({"type": "Circle", "id": "enm03", "x": 220, "y": 150, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			let enm04 = CircleToken.fromRecord({"type": "Circle", "id": "enm04", "x": 150, "y": 220, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			//
			user .draw(cvsCtx004);
			enm01.draw(cvsCtx004);
			enm02.draw(cvsCtx004);
			enm03.draw(cvsCtx004);
			enm04.draw(cvsCtx004);
			//
			CanvasUtils.drawVertexShadowFrom(cvsCtx004, user.c.x, user.c.y, enm01, viewSize, {lineWidth: 1, strokeStyle: "red", fillStyle: "rgba(100,100,100,0.5)"});
			CanvasUtils.drawVertexShadowFrom(cvsCtx004, user.c.x, user.c.y, enm02, viewSize, {lineWidth: 1, strokeStyle: "red", fillStyle: "rgba(100,100,100,0.5)"});
			CanvasUtils.drawVertexShadowFrom(cvsCtx004, user.c.x, user.c.y, enm03, viewSize, {lineWidth: 1, strokeStyle: "red", fillStyle: "rgba(100,100,100,0.5)"});
			CanvasUtils.drawVertexShadowFrom(cvsCtx004, user.c.x, user.c.y, enm04, viewSize, {lineWidth: 1, strokeStyle: "red", fillStyle: "rgba(100,100,100,0.5)"});
		}
		/* ========================== */
		// test 005
		/* ========================== */
		let cvsCtx005 = document.querySelector<HTMLCanvasElement>("#testTrpg005")?.getContext("2d");
		if (null != cvsCtx005) {
			let enm01 = CircleToken.fromRecord({"type": "Circle", "id": "enm01", "x": 150, "y":  80, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			let enm02 = CircleToken.fromRecord({"type": "Circle", "id": "enm02", "x":  80, "y": 150, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			let enm03 = CircleToken.fromRecord({"type": "Circle", "id": "enm03", "x": 220, "y": 150, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			let enm04 = CircleToken.fromRecord({"type": "Circle", "id": "enm04", "x": 150, "y": 220, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			//
			CanvasUtils.drawVertexShadowFrom(cvsCtx005, user.c.x, user.c.y, enm01, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx005, user.c.x, user.c.y, enm02, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx005, user.c.x, user.c.y, enm03, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx005, user.c.x, user.c.y, enm04, viewSize, styleMith);
			//
			user .draw(cvsCtx005);
			enm01.draw(cvsCtx005);
			enm02.draw(cvsCtx005);
			enm03.draw(cvsCtx005);
			enm04.draw(cvsCtx005);
		}
		/* ========================== */
		// test 006
		/* ========================== */
		let cvsCtx006 = document.querySelector<HTMLCanvasElement>("#testTrpg006")?.getContext("2d");
		if (null != cvsCtx006) {
			let enm01 = CircleToken.fromRecord({"type": "Circle", "id": "enm01", "x": 100, "y": 100, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			let enm02 = CircleToken.fromRecord({"type": "Circle", "id": "enm02", "x": 200, "y": 100, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			let enm03 = CircleToken.fromRecord({"type": "Circle", "id": "enm03", "x": 100, "y": 200, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			let enm04 = CircleToken.fromRecord({"type": "Circle", "id": "enm04", "x": 200, "y": 200, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
			//
			CanvasUtils.drawVertexShadowFrom(cvsCtx006, user.c.x, user.c.y, enm01, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx006, user.c.x, user.c.y, enm02, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx006, user.c.x, user.c.y, enm03, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx006, user.c.x, user.c.y, enm04, viewSize, styleMith);
			//
			user .draw(cvsCtx006);
			enm01.draw(cvsCtx006);
			enm02.draw(cvsCtx006);
			enm03.draw(cvsCtx006);
			enm04.draw(cvsCtx006);
		}
		/* ========================== */
		// test 007
		/* ========================== */
		let cvsCtx007 = document.querySelector<HTMLCanvasElement>("#testTrpg007")?.getContext("2d");
		if (null != cvsCtx007) {
			//
			let fnt01 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt01", "x": 125, "y":  50, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources);
			let fnt02 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt02", "x":  50, "y": 125, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources);
			let fnt03 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt03", "x": 200, "y": 125, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources);
			let fnt04 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt04", "x": 125, "y": 200, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources);
			//
			CanvasUtils.drawVertexShadowFrom(cvsCtx007, user.c.x, user.c.y, fnt01, viewSize, {lineWidth: 1, strokeStyle: "Gray", fillStyle: "rgba(100,100,100,0.5)"});
			CanvasUtils.drawVertexShadowFrom(cvsCtx007, user.c.x, user.c.y, fnt02, viewSize, {lineWidth: 1, strokeStyle: "Gray", fillStyle: "rgba(100,100,100,0.5)"});
			CanvasUtils.drawVertexShadowFrom(cvsCtx007, user.c.x, user.c.y, fnt03, viewSize, {lineWidth: 1, strokeStyle: "Gray", fillStyle: "rgba(100,100,100,0.5)"});
			CanvasUtils.drawVertexShadowFrom(cvsCtx007, user.c.x, user.c.y, fnt04, viewSize, {lineWidth: 1, strokeStyle: "Gray", fillStyle: "rgba(100,100,100,0.5)"});
			//
			user .draw(cvsCtx007);
			fnt01.draw(cvsCtx007);
			fnt02.draw(cvsCtx007);
			fnt03.draw(cvsCtx007);
			fnt04.draw(cvsCtx007);
		}
		/* ========================== */
		// test 008
		/* ========================== */
		let cvsCtx008 = document.querySelector<HTMLCanvasElement>("#testTrpg008")?.getContext("2d");
		if (null != cvsCtx008) {
			//
			let fnt01 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt01", "x": 125, "y":  50, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources);
			let fnt02 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt02", "x":  50, "y": 125, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources);
			let fnt03 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt03", "x": 200, "y": 125, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources);
			let fnt04 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt04", "x": 125, "y": 200, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources);
			//
			CanvasUtils.drawVertexShadowFrom(cvsCtx008, user.c.x, user.c.y, fnt01, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx008, user.c.x, user.c.y, fnt02, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx008, user.c.x, user.c.y, fnt03, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx008, user.c.x, user.c.y, fnt04, viewSize, styleMith);
			//
			user .draw(cvsCtx008);
			fnt01.draw(cvsCtx008);
			fnt02.draw(cvsCtx008);
			fnt03.draw(cvsCtx008);
			fnt04.draw(cvsCtx008);
		}
		/* ========================== */
		// test 009
		/* ========================== */
		let cvsCtx009 = document.querySelector<HTMLCanvasElement>("#testTrpg009")?.getContext("2d");
		if (null != cvsCtx009) {
			let fnt01 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt01", "x":  60, "y":  60, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources); 
			let fnt02 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt02", "x": 180, "y":  60, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources);
			let fnt03 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt03", "x":  60, "y": 190, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources);
			let fnt04 = RectangleToken.fromRecord({"type": "Rectangle", "id": "fnt04", "x": 180, "y": 190, "visible": true, "blockView": true, "color": "Gray", "img": imgFnt01, "width": 50, "height": 50}, imgResources);
			//
			CanvasUtils.drawVertexShadowFrom(cvsCtx009, user.c.x, user.c.y, fnt01, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx009, user.c.x, user.c.y, fnt02, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx009, user.c.x, user.c.y, fnt03, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx009, user.c.x, user.c.y, fnt04, viewSize, styleMith);
			//
			user .draw(cvsCtx009);
			fnt01.draw(cvsCtx009);
			fnt02.draw(cvsCtx009);
			fnt03.draw(cvsCtx009);
			fnt04.draw(cvsCtx009);
		}
		/* ========================== */
		// test 010
		/* ========================== */
		let cvsCtx010 = document.querySelector<HTMLCanvasElement>("#testTrpg010")?.getContext("2d");
		if (null != cvsCtx010) {
			let wall01 = LineToken.fromRecord({"type": "Line", "id": "wall001", "x": 120, "y":  80, "x2": 180, "y2":  80, "visible": true, "blockView": true, "color": "Lime"});
			let wall02 = LineToken.fromRecord({"type": "Line", "id": "wall002", "x": 220, "y": 120, "x2": 220, "y2": 180, "visible": true, "blockView": true, "color": "Lime"});
			let wall03 = LineToken.fromRecord({"type": "Line", "id": "wall003", "x": 120, "y": 220, "x2": 180, "y2": 220, "visible": true, "blockView": true, "color": "Lime"});
			let wall04 = LineToken.fromRecord({"type": "Line", "id": "wall002", "x":  80, "y": 120, "x2":  80, "y2": 180, "visible": true, "blockView": true, "color": "Lime"});
			//
			CanvasUtils.drawVertexShadowFrom(cvsCtx010, user.c.x, user.c.y, wall01, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx010, user.c.x, user.c.y, wall02, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx010, user.c.x, user.c.y, wall03, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx010, user.c.x, user.c.y, wall04, viewSize, styleMith);
			//
			user  .draw(cvsCtx010);
			wall01.draw(cvsCtx010);
			wall02.draw(cvsCtx010);
			wall03.draw(cvsCtx010);
			wall04.draw(cvsCtx010);
		}
		/* ========================== */
		// test 011
		/* ========================== */
		let cvsCtx011 = document.querySelector<HTMLCanvasElement>("#testTrpg011")?.getContext("2d");
		if (null != cvsCtx011) {
			let wall01 = LineToken.fromRecord({"type": "Line", "id": "wall001", "x": 180, "y":  80, "x2": 220, "y2": 120, "visible": true, "blockView": true, "color": "Lime"});
			let wall02 = LineToken.fromRecord({"type": "Line", "id": "wall002", "x": 220, "y": 180, "x2": 180, "y2": 220, "visible": true, "blockView": true, "color": "Lime"});
			let wall03 = LineToken.fromRecord({"type": "Line", "id": "wall003", "x": 120, "y": 220, "x2":  80, "y2": 180, "visible": true, "blockView": true, "color": "Lime"});
			let wall04 = LineToken.fromRecord({"type": "Line", "id": "wall002", "x":  80, "y": 120, "x2": 120, "y2":  80, "visible": true, "blockView": true, "color": "Lime"});
			//
			CanvasUtils.drawVertexShadowFrom(cvsCtx011, user.c.x, user.c.y, wall01, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx011, user.c.x, user.c.y, wall02, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx011, user.c.x, user.c.y, wall03, viewSize, styleMith);
			CanvasUtils.drawVertexShadowFrom(cvsCtx011, user.c.x, user.c.y, wall04, viewSize, styleMith);
			//
			user  .draw(cvsCtx011);
			wall01.draw(cvsCtx011);
			wall02.draw(cvsCtx011);
			wall03.draw(cvsCtx011);
			wall04.draw(cvsCtx011);
		}
		/* ========================== */
		// test 012
		/* ========================== */
		let cvsCtx012 = document.querySelector<HTMLCanvasElement>("#testTrpg012")?.getContext("2d");
		if (null != cvsCtx012) {
			//
			user.draw(cvsCtx012);
			user.drawNextLocation(cvsCtx012,  80,  80);
			user.drawNextLocation(cvsCtx012, 220,  80);
			user.drawNextLocation(cvsCtx012,  80, 220);
			user.drawNextLocation(cvsCtx012, 220, 220);
		}
		/* ========================== */
		// test 013
		/* ========================== */
		let cvs013    = document.querySelector<HTMLCanvasElement>("#testTrpg013");
		let cvsCtx013 = document.querySelector<HTMLCanvasElement>("#testTrpg013")?.getContext("2d");
		let img01: HTMLImageElement | null = null;
		if (null != cvs013 && null != cvsCtx013 && bgImgClip.imageElem) {
			let shadowStyle = 'rgba(0, 0, 0, 0.7)';
			let oriMap = bgImgClip.imageElem;
			let imgWidth  = 300;
			let imgHeight = 300;
			let buff: ICanvasFrame = { cvs: cvs013, ctx: cvsCtx013 };
			//
			buff.cvs.width  = imgWidth;
			buff.cvs.height = imgHeight;
			buff.cvs.style.width  = `${imgWidth }px`;
			buff.cvs.style.height = `${imgHeight}px`;
			img01 = await SandTableUtils.drawDarkScene(buff, oriMap, shadowStyle);
		}
		/* ========================== */
		// test 014
		/* ========================== */
		let cvs014    = document.querySelector<HTMLCanvasElement>("#testTrpg014");
		let cvsCtx014 = document.querySelector<HTMLCanvasElement>("#testTrpg014")?.getContext("2d");
		let img02: HTMLImageElement | null = null;
		if (null != cvs014 && null != cvsCtx014 && bgImgClip.imageElem && img01 ) {
			let darkMapCLip: ImageClip = { "imgKey": "icons", "sx": 0, "sy": 0, "width": 300, "height": 300, "imageElem": img01 };
			let mistMapStyle = {imgClip: darkMapCLip};
			//
			let shadowStyle = 'rgba(0, 0, 0, 0.7)';
			let oriMap = bgImgClip.imageElem;
			let imgWidth  = 300;
			let imgHeight = 300;
			let buff: ICanvasFrame = { cvs: cvs014, ctx: cvsCtx014 };
			//
			buff.cvs.width  = imgWidth;
			buff.cvs.height = imgHeight;
			buff.cvs.style.width  = `${imgWidth }px`;
			buff.cvs.style.height = `${imgHeight}px`;
			await SandTableUtils.drawDarkScene(buff, oriMap, shadowStyle);
			img02 = await SandTableUtils.drawBrightScene(buff, oriMap, async (frame) => { 
				let enm01 = CircleToken.fromRecord({"type": "Circle", "id": "enm01", "x": 100, "y": 100, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
				let enm02 = CircleToken.fromRecord({"type": "Circle", "id": "enm02", "x": 200, "y": 100, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
				let enm03 = CircleToken.fromRecord({"type": "Circle", "id": "enm03", "x": 100, "y": 200, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
				let enm04 = CircleToken.fromRecord({"type": "Circle", "id": "enm04", "x": 200, "y": 200, "visible": true, "blockView": true, "color": "Red", "img": imgEnm01, "radius": 25}, imgResources);
				//
				CanvasUtils.drawVertexShadowFrom(cvsCtx014, user.c.x, user.c.y, enm01, viewSize, mistMapStyle);
				CanvasUtils.drawVertexShadowFrom(cvsCtx014, user.c.x, user.c.y, enm02, viewSize, mistMapStyle);
				CanvasUtils.drawVertexShadowFrom(cvsCtx014, user.c.x, user.c.y, enm03, viewSize, mistMapStyle);
				CanvasUtils.drawVertexShadowFrom(cvsCtx014, user.c.x, user.c.y, enm04, viewSize, mistMapStyle);
				//
				user .draw(cvsCtx014);
				enm01.draw(cvsCtx014);
				enm02.draw(cvsCtx014);
				enm03.draw(cvsCtx014);
				enm04.draw(cvsCtx014);
				await TimeUtil.sleep(500);
			 });
		}
		/* ========================== */
		// test 015
		/* ========================== */
		let cvs015    = document.querySelector<HTMLCanvasElement>("#testTrpg015");
		let cvsCtx015 = document.querySelector<HTMLCanvasElement>("#testTrpg015")?.getContext("2d");
		let img03: HTMLImageElement | null = null;
		if (null != cvs015 && null != cvsCtx015 && bgImgClip.imageElem && img01 && img02) {
			let imgWidth  = 300;
			let imgHeight = 300;
			let buff: ICanvasFrame = { cvs: cvs015, ctx: cvsCtx015 };
			let darkMapImage   = img01;
			let brightmapImage = img02;
			//
			buff.cvs.width  = imgWidth;
			buff.cvs.height = imgHeight;
			buff.cvs.style.width  = `${imgWidth }px`;
			buff.cvs.style.height = `${imgHeight}px`;
			img03 = await SandTableUtils.drawScopeOfVisionOnDarkMap(buff, darkMapImage, brightmapImage, user.c, viewSize);
		}
		/* ========================== */
		// test 016
		/* ========================== */
		let cvs016    = document.querySelector<HTMLCanvasElement>("#testTrpg016");
		let cvsCtx016 = document.querySelector<HTMLCanvasElement>("#testTrpg016")?.getContext("2d");
		if (null != cvs016 && null != cvsCtx016 && img03) {
			let imgWidth  = 300;
			let imgHeight = 300;
			let show: ICanvasFrame = { cvs: cvs016, ctx: cvsCtx016 };
			let viewMapImage = img03;
			//
			show.cvs.width  = imgWidth;
			show.cvs.height = imgHeight;
			show.cvs.style.width  = `${imgWidth }px`;
			show.cvs.style.height = `${imgHeight}px`;
			show.ctx.clearRect(0, 0, imgWidth, imgHeight);
			show.ctx.drawImage(viewMapImage, 0, 0, imgWidth, imgHeight, 0, 0, imgWidth, imgHeight);
			//
			user.drawNextLocation(show.ctx,  180, 250);
		}


		/* ================== */
		// test download
		/* ================== */
		// let testDownload = document.querySelector<HTMLCanvasElement>("#testTrpg001");
		// if (testDownload) { CanvasUtils.downloadCanvasImage(testDownload, 'png'); }

	}

	class TestCanvasWindow extends UIWindowAdapter {

		bufferCanvas: HTMLCanvasElement = document.createElement("canvas");
		finalCanvas : HTMLCanvasElement = document.createElement("canvas");

		constructor(desktop: UIDesktop, id: string, title: string, cfg?: WinParam) {
			super(desktop, id, title, cfg);
			let width  = 640;
			let height = 480;
			this.finalCanvas.id = `canvas-final-${id}`;
			this.finalCanvas.width  = width ;
			this.finalCanvas.height = height;
			this.finalCanvas.style.width  = `${width }px`;
			this.finalCanvas.style.height = `${height}px`;
			this.bufferCanvas.id = `canvas-buffer-${id}`;
			this.bufferCanvas.width  = width ;
			this.bufferCanvas.height = height;
			this.bufferCanvas.style.width  = `${width }px`;
			this.bufferCanvas.style.height = `${height}px`;
			this.bufferCanvas.style.display = `hidden`;
		}

		renderIn(): void {
			let renderWindowBody = (): HTMLDivElement => {
				let windowBody = this.ui.windowBody;
				windowBody.style.overflow = this.cfg.body.overflow;
				windowBody.style.width = `${this.cfg.body.initSize.width}px`;
				windowBody.style.height = `${this.cfg.body.initSize.height}px`;
				windowBody.style.overflowX = 'scroll';
				windowBody.style.overflowY = 'scroll';
				windowBody.appendChild(this.finalCanvas);
				return windowBody;
			}

			let renderStatusBar = (): HTMLDivElement => {
				let statusBar = document.createElement("div");
				statusBar.classList.add("status-bar");
				statusBar.innerHTML = `
					<p class="status-bar-field">Press F1 for help</p>
					<p class="status-bar-field">Slide 1</p>
					<p class="status-bar-field">canvas for map</p>
				`;
				return statusBar;
			}
			JadeWindowUI.renderWindowTplt(this, undefined, renderWindowBody, renderStatusBar);
		}

	}

	/**
	 * @param env - 页面从 `envs.js` 注入的环境配置，用到 `apiRoot` 和 `themeRoot`
	 */
	export let testTrpgUI = async (env?: DemoEnvConfig) => {
		// 用内置的那套图标和桌面背景，要在构造窗口之前调用
		registerDefaultUIResource();
		// window UI
		let desktop01 = document.getElementById(`test-desktop-01`)!;
		let desktop: UIDesktop = new UIDesktop(desktop01, { dockBar: { range: 300, maxScale: 1.8 } });
		let canvasWin = new TestCanvasWindow(desktop, "test-canvas-01", "Map-001", {
			icons: JadeUIResource.getDefaultIcon(DefaultIconGroup.ELEC_FACE),
			body: { initSize: { width: 640, height: 480 }, overflow: "scroll" }
		});
		canvasWin.renderIn();
		//
		let bufferCanvas = canvasWin.bufferCanvas;
		let finalCanvas  = canvasWin.finalCanvas;
		let bufferCvsCtx = canvasWin.bufferCanvas.getContext("2d")!;
		let finalCvsCtx  = canvasWin.finalCanvas .getContext("2d")!;
		// 
		finalCanvas.addEventListener("mousedown", e => {
			let rect = finalCanvas.getBoundingClientRect();
			CanvasUtils.drawPoint(finalCvsCtx, { x: e.clientX - rect.left, y: e.clientY - rect.top, radius: 3, fillStyle: "lime" });
		})

		// load sandtable
		let mapUrl = `${demoEnv(env, 'themeRoot')}/trpg/images/map.jpg`;
		let imgProxyUrl = `${demoEnv(env, 'apiRoot')}/api/sandtable/parseImage?src=`;
		// load image resource
		await SandTableUtils.loadImageResources(testSceneData.imgResources, imgProxyUrl);
		//
		let sandTable = new SandTable({ visibility: "default", //
			map: { imageUrl: mapUrl, width: 0, height: 0, shadowStyle: 'rgba(0, 0, 0, 0.7)' },
			frame: { 
				buff: {cvs: bufferCanvas, ctx: bufferCvsCtx},
				show: {cvs:  finalCanvas, ctx: finalCvsCtx }
			}
		});
		// 
		let user = CircleToken.fromRecord(testSceneData.mapDatas.teams[2], testSceneData.imgResources);
		await sandTable.drawSceneWithUserView([user], {proxyUrl: imgProxyUrl});
		//
		user.draw(finalCvsCtx)
	}

}


/* 沙盘场景的样例数据
 *
 * 这里的 URL 刻意保持明文写死，不走 `envs.js` 注入 —— 本常量是改造后端时的
 * 对比样本，明文形式便于和后端实际返回的 JSON 逐字段比对。
 * 代价是用到它的 `testTrpgUI()` 仍会按这些地址去取图。
 */
let testSceneData: SceneDataResp = {
  "username": "jade",
  "loginToken": "jade|a8dce1e8-63c3-4825-8932-5dd8f430aaa4|1747416892778",
  "imgResources": [
    {"id": "icons", "type": "Image", "url": "http://www.jade-dungeon.cn:8081/jadeutils.v3/themes/trpg/images/icons.jpg"},
    {"id": "map"  , "type": "Image", "url": "http://www.jade-dungeon.cn:8081/jadeutils.v3/themes/trpg/images/map.jpg"  }
  ],
  "mapDatas": {
    "teams": [
      {"id": "spectator", "x": 236, "y": 230, "visible": false, "blockView": false, "color": "#0000FF", "img": {"imgKey": "icons", "sx": 100, "sy": 150, "width": 50, "height": 50}, "type": "Circle", "radius": 25},
      {"id": "teo"      , "x": 240, "y": 299, "visible": true , "blockView": true , "color": "#0000FF", "img": {"imgKey": "icons", "sx": 100, "sy": 50 , "width": 50, "height": 50}, "type": "Circle", "radius": 25},
      {"id": "jade"     , "x": 344, "y": 152, "visible": true , "blockView": true , "color": "#0000FF", "img": {"imgKey": "icons", "sx": 100, "sy": 100, "width": 50, "height": 50}, "type": "Circle", "radius": 25}
    ],
    "creaters": [
      {"id": "orc1"                 , "x": 150, "y": 245, "visible": true, "blockView": true, "color": "#FF0000", "img": {"imgKey": "icons", "sx": 100, "sy":  0, "width":  50, "height":  50}, "type": "Circle", "radius": 25},
      {"id": "creater-1696391803781", "x": 150, "y": 550, "visible": true, "blockView": true, "color": "#0000FF", "img": {"imgKey": "icons", "sx":   0, "sy": 50, "width": 100, "height": 100}, "type": "Circle", "radius": 50}
    ],
    "furnishings": [
      {"id": "furnishing-1696391644699", "x":  56, "y": 590, "visible": true, "blockView": false, "color": "#0000FF", "img": {"imgKey": "icons", "sx": 0, "sy": 0, "width": 50, "height": 50}, "type": "Rectangle", "width": 62, "height": 57},
      {"id": "furnishing-1696391761836", "x": 189, "y": 587, "visible": true, "blockView": false, "color": "#0000FF", "img": {"imgKey": "icons", "sx": 0, "sy": 0, "width": 50, "height": 50}, "type": "Rectangle", "width": 61, "height": 58}
    ],
    "doors": [
      {"id": "door-1696391873911", "x": 539, "y": 161, "visible": true, "blockView": true, "color": "#0000FF", "img": {"imgKey": "icons", "sx": 0, "sy": 150, "width": 50, "height": 50}, "type": "Rectangle", "width": 23, "height": 64},
      {"id": "door-1696392071983", "x": 261, "y": 440, "visible": true, "blockView": true, "color": "#0000FF", "img": {"imgKey": "icons", "sx": 0, "sy": 150, "width": 50, "height": 50}, "type": "Rectangle", "width": 80, "height": 21}
    ],
    "walls": [
      {"id": "wall-1653882416304", "x":  87, "y": 342, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2":   7, "y2": 343},
      {"id": "wall-1653882423195", "x":  65, "y": 118, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2":  61, "y2": 345},
      {"id": "wall-1653882430769", "x": 253, "y": 112, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2":  60, "y2": 114},
      {"id": "wall-1653882436394", "x": 252, "y": 148, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 253, "y2":  38},
      {"id": "wall-1653882453537", "x": 342, "y":  38, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 238, "y2":  37},
      {"id": "wall-1653882460387", "x": 342, "y":   2, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 345, "y2":  53},
      {"id": "wall-1653882466531", "x": 456, "y":   1, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 459, "y2":  49},
      {"id": "wall-1653882472219", "x": 459, "y":  39, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 568, "y2":  45},
      {"id": "wall-1653882478634", "x": 563, "y":  39, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 562, "y2": 147},
      {"id": "wall-1653882484634", "x": 846, "y": 106, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 559, "y2": 109},
      {"id": "wall-1653882489986", "x": 854, "y":  24, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 851, "y2": 121},
      {"id": "wall-1653882549427", "x": 555, "y": 230, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 558, "y2": 300},
      {"id": "wall-1653882556026", "x": 154, "y": 451, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2":   8, "y2": 452},
      {"id": "wall-1653882561250", "x": 552, "y": 444, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 349, "y2": 447},
      {"id": "wall-1653882565866", "x": 543, "y": 447, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 548, "y2": 339},
      {"id": "wall-1653882644179", "x": 543, "y": 344, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 762, "y2": 342},
      {"id": "wall-1696391396938", "x": 246, "y": 760, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 258, "y2": 448},
      {"id": "wall-1696391405167", "x": 251, "y": 654, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2":  45, "y2": 653},
      {"id": "wall-1696391411067", "x":  40, "y": 654, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2":  49, "y2": 450},
      {"id": "wall-1696391417911", "x": 556, "y": 750, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 249, "y2": 755},
      {"id": "wall-1696391424165", "x": 552, "y": 754, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 555, "y2": 646},
      {"id": "wall-1696391428367", "x": 550, "y": 650, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 754, "y2": 653},
      {"id": "wall-1696391433055", "x": 541, "y": 550, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 755, "y2": 547},
      {"id": "wall-1696391437780", "x": 752, "y": 552, "visible": false, "blockView": true, "color": "#0000FF", "type": "Line", "x2": 755, "y2": 447}
    ]
  }
};
