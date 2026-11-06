import { workItems, initWorkItems } from "./workout.js";


export class TestWorkout {

	static testShowWorkoutItem() {
		// 肌肉图改为按需构建，用之前要先初始化
		initWorkItems();

		let baseDiv = document.querySelector("#test-workout-images");
		if (!baseDiv) {
			throw new Error("页面缺少必需元素 #test-workout-images");
		}
		for (let i=0; i<workItems.length;i++){
			let info = workItems[i].info;
			let pose = workItems[i].pose;
			let font = workItems[i].font;
			let back = workItems[i].back;
			let itemDiv = document.createElement("div");
			baseDiv.appendChild(itemDiv);
			itemDiv.setAttribute("id", `work-itm-${info.id}`);
			//
			let title = document.createElement("h1");
			title.innerText = info.name;
			itemDiv.appendChild(title);
			//
			itemDiv.appendChild(pose);
			itemDiv.appendChild(font);
			itemDiv.appendChild(back);
		}
	}
}