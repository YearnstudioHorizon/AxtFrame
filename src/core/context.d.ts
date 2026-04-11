export interface AxtContext {
  /** 框架封装的 API 库 */
  api: any;
  /** 全局状态存储 */
  store: any;
  /** 设置当前线程上下文数据 */
  setContext(util: any, data: any): void;
  /** 获取当前线程上下文数据 */
  getContext(util: any): any;
}
