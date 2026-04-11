export class AxtBase {
  constructor(runtime, id, name) {
    this.runtime = runtime;
    this.id = id;
    this.name = name;
    this.blocks = [];
    this.api = {};
    this.store = {};
    this._contexts = new Map();
  }

  _registerBlock(blockId, module) {
    const { info, func } = module;
    const fullOpcode = `${blockId}`;

    const blockDefinition = {
      ...info,
      opcode: fullOpcode,
      text: info.text || `${blockId}`,
      func: fullOpcode,
    };

    this.blocks.push(blockDefinition);
    if (typeof func === "function") {
      this[fullOpcode] = func.bind(this);
    }
  }

  _addLabel(text) {
    if (text === "---") {
      this.blocks.push("---");
    } else {
      this.blocks.push({
        blockType: "label",
        text: text,
      });
    }
  }

  setContext(util, data) {
    if (util && util.thread) {
      this._contexts.set(util.thread, data);
    }
  }

  getContext(util) {
    if (util && util.thread) {
      return this._contexts.get(util.thread);
    }
    return null;
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      blocks: this.blocks,
    };
  }
}
