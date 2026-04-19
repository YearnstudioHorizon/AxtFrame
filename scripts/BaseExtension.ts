// 定义积木的结构类型
interface BlockDefinition {
  opcode: string;
  text: string;
  [key: string]: any; // 允许 info 中其他属性的存在
}

// 定义积木模块接口
interface BlockModule {
  info: any;
  func: Function;
}
declare var Inject: { new (extension: any): { start(): void } };

export class AxtBase {
  // 定义成员变量类型
  public runtime: any;
  public id: string;
  public name: string;
  public blocks: any[];
  public api: Record<string, any>;
  public store: Record<string, any>;
  private _contexts: Map<any, any>;

  // 添加索引签名
  [key: string]: any;

  constructor(runtime: any, id: string, name: string) {
    this.runtime = runtime;
    this.id = id;
    this.name = name;
    this.blocks = [];
    this.api = {};
    this.store = {};
    this._contexts = new Map();

    // Blocy劫持防护
    if (typeof Inject !== "undefined") {
      try {
        new Inject(this).start();
      } catch (e) {
        console.error("[AxtFrame] Injector start failed:", e);
      }
    }
  }

  _registerBlock(blockId: string, module: BlockModule): void {
    const { info, func } = module;
    const fullOpcode = `${blockId}`;
    const handler = typeof func === "function" ? func : this.undefinedFunc;

    // 这里不再报错，因为类中定义了索引签名
    this[fullOpcode] = handler;

    const blockDefinition: BlockDefinition = {
      ...info,
      opcode: fullOpcode,
      text: info.text || `${blockId}`,
    };
    this.blocks.push(blockDefinition);
  }

  _addLabel(text: string): void {
    if (text === "---") {
      this.blocks.push("---");
    } else {
      this.blocks.push({
        blockType: "label",
        text: text,
      });
    }
  }

  setContext(util: any, data: any): void {
    if (util && util.thread) {
      this._contexts.set(util.thread, data);
    }
  }

  getContext(util: any): any {
    if (util && util.thread) {
      return this._contexts.get(util.thread);
    }
    return null;
  }

  getInfo(): object {
    return {
      id: this.id,
      name: this.name,
      blocks: this.blocks,
    };
  }
}
