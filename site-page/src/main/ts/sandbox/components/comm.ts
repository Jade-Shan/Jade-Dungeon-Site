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
	fieldName?: string,
	headClassList?:Array<string>,
	rowClassList?:Array<string>,
	canResize?: boolean
};

export interface TableCfg<T> extends CpmtCfg {
	readonly bodyId?: string,
	readonly cols: Array<TableCol>,
	readonly rec2Row: (rec: T) => HTMLTableRowElement;
	readonly styleNames?: {
		readonly dragColWidth?: Array<string>,
		readonly selectedRow?: string,
	}
};

export class UITable<T> extends UIComponent {

	private readonly table: HTMLTableElement = document.createElement('table');
	private readonly thead: HTMLTableSectionElement = document.createElement('thead');
	private readonly body: HTMLTableSectionElement = document.createElement('tbody');

	/** 每个数据列的 <col>，不含末尾删除列 —— 拖拽列宽时改它们的 width */
	private readonly colEls: HTMLTableColElement[] = [];

	private readonly cfg: TableCfg<T>;

	constructor(cfg: TableCfg<T>) {
		super();
		this.cfg = cfg;
		UIComponent.initElemt(this.table, cfg);

		if (cfg.styleNames?.dragColWidth) {
			for (const cname of cfg.styleNames.dragColWidth) {
				this.table.classList.add(cname);
			}
			// 不设 width:100% / tableLayout:fixed —— fixed 布局下没写宽度的列会「等分」
			// 表格宽度，配合 CSS 的 width:100% 就把窄内容列（如 owner）也拉宽了。
			// 保持 auto 布局则列宽按内容分配；拖拽改 <col> 的 width 仍能改宽
			//（改窄受内容下限约束，内容不会被截断）。
		}

		const tr = document.createElement('tr');
		const colgroup = document.createElement('colgroup');
		cfg.cols.forEach((ccol, i) => {
			// col-group
			const col = document.createElement('col');
			// 除非写明不能调节大小，否则默认可调节大小
			let canResize = true; // ccol.canResize && !ccol.canResize ? true : false; 
			if (canResize) {
				this.colEls.push(col);
			}
			colgroup.appendChild(col);
			// table head
			const th = document.createElement('th');
			th.textContent = ccol.title;
			if (canResize) {
				this.attachColResizer(th, i);
			}
			if (ccol.headClassList && ccol.headClassList.length > 0) {
				for (const cname of ccol.headClassList) {
					th.classList.add(cname);
				}
			}
			tr.appendChild(th);
		});
		this.thead.appendChild(tr);

		this.table.appendChild(colgroup);
		this.table.appendChild(this.thead);

		//
		if (cfg.bodyId) { this.body.id = cfg.bodyId; }
		this.table.appendChild(this.body);
	}

	/**
	 * 给表头列挂右侧的拖拽把手：按下把手后左右拖动改这一列的宽度。
	 * 宽度改在 `colEls[index]` 上（fixed 布局下它决定整列），
	 * 起点用 `<th>` 当前渲染宽度 —— 直接读 `<col>` 的 box 不可靠。
	 */
	private attachColResizer(th: HTMLTableCellElement, index: number): void {
		const handle = document.createElement('span');
		handle.className = 'col-resizer';
		th.appendChild(handle);

		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const col = this.colEls[index];
			if (!col) { return; }
			const startX = e.clientX;
			const startWidth = th.getBoundingClientRect().width;
			const MIN = 24;

			const onMove = (ev: MouseEvent): void => {
				const w = Math.max(MIN, startWidth + ev.clientX - startX);
				col.style.width = `${w}px`;
			};
			const onUp = (): void => {
				document.removeEventListener('mousemove', onMove);
				document.removeEventListener('mouseup', onUp);
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
			};
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';
		});
	}


	public getTable() { return this.table; }
	public getBody() { return this.body; }

	public cleanRecs() {
		// 只清 tbody 里的行，保留 thead（列头）和 tbody 本身。
		// 之前用 this.elem.replaceChildren() 会把整张表（含 thead / tbody）都摘掉，
		// 之后 appendRow 仍往旧的 this.body 上加行，而那些行已脱离 DOM ——
		// 表现为「表格内容被清空」，连表头也没了。
		this.body.replaceChildren();
	}

	public appendRec(rec: T) { this.body.appendChild(this.cfg.rec2Row(rec)); }
	public appendRow(row: HTMLTableRowElement) { this.body.appendChild(row); }

	/**
	 * 查询前选中的哪些行
	 * @returns 
	 */
	public getSelectedRows(): Array<HTMLTableRowElement> {
		let name = this.cfg.styleNames?.selectedRow ? this.cfg.styleNames.selectedRow : "highlighted";
		const tr = this.body.querySelector<HTMLTableRowElement>(`tr.${name}`);
		return tr ? [tr] : [];
	}

	/**
	 * 选中一行
	 * @param match 
	 * @param callback 
	 */
	public selectRows(match: (tr: HTMLTableRowElement) => boolean, callback: () => void): void {
		let name = this.cfg.styleNames?.selectedRow ? this.cfg.styleNames.selectedRow : "highlighted";
		for (const tr of this.body.querySelectorAll<HTMLTableRowElement>('tr')) {
			tr.classList.toggle(name, match(tr));
		}
		callback();
	}

};