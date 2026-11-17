export interface EventCfg {
	mouseClick?: (e: PointerEvent) => void;
	keyDown?: (e: KeyboardEvent) => void;
	change?: () => void;
}

export interface CpmtCfg {
	id?: string,
	name?: string,
	classList?: Array<string>,
	events?: EventCfg,
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
		if (cfg.events) {
			if (cfg.events.mouseClick) {
				let click = cfg.events.mouseClick;
				elem.addEventListener('click', (e) => { click(e); });
			}
			if (cfg.events.keyDown) {
				let press = cfg.events.keyDown;
				elem.addEventListener('keydown', (e) => { press(e); })
			}
			if (cfg.events.change) {
				let change = cfg.events.change;
				elem.addEventListener('change', () => { change(); });
			}
		}
	}

}




export interface BtnCfg extends CpmtCfg {
	textContent: string;
	title?: string;
};

export class UIButton {

	public static createElem(cfg: BtnCfg): HTMLButtonElement {
		let elem: HTMLButtonElement = document.createElement('button');
		UIComponent.initElemt(elem, cfg);
		elem.textContent = cfg.textContent;
		if (cfg.title) { elem.title = cfg.title; }
		return elem;
	}

};


/* 区框 */
export interface FldsetCfg extends CpmtCfg {
	title?: string;
};

export class UIFieldset {

	public static createElem(cfg: FldsetCfg): HTMLFieldSetElement {
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
	headClassList?: Array<string>,
	rowClassList?: Array<string>,
	canResize?: boolean
};

export interface TableCfg<T> extends CpmtCfg {
	readonly wrapId?: string,
	readonly wrapperClass?: Array<string>,
	readonly bodyId?: string,
	readonly cols?: Array<TableCol>,
	readonly rec2Row?: (rec: T) => HTMLTableRowElement,
	readonly styleNames?: {
		readonly dragColWidth?: Array<string>,
		readonly selectedRow?: string,
	}
};

export class UITable<T> extends UIComponent {

	private readonly panel: HTMLDivElement = document.createElement('div');
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


		if (cfg.wrapId) { this.panel.id = cfg.wrapId; }
		// 表格（98.css 没有 grid 辅助，sunken-panel 里放整宽表格）
		// 表格外面套一层 sunken-panel：给表格内凹边框 + 固定尺寸
		this.panel.classList.add('sunken-panel');
		if (cfg.wrapperClass) {
			for (let str of cfg.wrapperClass) {
				if (str && str.length > 0) {
					this.panel.classList.add(str);
				}
			}
		}
		this.panel.appendChild(this.table);

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
		(cfg.cols ?? []).forEach((ccol, i) => {
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
				document.body.classList.remove('col-resizing');
			};
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
			document.body.classList.add('col-resizing');
		});
	}


	public getElem() { return this.panel; }
	public getInnerTable() { return this.table; }
	public getBody() { return this.body; }

	public cleanRecs() {
		// 只清 tbody 里的行，保留 thead（列头）和 tbody 本身。
		// 之前用 this.elem.replaceChildren() 会把整张表（含 thead / tbody）都摘掉，
		// 之后 appendRow 仍往旧的 this.body 上加行，而那些行已脱离 DOM ——
		// 表现为「表格内容被清空」，连表头也没了。
		this.body.replaceChildren();
	}

	public appendRec(rec: T) {
		if (!this.cfg.rec2Row) { return; }
		this.body.appendChild(this.cfg.rec2Row(rec));
	}
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

export interface InputFieldCfg extends CpmtCfg {
	readonly wrapId?: string,
	readonly wrapperClass?: Array<string>,
	readonly readonly?: boolean,
	readonly fieldName?: string,
	readonly placeholder?: string,
}

export abstract class InputField<W extends HTMLElement, T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, V> implements UIComponent {

	abstract getField(): T;

	abstract getElem(): W;

	abstract setValue(value: V): void;

	abstract getValue(): V;

	abstract setDisable(disable: boolean): void;

	/**
	 * 这里只收下 cfg，**不碰 DOM**。
	 *
	 * 原来的实现直接 `UIComponent.initElemt(this.getElem(), cfg)`，
	 * 但 `getElem()` 是抽象方法、返回子类的 `input` / `textArea` 等字段，
	 * 而子类字段初始化器要等 `super()` 返回之后才执行 ——
	 * 基类构造函数执行到这一行时 `this.getElem()` 还是 `undefined`，
	 * 去点它的 `classList` 就抛 "can't access property classList, elem is undefined"。
	 *
	 * 所以把初始化下沉到各子类构造函数里、字段就绪之后再调
	 * `UIComponent.initElemt()`。
	 */
	public constructor(_cfg: InputFieldCfg) {}

	/**
	 * 把 `InputFieldCfg` 应用到一个**已经就绪**的控件元素上。
	 *
	 * 通用项（`id` / `name` / `classList` / `events`）交给 `UIComponent.initElemt`，
	 * 输入框专属项在这里补：
	 *
	 * - `fieldName` → `data-field`：让测试/脚本按字段名定位控件
	 *   （`sandboxEditCampaign` 的 `fieldValue` / `setField` 就靠它）
	 * - `placeholder` / `readonly` → 同名 DOM 属性
	 *
	 * 各子类构造函数在字段初始化器跑完、元素就绪之后再调它。
	 */
	protected applyInputCfg(elem: T, cfg: InputFieldCfg): void {
		UIComponent.initElemt(elem, cfg);
		if (cfg.fieldName) {
			elem.dataset.field = cfg.fieldName; 
			elem.name = cfg.fieldName;
		}
		if (cfg.placeholder !== undefined) {
			(elem as unknown as HTMLInputElement).placeholder = cfg.placeholder;
		}
		if (cfg.readonly !== undefined) {
			(elem as unknown as HTMLInputElement).readOnly = cfg.readonly;
		}
	}
}


export interface TextIptCfg extends InputFieldCfg {
	readonly needMask?: boolean
}

export class UITextIpt extends InputField<HTMLInputElement, HTMLInputElement, string> {

	private readonly input: HTMLInputElement = document.createElement('input');

	public constructor(cfg: TextIptCfg) {
		super(cfg);
		this.applyInputCfg(this.input, cfg);
		this.input.type = cfg.needMask ? 'password' : 'text';
	}

	public getField() { return this.input; }

	public getElem() { return this.input; }

	public setValue(str: string) { this.input.value = str; }

	public getValue() { return this.input.value; }

	public setDisable(disable: boolean): void {
		this.input.disabled = disable;
	}
}

export interface TextAreaCfg extends InputFieldCfg {
	rows?: number,
}




export interface NumberIptCfg extends InputFieldCfg  {
}

export class UINumberInput extends InputField<HTMLInputElement, HTMLInputElement, string> {

	private readonly input: HTMLInputElement = document.createElement('input');

	public constructor(cfg: NumberIptCfg) {
		super(cfg);
		this.input.type = 'number';
		this.applyInputCfg(this.input, cfg);
	}

	public getField(): HTMLInputElement { return this.input; }

	public getElem(): HTMLInputElement { return this.input; }

	public setValue(n: string) { this.input.value = n; }

	public getValue() { return this.input.value; }

	public setDisable(disable: boolean): void {
		this.input.disabled = disable;
	}


}

export class UITextArea extends InputField<HTMLTextAreaElement, HTMLTextAreaElement, string> {

	private readonly textArea: HTMLTextAreaElement = document.createElement('textarea');

	public constructor(cfg: TextAreaCfg) {
		super(cfg);
		this.applyInputCfg(this.textArea, cfg);
		if (cfg.rows !== undefined) { this.textArea.rows = cfg.rows; }
	}

	public getField() { return this.textArea; }

	public getElem() { return this.textArea; }

	public setValue(value: any) { this.textArea.value = value; }

	public getValue() { return this.textArea.value; }

	public setDisable(disable: boolean): void {
		this.textArea.disabled = disable;
	}
}

export interface CheckBoxCfg extends InputFieldCfg  {
	label: string
}

export class UICheckBox extends InputField<HTMLDivElement, HTMLInputElement, string> {

	private readonly checkBox: HTMLInputElement = document.createElement('input');
	private readonly label = document.createElement('label');
	private readonly row: HTMLDivElement = document.createElement('div');

	public constructor(cfg: CheckBoxCfg) {
		super(cfg);
		this.checkBox.type = 'checkbox';
		this.applyInputCfg(this.checkBox, cfg);
		// 98.css 的 checkbox 用 `input + label` 相邻兄弟
		// 选择器画外观，所以 label 必须紧跟 input、且用 for 关联。
		this.label.htmlFor = this.checkBox.id;
		this.label.textContent = cfg.label;
		this.row.classList.add('field-row');
		this.row.append(this.checkBox);
		this.row.append(this.label);
	}

	public getField() { return this.checkBox; }

	public getElem() { return this.row; }

	public setValue(value: any) {
		if ('on' === value || 'On' === value || 'ON' == value) {
			this.checkBox.checked = true;
		}
	}

	public getValue() { return this.checkBox.checked ? "on" : "off"; }

	public setChecked(checked: boolean): void {
		this.checkBox.checked = checked;
	}

	public getChecked(): boolean { return this.checkBox.checked; }

	public setDisable(disable: boolean): void {
		this.checkBox.disabled = disable;
	}

}



export interface RadioCfg extends InputFieldCfg  {
	label: string,
	value: string,
	checked?: boolean
}

export class UIRadioIpt extends InputField<HTMLInputElement, HTMLInputElement, string> {

	private readonly radio: HTMLInputElement = document.createElement('input');
	private readonly label = document.createElement('label');

	public constructor(cfg: RadioCfg) {
		super(cfg);
		this.radio.type = 'radio';
		this.applyInputCfg(this.radio, cfg);
		this.radio.value = cfg.value;
		// 98.css 的 OptionButton：`input[type=radio]` 后面紧跟 `label`，
		// 圆点与选中点全靠这两个相邻选择器画出来 —— 别拆开，
		// 也不要用「label 包 input」，那会让 `+` 选择器失效。
		this.label.htmlFor = this.radio.id;
		this.label.textContent = cfg.label;
		// 选中态要真正写回 DOM —— 原来这里写 `this.radio.checked;` 是句
		// 读值表达式、什么都不做，导致「初始化选中值」永远落不到 DOM 上。
		this.radio.checked = cfg.checked === true;
	}

	public getField(): HTMLInputElement { return this.radio; }

	public getLabel(): HTMLLabelElement { return this.label; }

	public getElem(): HTMLInputElement { return this.radio; }

	public setValue(n: string) {  }

	public getValue() { return this.radio.value; }

	public setChecked(checked: boolean) { this.radio.checked = checked;}
	public getChecked(): boolean { return this.radio.checked; }

	public setDisable(disable: boolean): void {
		this.radio.disabled = disable;
	}

}

export class UIRadioGroup {

	private readonly radios: UIRadioIpt [] = [];

	constructor(name:string, items: Array<{label: string, value: string}>, currValue?: string, events?: EventCfg) {
		for (let i = 0; i < items.length; i++) {
			let itm = items[i];
			let radio = new UIRadioIpt({
				id: `fld-${name}-${i}`, name: name, 
				label: itm.label, value: itm.value,
				checked: currValue && currValue === itm.value ? true : false,
				events: events ? events : {}
			});
			this.radios.push(radio);
		}
	}

	public getValue(): string {
		let result = "";
		if (null != this.radios) {
			this.radios.forEach(rdo => {
				let r = rdo.getField();
				if (r.checked) { result = r.value; }
			});
		}
		return result;
	}

	public setValue(value: string): void {
		if (null != this.radios) {
			this.radios.forEach(rdo => {
				let r = rdo.getField();
				r.checked = (r.value === value);
			});
		}
	}

	public appendIn(parent: HTMLElement): void {
		if (null != this.radios && this.radios.length > 0) {
			this.radios.forEach(r => {
				parent.append(r.getField());
				parent.append(r.getLabel());
			});
		}
	}
}


export interface SelectListCfg extends InputFieldCfg  {
	items: Array<{label: string, value: string}>,
	currValue?: string
}

export class UISelectList extends InputField<HTMLSelectElement, HTMLSelectElement, string> {

	private readonly select: HTMLSelectElement = document.createElement('select');

	public constructor(cfg: SelectListCfg) {
		super(cfg);
		this.applyInputCfg(this.select, cfg);
		if (cfg) {
			if (cfg.items) {
				cfg.items.forEach(ot => {
					let opt = document.createElement('option');
					opt.textContent = ot.label;
					opt.value = ot.value;
					this.select.appendChild(opt);
				});
			}
			this.select.value = cfg.currValue ? cfg.currValue : '';
		}
	}


	public getField(): HTMLSelectElement { return this.select; }

	public getElem(): HTMLSelectElement { return this.select; }

	public setValue(n: string) { this.select.value = n; }

	public getValue() { return this.select.value; }

	public setDisable(disable: boolean): void {
		this.select.disabled = disable;
	}

}
