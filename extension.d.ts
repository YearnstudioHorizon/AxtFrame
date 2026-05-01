// extension.d.ts

declare namespace Scratch {
  /**
   * Scratch 块类型定义
   */
  export enum BlockType {
    COMMAND = "command",
    REPORTER = "reporter",
    BOOLEAN = "boolean",
    HAT = "hat",
  }

  /**
   * Scratch 参数类型定义
   */
  export enum ArgumentType {
    STRING = "string",
    NUMBER = "number",
    BOOLEAN = "boolean",
    COLOR = "color",
    MATRIX = "matrix",
    NOTE = "note",
    ANGLE = "angle",
  }

  /**
   * 参数配置接口
   */
  export interface ArgumentInfo {
    type: ArgumentType;
    defaultValue?: string | number | boolean;
    menu?: string;
  }

  /**
   * 块定义结构
   */
  export interface BlockInfo {
    opcode: string;
    blockType: BlockType;
    text: string;
    arguments?: { [key: string]: ArgumentInfo };
    branchMode?: "single" | "loop";
    func?: string; // 如果省略，则默认为 opcode
    index?: number;
  }

  /**
   * 扩展元数据接口
   */
  export interface ExtensionMetadata {
    id: string;
    name: string;
    blockIconURI?: string;
    menuIconURI?: string;
    blocks: (BlockInfo | string)[]; // string 可以是 '---' 作为分割线
    menus?: {
      [key: string]: {
        acceptReporters: boolean;
        items: string[] | (() => any[]);
      };
    };
  }

  /**
   * 扩展基类接口
   */
  export interface Extension {
    getInfo(): ExtensionMetadata;
  }

  /**
   * 扩展注册对象
   */
  export const extensions: {
    register: (extension: Extension) => void;
    unsandboxed: boolean;
  };

  export const vm: {
    extensionManager: {
      refreshBlocks: () => void;
    };
  };
}
