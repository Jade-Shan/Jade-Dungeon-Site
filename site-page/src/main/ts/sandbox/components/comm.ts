export interface CpmtCfg {
	id?: string,
	name?: string,
	classList?: Array<string>;
};

export class UIComponent {

	public static initElemt(elem: HTMLElement, cfg: CpmtCfg) {
		if (cfg.id) { elem.id = cfg.id; }
		if (cfg.name) { elem.setAttribute('name', cfg.name); }
		if (cfg.classList && cfg.classList.length > 0) {
			for (let i = 0; i < cfg.classList.length; i++) {
				let clsname = cfg.classList[i];
				if (clsname && clsname.length > 0) {
					elem.classList.add(clsname);
				}
			}
		}
	}

}

export interface BtnCfg extends CpmtCfg {
	textContent: string;
	events?: {
		click?: (e: PointerEvent) => void;
	}
};

export class UIButton {

	public static initElemt(cfg: BtnCfg) : HTMLButtonElement {
		let elem: HTMLButtonElement = document.createElement('button');
		UIComponent.initElemt(elem, cfg);
		elem.textContent = cfg.textContent;
		if (cfg.events) {
			if (cfg.events.click) {
				let click = cfg.events.click;
				elem.addEventListener('click', (e) => { click(e); });
			}
		}
		return elem;
	}

}