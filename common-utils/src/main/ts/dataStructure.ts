/**
 * 保持插入顺序的 Map 实现
 *
 * 基于数组存储键值对，遍历顺序与插入顺序一致。
 * 适用于需要按插入顺序迭代的场景，同时也提供 O(n) 的查找/删除操作。
 *
 * @typeParam K - 键的类型
 * @typeParam T - 值的类型
 */
export class SimpleMap<K, T> {

	/** 内部存储的键值对数组，按插入顺序排列 */
	recs: Array<[K, T]>;

	/**
	 * @param recs - 可选的初始键值对数组
	 */
	constructor(recs?: Array<[K, T]>) {
		this.recs = recs ? recs : new Array();
	}

	/**
	 * 返回 Map 中键值对的数量
	 * @returns {number} 元素个数
	 */
	size(): number { return this.recs.length; }

	/**
	 * 判断 Map 是否为空
	 * @returns {boolean} 无元素时返回 true
	 */
	isEmpty(): boolean { return this.recs.length === 0; }

	/**
	 * 移除所有键值对
	 * @returns {void}
	 */
	removeAll(): void { this.recs = new Array(); }

	/**
	 * 存入键值对。若键已存在则更新其值，否则追加到末尾
	 *
	 * @param key - 键
	 * @param value - 值
	 * @returns {void}
	 */
	put(key: K, value: T): void {
		for (let i = 0; i < this.recs.length; i++) {
			if (this.recs[i][0] === key) {
				this.recs[i][1] = value;
				return;
			}
		}
		this.recs.push([key, value]);
	}

	/**
	 * 根据键获取对应的值
	 *
	 * @param key - 键
	 * @returns {T | null} 对应的值，不存在时返回 null
	 */
	get(key: K): (T | null) {
		for (let i = 0; i < this.recs.length; i++) {
			let r = this.recs[i];
			if (r[0] === key) {
				return r[1];
			}
		}
		return null;
	}

	/**
	 * 根据键移除对应的键值对
	 *
	 * @param key - 键
	 * @returns {void}
	 */
	remove(key: K): void {
		for (let i = 0; i < this.recs.length; i++) {
			if (this.recs[i][0] === key) {
				this.recs.splice(i, 1);
				return;
			}
		}
	}

	/**
	 * 根据索引获取键值对
	 *
	 * @param idx - 索引（从 0 开始）
	 * @returns {[K, T] | null} 对应索引的键值对，索引越界时返回 null
	 */
	getElementByIndex(idx: number): ([K, T] | null) {
		if (idx < 0 || idx >= this.recs.length) {
			return null;
		}
		return this.recs[idx];
	}

	/**
	 * 判断 Map 中是否包含指定键
	 *
	 * @param key - 键
	 * @returns {boolean} 包含时返回 true
	 */
	containsKey(key: K): boolean {
		for (let i = 0; i < this.recs.length; i++) {
			if (this.recs[i][0] === key) {
				return true;
			}
		}
		return false;
	}

	/**
	 * 判断 Map 中是否包含指定值
	 *
	 * @param value - 值
	 * @returns {boolean} 包含时返回 true
	 */
	containsValue(value: T): boolean {
		for (let i = 0; i < this.recs.length; i++) {
			if (this.recs[i][1] === value) {
				return true;
			}
		}
		return false;
	}

	/**
	 * 获取所有键，按插入顺序排列
	 *
	 * @returns {Array<K>} 键数组
	 */
	keys(): Array<K> {
		let arr: Array<K> = [];
		for (let i = 0; i < this.recs.length; i++) {
			arr.push(this.recs[i][0]);
		}
		return arr;
	}

	/**
	 * 获取所有值，按插入顺序排列
	 *
	 * @returns {Array<T>} 值数组
	 */
	values(): Array<T> {
		let arr: Array<T> = [];
		for (let i = 0; i < this.recs.length; i++) {
			arr.push(this.recs[i][1]);
		}
		return arr;
	}

}

/**
 * 基于数组的栈实现（后进先出）
 *
 * @typeParam T - 元素类型
 */
export class SimpleStack<T> {

	/** 内部存储的数组，末尾为栈顶 */
	recs: Array<T>;

	/**
	 * @param recs - 可选的初始元素数组，按顺序依次入栈
	 */
	constructor(recs?: Array<T>) {
		this.recs = recs ? recs : new Array();
	}

	/**
	 * 将一个或多个元素压入栈顶
	 *
	 * @param elems - 要入栈的元素
	 * @returns {void}
	 */
	push(...elems: Array<T>): void {
		for (let elem of elems) {
			this.recs.push(elem);
		}
	}

	/**
	 * 弹出栈顶元素
	 *
	 * @returns {T | null} 栈顶元素，栈为空时返回 null
	 */
	pop(): (T | null) {
		if (this.recs.length < 1) {
			return null;
		}
		let c = this.recs.pop();
		return c !== undefined ? c : null;
	}

	/**
	 * 返回栈中元素个数
	 * @returns {number} 元素个数
	 */
	size(): number {
		return this.recs ? this.recs.length : 0;
	}

	/**
	 * 判断栈是否为空
	 * @returns {boolean} 无元素时返回 true
	 */
	isEmpty(): boolean {
		return this.recs.length < 1;
	}

	/**
	 * 查看栈顶元素但不弹出
	 *
	 * @returns {T | null} 栈顶元素，栈为空时返回 null
	 */
	getTop(): (T | null) {
		if (this.recs.length < 1) {
			return null;
		}
		return this.recs[this.recs.length - 1];
	}

	/**
	 * 移除栈中所有元素
	 * @returns {void}
	 */
	removeAll(): void {
		this.recs = new Array();
	}

	/**
	 * 将栈内容转为字符串（从栈顶到栈底）
	 *
	 * @returns {string} 元素的字符串表示
	 */
	toString(): string {
		let arr: Array<T> = new Array();
		if (this.recs.length > 0) {
			for (let i = this.recs.length - 1; i > -1; i--) {
				arr.push(this.recs[i]);
			}
		}
		return arr.toString();
	}

}


/**
 * 基于数组的队列实现（先进先出）
 *
 * @typeParam T - 元素类型
 */
export class SimpleQueue<T> {

	/** 内部存储的数组，头部为队首 */
	recs: Array<T>;

	/**
	 * @param recs - 可选的初始元素数组，按顺序依次入队
	 */
	constructor(recs?: Array<T>) {
		this.recs = recs ? recs : new Array();
	}

	/**
	 * 将一个或多个元素加入队尾
	 *
	 * @param elems - 要入队的元素
	 * @returns {void}
	 */
	push(...elems: Array<T>): void {
		for (let elem of elems) {
			this.recs.push(elem);
		}
	}

	/**
	 * 从队首取出元素
	 *
	 * @returns {T | null} 队首元素，队列为空时返回 null
	 */
	pop(): (T | null) {
		if (this.recs.length < 1) {
			return null;
		}
		let c = this.recs.shift();
		return c !== undefined ? c : null;
	}

	/**
	 * 返回队列中元素个数
	 * @returns {number} 元素个数
	 */
	size(): number {
		return this.recs ? this.recs.length : 0;
	}

	/**
	 * 判断队列是否为空
	 * @returns {boolean} 无元素时返回 true
	 */
	isEmpty(): boolean {
		return this.recs.length < 1;
	}

	/**
	 * 查看队首元素但不弹出
	 *
	 * @returns {T | null} 队首元素，队列为空时返回 null
	 */
	getHead(): (T | null) {
		if (this.recs.length < 1) {
			return null;
		}
		return this.recs[0];
	}

	/**
	 * 查看队尾元素但不弹出
	 *
	 * @returns {T | null} 队尾元素，队列为空时返回 null
	 */
	getTail(): (T | null) {
		if (this.recs.length < 1) {
			return null;
		}
		return this.recs[this.recs.length - 1];
	}

	/**
	 * 移除队列中所有元素
	 * @returns {void}
	 */
	removeAll(): void {
		this.recs = new Array();
	}

	/**
	 * 将队列内容转为字符串（从队首到队尾）
	 *
	 * @returns {string} 元素的字符串表示
	 */
	toString(): string {
		let arr: Array<T> = new Array();
		if (this.recs.length > 0) {
			for (let i = 0; i < this.recs.length; i++) {
				arr.push(this.recs[i]);
			}
		}
		return arr.toString();
	}
}
