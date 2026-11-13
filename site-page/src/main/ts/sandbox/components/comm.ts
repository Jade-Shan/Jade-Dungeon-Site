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
	title?: string;
	events?: {
		click?: (e: PointerEvent) => void;
	}
};

export class UIButton {

	public static createElem(cfg: BtnCfg) : HTMLButtonElement {
		let elem: HTMLButtonElement = document.createElement('button');
		UIComponent.initElemt(elem, cfg);
		elem.textContent = cfg.textContent;
		if (cfg.title) { elem.title = cfg.title; }
		if (cfg.events) {
			if (cfg.events.click) {
				let click = cfg.events.click;
				elem.addEventListener('click', (e) => { click(e); });
			}
		}
		return elem;
	}

};


/* 区框 */
export interface FldsetCfg extends CpmtCfg {
	title?: string;
};

export class UIFieldset {

	public static createElem(cfg: FldsetCfg) : HTMLFieldSetElement {
		let elem: HTMLFieldSetElement = document.createElement('fieldset');
		UIComponent.initElemt(elem, cfg);
		const legend = document.createElement('legend');
		if (cfg.title) { legend.textContent = cfg.title; }
		elem.appendChild(legend);
		UIComponent.initElemt(elem, cfg);
		return elem;
	}

};

export interface TableCol {
	id?: string,
	name?: string,
	title: string,
	field?: string,
	classList?:Array<string>,
};

export interface TableCfg<T> extends CpmtCfg {
	readonly cols: Array<TableCol>,
	readonly rec2Row: (rec: T) => HTMLTableRowElement;
	readonly styleNames: {
		readonly selectedRow: string,
	}
};

export class UITable<T> extends UIComponent {

	private readonly elem: HTMLTableElement = document.createElement('table');
	private readonly thead: HTMLTableSectionElement = document.createElement('thead');
	private readonly body: HTMLTableSectionElement = document.createElement('tbody');
	private readonly cfg: TableCfg<T>;

	constructor(cfg: TableCfg<T>) {
		super();
		this.cfg = cfg;

		UIComponent.initElemt(this.elem, cfg);

		const tr = document.createElement('tr');
		for (const ccol of cfg.cols) {
			const th = document.createElement('th');
			th.textContent = ccol.title;
			if (ccol.classList && ccol.classList.length > 0) {
				for (const cname of ccol.classList) {
					th.classList.add(cname);
				}
			}
			tr.appendChild(th);
		}
		this.thead.appendChild(tr);

		this.elem.appendChild(this.thead);
		this.elem.appendChild(this.body);
	}

	public getTable() {
		return this.elem;
	}

	public cleanRecs() {
		// 只清 tbody 里的行，保留 thead（列头）和 tbody 本身。
		// 之前用 this.elem.replaceChildren() 会把整张表（含 thead / tbody）都摘掉，
		// 之后 appendRow 仍往旧的 this.body 上加行，而那些行已脱离 DOM ——
		// 表现为「表格内容被清空」，连表头也没了。
		this.body.replaceChildren();
	}

	public appendRow(rec: T) {
		this.body.appendChild(this.cfg.rec2Row(rec));
	}

	/**
	 * 查询前选中的哪些行
	 * @returns 
	 */
	public getSelectedRows(): Array<HTMLTableRowElement> {
		const tr = this.body.querySelector<HTMLTableRowElement>(`tr.${this.cfg.styleNames.selectedRow}`);
		return tr ? [tr] : [];
	}

	/**
	 * 选中一行
	 * @param match 
	 * @param callback 
	 */
	public selectRows(match: (tr: HTMLTableRowElement) => boolean, callback: () => void): void {
		for (const tr of this.body.querySelectorAll<HTMLTableRowElement>('tr')) {
			tr.classList.toggle(this.cfg.styleNames.selectedRow, 
				// tr.dataset.campaignId === String(campaignId)
				match(tr)
				);
		}
		callback();
	}

};